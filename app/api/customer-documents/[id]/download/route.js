import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
import {checkRateLimit,clientIp} from "../../../../../lib/rate-limit";
export const runtime="nodejs";
const BUCKET="workteams-customer-documents";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const respond=(body,status=200)=>NextResponse.json(body,{status,headers:SAFE});
export async function GET(request,{params}){
 const limited=checkRateLimit("customer-document-download:"+clientIp(request),{limit:30,windowMs:60000});
 if(!limited.ok)return respond({error:"Too many requests."},429);
 const {id}=await params;
 if(!uuid.test(id||""))return respond({error:"Document not available."},404);
 const bearer=/^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get("authorization")||"")?.[1];
 if(!bearer)return respond({error:"Verified customer session required."},401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!secret)return respond({error:"Secure documents are unavailable."},503);
 const user=createClient(url,anon,{
  global:{headers:{Authorization:"Bearer "+bearer}},
  auth:{persistSession:false,autoRefreshToken:false}
 });
 try{
  const {data:verified,error:authError}=await user.auth.getUser(bearer);
  if(authError||!verified?.user?.id)return respond({error:"Verified customer session required."},401);
  // Do not ever query the private document table with a customer-supplied
  // company ID or token. DB authorization rechecks verified email, live
  // identity, grant, location, publication, company activation and expiry.
  const {data:allowed,error:scopeError}=await user.rpc(
   "authorize_workteams_customer_document_download",{p_document_id:id}
  );
  if(scopeError||allowed?.ok!==true||allowed.id!==id)return respond({error:"Document not available."},404);
  if(!uuid.test(allowed.company_id||"")||!uuid.test(allowed.location_id||"")||
    typeof allowed.storage_key!=="string"||
    !allowed.storage_key.startsWith(allowed.company_id+"/"+allowed.location_id+"/")||
    !/^[0-9a-f/-]+\.pdf$/i.test(allowed.storage_key))return respond({error:"Document not available."},404);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:file,error:storageError}=await admin.storage.from(BUCKET).download(allowed.storage_key);
  if(storageError||!file)return respond({error:"The private PDF could not be retrieved."},503);
  const bytes=await file.arrayBuffer();
  if(bytes.byteLength>8*1024*1024||bytes.byteLength<10)return respond({error:"Private PDF could not be verified."},503);
  // Authorization can change while the private object is loading. Recheck
  // current verified contact, approval, location, publication and expiry
  // immediately before sending bytes; never serve a former grant or a
  // document whose storage object changed after the initial authorization.
  const {data:reauthorized,error:revoked}=await user.rpc(
   "authorize_workteams_customer_document_download",{p_document_id:id}
  );
  if(revoked||reauthorized?.ok!==true||reauthorized.id!==id||
     reauthorized.company_id!==allowed.company_id||
     reauthorized.location_id!==allowed.location_id||
     reauthorized.storage_key!==allowed.storage_key)
   return respond({error:"Customer document access was withdrawn."},403);
  const rawName=String(reauthorized.file_name||"customer-document.pdf");
  const fileName=rawName.replace(/[^\p{L}\p{N} ._()-]/gu,"_").slice(0,140).replace(/"/g,"_");
  const encoded=encodeURIComponent(fileName.endsWith(".pdf")?fileName:"document.pdf");
  return new NextResponse(bytes,{status:200,headers:{
   ...SAFE,"Content-Type":"application/pdf",
   "Content-Disposition":"attachment; filename*=UTF-8''"+encoded,
   "Content-Length":String(bytes.byteLength),
   "X-Download-Options":"noopen"
  }});
 }catch(e){return respond({error:"Private document could not be accessed."},503)}
}
