import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createHmac,timingSafeEqual} from "node:crypto";
import {readPrivateB2MediaConfig,createPrivateMediaObjectKey,presignPrivateB2Object} from "../../../../lib/workteams-private-b2.mjs";
import {checkRateLimit,clientIp} from "../../../../lib/rate-limit";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const MAX_VIDEO_BYTES=500*1024*1024;
const PART_BYTES=20*1024*1024;
const NO_CACHE={"Cache-Control":"no-store"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers:NO_CACHE});
function serviceClient(){
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
}
async function userFor(req){
 const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!bearer)return null;
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{
   global:{headers:{Authorization:"Bearer "+bearer}},
 });
 const {data:{user}}=await db.auth.getUser();
 return user||null;
}
function signature(payload,config){
 const key=createHmac("sha256",config.appKey).update("workteams-b2-grants-v1").digest();
 return createHmac("sha256",key).update(payload).digest("base64url");
}
function encodeGrant(details,config){
 const payload=Buffer.from(JSON.stringify(details)).toString("base64url");
 return payload+"."+signature(payload,config);
}
function decodeGrant(value,config){
 if(typeof value!=="string"||value.length>12000)throw Error("Invalid private upload grant.");
 const [payload,mac,...extra]=value.split(".");
 if(!payload||!mac||extra.length)throw Error("Invalid private upload grant.");
 const expected=signature(payload,config);
 const given=Buffer.from(mac);
 const check=Buffer.from(expected);
 if(given.length!==check.length||!timingSafeEqual(given,check))throw Error("Untrusted private upload grant.");
 const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
 if(!data||Date.now()>data.expiresAt||data.expiresAt>Date.now()+60*60*1000||
    !Number.isSafeInteger(data.totalBytes)||data.totalBytes<1||data.totalBytes>MAX_VIDEO_BYTES||
    !Array.isArray(data.keys)||data.keys.length<1||data.keys.length>25)
   throw Error("Expired or invalid private upload grant.");
 return data;
}
async function authorized(db,user,companyId,entryId){
 const {data:member,error:memberError}=await db.from("company_members")
   .select("id").eq("company_id",companyId).eq("user_id",user.id).maybeSingle();
 if(memberError||!member)return null;
 const {data:entry,error:entryError}=await db.from("time_entries")
   .select("id,member_id,company_id").eq("id",entryId)
   .eq("company_id",companyId).eq("member_id",member.id).maybeSingle();
 if(entryError||!entry)return null;
 return member;
}
// Disabled until WorkTeams has its own B2 bucket/key and private playback
// integration. Never attach a B2 reference as approved proof in this route.
export async function POST(req){
 try{
   if(process.env.WORKTEAMS_B2_UPLOAD_ENABLED!=="true")
     return json({error:"Private B2 upload rollout is disabled."},503);
   const limit=checkRateLimit("workteams-b2:"+clientIp(req),{limit:100,windowMs:60_000});
   if(!limit.ok)return json({error:"Too many upload requests."},429);
   const config=readPrivateB2MediaConfig();
   if(!config)return json({error:"Private WorkTeams media storage is not configured."},503);
   const user=await userFor(req);
   if(!user)return json({error:"Sign in required."},401);
   const body=await req.json();
   const {action,companyId,entryId}=body||{};
   if(typeof companyId!=="string"||typeof entryId!=="string")
     return json({error:"Missing company or time entry."},400);
   const db=serviceClient();
   const member=await authorized(db,user,companyId,entryId);
   if(!member)return json({error:"Time entry does not belong to this employee."},403);
   if(action==="begin"){
     const totalBytes=Number(body.totalBytes);
     const mimeType=String(body.mimeType||"").toLowerCase();
     if(!Number.isSafeInteger(totalBytes)||totalBytes<1||totalBytes>MAX_VIDEO_BYTES||
        !["video/mp4","video/webm","video/quicktime"].includes(mimeType))
       return json({error:"Invalid recording size or format."},400);
     const partCount=Math.ceil(totalBytes/PART_BYTES);
     if(partCount>25)return json({error:"Recording exceeds private storage part limit."},400);
     const keys=Array.from({length:partCount},(_,i)=>createPrivateMediaObjectKey({
       productId:"workteams",companyId,entryId,kind:"shift_video",
     }));
     const details={companyId,entryId,memberId:member.id,userId:user.id,
       mimeType,totalBytes,keys,expiresAt:Date.now()+30*60_000};
     return json({grant:encodeGrant(details,config),parts:partCount,partBytes:PART_BYTES});
   }
   if(action!=="part"&&action!=="verify")
     return json({error:"Unknown private upload action."},400);
   const details=decodeGrant(body.grant,config);
   if(details.userId!==user.id||details.memberId!==member.id||
      details.companyId!==companyId||details.entryId!==entryId)
     return json({error:"Private upload grant does not match this shift."},403);
   if(details.keys.some(key=>!key.startsWith("workteams/"+companyId+"/"+entryId+"/video/")))
     return json({error:"Private media path mismatch."},403);
   if(action==="part"){
     const i=Number(body.partIndex);
     if(!Number.isSafeInteger(i)||i<0||i>=details.keys.length)
       return json({error:"Invalid recording part."},400);
     const bytes=Math.min(PART_BYTES,details.totalBytes-i*PART_BYTES);
     const grant=presignPrivateB2Object({config,method:"PUT",objectKey:details.keys[i],
       contentType:details.mimeType,expiresSeconds:120});
     return json({signedUrl:grant.signedUrl,headers:grant.headers,bytes});
   }
   // A successful PUT does not prove saved evidence. Verify every private B2
   // segment without writing an unplayable reference to shift_videos.
   let confirmed=0;
   const verified=[];
   for(let i=0;i<details.keys.length;i++){
     const head=presignPrivateB2Object({config,method:"HEAD",objectKey:details.keys[i],expiresSeconds:90});
     const response=await fetch(head.signedUrl,{method:"HEAD",cache:"no-store",
       redirect:"error",signal:AbortSignal.timeout(10000)});
     const expected=Math.min(PART_BYTES,details.totalBytes-i*PART_BYTES);
     const versionId=response.headers.get("x-amz-version-id");
     if(!response.ok||Number(response.headers.get("content-length"))!==expected||!versionId)
       return json({error:"Private recording segment could not be verified.",part:i+1},409);
     verified.push({key:details.keys[i],bytes:expected,versionId});
     confirmed+=expected;
   }
   const unsigned={kind:"workteams-b2-parts",version:1,mimeType:details.mimeType,
     bytes:confirmed,companyId,memberId:member.id,entryId,parts:verified,
     expiresAt:Date.now()+7*86400000};
   const index={...unsigned,signature:signature(Buffer.from(JSON.stringify(unsigned)).toString("base64url"),config)};
   const path=companyId+"/"+member.id+"/b2-"+signature(body.grant,config).slice(0,30)+".parts.json";
   const payload=JSON.stringify(index);
   const {error:indexError}=await db.storage.from("shift-videos").upload(
     path,new Blob([payload],{type:"application/json"}),{contentType:"application/json",upsert:false});
   if(indexError){
     const {data:existing,error:readError}=await db.storage.from("shift-videos").download(path);
     if(readError||!existing||(await existing.text())!==payload)
       return json({error:"Private recording verified, but index could not be saved."},503);
   }
   return json({status:"verified-not-attached",storagePath:path,bytes:confirmed,parts:verified.length});
 }catch(error){
   return json({error:"Private WorkTeams media upload is unavailable."},503);
 }
}
