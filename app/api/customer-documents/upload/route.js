import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {checkRateLimit,clientIp} from "../../../../lib/rate-limit";

export const runtime="nodejs";
const BUCKET="workteams-customer-documents";
const LIMIT=8*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const respond=(body,status=200)=>NextResponse.json(body,{status,headers});
function clients(request){
 const auth=request.headers.get("authorization")||"";
 const token=/^Bearer ([A-Za-z0-9._-]+)$/.exec(auth)?.[1];
 if(!token||!process.env.SUPABASE_SERVICE_ROLE_KEY)return null;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!anonKey)return null;
 return {
  token,
  user:createClient(url,anonKey,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}}),
  admin:createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 };
}
export async function POST(request){
 const limited=checkRateLimit("customer-document-upload:"+clientIp(request),{limit:8,windowMs:60000});
 if(!limited.ok)return respond({error:"Too many requests."},429);
 const length=Number(request.headers.get("content-length")||0);
 if(length>LIMIT+20000)return respond({error:"The PDF exceeds 8 MB."},413);
 const clientsForRequest=clients(request);
 if(!clientsForRequest)return respond({error:"Authenticated manager access required."},401);
 try{
  const {token,user,admin}=clientsForRequest;
  const {data:verified,error:authError}=await user.auth.getUser(token);
  if(authError||!verified?.user?.id)return respond({error:"Authenticated manager access required."},401);
  const form=await request.formData();
  const companyId=String(form.get("company_id")||"");
  const locationId=String(form.get("location_id")||"");
  const title=String(form.get("title")||"").trim();
  const file=form.get("document");
  if(!uuid.test(companyId)||!uuid.test(locationId)||title.length<3||title.length>120||
    !file||typeof file.arrayBuffer!=="function"||file.size<10||file.size>LIMIT||
    !/\.pdf$/i.test(file.name||"")||file.name.length>140 ||
    (file.type!=="application/pdf"&&file.type!=="application/octet-stream"))
    return respond({error:"Choose a PDF under 8 MB and a title of 3–120 characters."},400);
  // Permission is checked live on the authenticated user, never from a
  // customer-provided company/location or the service-role client alone.
  const {data:allowed,error:managerError}=await user.rpc("authorize_workteams_customer_document_upload",{
   p_company_id:companyId,p_location_id:locationId
  });
  if(managerError||allowed?.ok!==true||allowed.actor_user_id!==verified.user.id)
   return respond({error:"You are not authorized for this company's location."},403);
  const bytes=Buffer.from(await file.arrayBuffer());
  if(bytes.subarray(0,5).toString("ascii")!=="%PDF-"||
     !bytes.subarray(Math.max(0,bytes.length-2048)).toString("latin1").includes("%%EOF"))
   return respond({error:"The selected file is not a complete PDF."},400);
  const path=companyId+"/"+locationId+"/"+randomUUID()+".pdf";
  const uploaded=await admin.storage.from(BUCKET).upload(path,bytes,{
   contentType:"application/pdf",upsert:false,cacheControl:"0"
  });
  if(uploaded.error)return respond({error:"Could not privately store the PDF."},503);
  // Fail closed: every upload starts UNPUBLISHED, and the metadata is
  // never written to a public storage or customer account table.
  const inserted=await admin.from("workteams_customer_documents").insert({
   company_id:companyId,location_id:locationId,storage_key:path,
   title,file_name:file.name,mime_type:"application/pdf",
   uploaded_by:verified.user.id,published:false
  }).select("id").single();
  if(inserted.error||!inserted.data){
   await admin.storage.from(BUCKET).remove([path]);
   return respond({error:"PDF was not registered. No customer access was granted."},503);
  }
  return respond({ok:true,id:inserted.data.id,published:false},201);
 }catch(e){
  return respond({error:"Upload could not be completed; no publication was made."},500);
 }
}
