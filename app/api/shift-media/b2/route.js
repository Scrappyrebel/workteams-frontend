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
async function authorized(db,user,companyId,entryId,quickVideo=false){
 const {data:member,error:memberError}=await db.from("company_members")
   .select("id").eq("company_id",companyId).eq("user_id",user.id).maybeSingle();
 if(memberError||!member)return null;
 // The separate quick-video upload screen has no time entry. A signed-in
 // member may upload only under their OWN member ID in this explicit mode.
 if(quickVideo)return entryId===member.id?member:null;
 const {data:entry,error:entryError}=await db.from("time_entries")
   .select("id,member_id,company_id").eq("id",entryId)
   .eq("company_id",companyId).eq("member_id",member.id).maybeSingle();
 if(entryError||!entry)return null;
 return member;
}
// B2 objects are versioned evidence. Never delete a part by an unsigned
// browser path or remove a held recording during scheduled retention.
async function removePrivateVideo(db,config,video,{expiredOnly}){
 const path=video.video_url;
 if(typeof path!=="string"||!path.endsWith(".parts.json")||
    !path.startsWith(video.company_id+"/"+video.member_id+"/b2-")||
    path.includes(".."))throw Error("Invalid private video address.");
 const {data:manifestBlob,error:readError}=await db.storage.from("shift-videos").download(path);
 if(readError||!manifestBlob||manifestBlob.size>18000)throw Error("Private video index missing.");
 const index=JSON.parse(await manifestBlob.text());
 const {signature:mac,...unsigned}=index||{};
 if(typeof mac!=="string")throw Error("Unsigned video manifest.");
 const expected=signature(Buffer.from(JSON.stringify(unsigned)).toString("base64url"),config);
 const a=Buffer.from(mac),b=Buffer.from(expected);
 if(a.length!==b.length||!timingSafeEqual(a,b))throw Error("Untrusted video manifest.");
 if(index.kind!=="workteams-b2-parts"||index.version!==1||
    index.companyId!==video.company_id||index.memberId!==video.member_id||
    !/^[0-9a-f-]{36}$/i.test(index.entryId)||
    !Array.isArray(index.parts)||index.parts.length<1||index.parts.length>25||
    !Number.isSafeInteger(index.bytes)||index.bytes<1||
    index.bytes>MAX_VIDEO_BYTES)throw Error("Video manifest scope failed.");
 const expectedPrefix="workteams/"+video.company_id+"/"+index.entryId+"/video/";
 let bytes=0;
 for(const part of index.parts){
   if(typeof part?.key!=="string"||!part.key.startsWith(expectedPrefix)||
      !Number.isSafeInteger(part.bytes)||part.bytes<1||part.bytes>PART_BYTES||
      typeof part.versionId!=="string"||!part.versionId)
     throw Error("Unsafe B2 deletion target.");
   bytes+=part.bytes;
 }
 if(bytes!==index.bytes)throw Error("B2 video manifest size mismatch.");
 for(const part of index.parts){
   if(expiredOnly){
     // An owner may have placed a hold since the cron selected this record.
     const {data:stillExpired,error}=await db.from("shift_videos")
       .select("id").eq("id",video.id).eq("company_id",video.company_id)
       .eq("keep_video",false).lte("video_expires_at",new Date().toISOString())
       .eq("video_url",path).maybeSingle();
     if(error||!stillExpired)throw Error("Evidence retention changed; preserving recording.");
   }
   const check=presignPrivateB2Object({config,method:"HEAD",objectKey:part.key,expiresSeconds:90});
   const head=await fetch(check.signedUrl,{method:"HEAD",cache:"no-store",
     redirect:"error",signal:AbortSignal.timeout(10000)});
   if(head.status===404)continue;
   if(!head.ok||Number(head.headers.get("content-length"))!==part.bytes||
      head.headers.get("x-amz-version-id")!==part.versionId)
     throw Error("Private B2 version could not be verified.");
   const signed=presignPrivateB2Object({config,method:"DELETE",objectKey:part.key,
     versionId:part.versionId,expiresSeconds:90});
   const done=await fetch(signed.signedUrl,{method:"DELETE",cache:"no-store",
     redirect:"error",signal:AbortSignal.timeout(10000)});
   if(!done.ok&&done.status!==404)throw Error("Private B2 version deletion failed.");
 }
 let rowDelete=db.from("shift_videos").delete().eq("id",video.id)
   .eq("company_id",video.company_id).eq("video_url",path);
 if(expiredOnly)rowDelete=rowDelete.eq("keep_video",false)
   .lte("video_expires_at",new Date().toISOString());
 const {data:removed,error:rowError}=await rowDelete.select("id").maybeSingle();
 if(rowError||!removed)throw Error("Could not finalize video retention.");
 const {error:cleanupError}=await db.storage.from("shift-videos").remove([path]);
 // The row and all B2 video bytes are already deleted. A stray small
 // manifest is not a recoverable video and must never be reported as such.
 return {deleted:true,indexCleanupPending:!!cleanupError};
}
// Disabled until WorkTeams has its own B2 bucket/key and private playback
// integration. Never attach a B2 reference as approved proof in this route.
export async function POST(req){
 try{
   const limit=checkRateLimit("workteams-b2:"+clientIp(req),{limit:100,windowMs:60_000});
   if(!limit.ok)return json({error:"Too many upload requests."},429);
   const config=readPrivateB2MediaConfig();
   if(!config)return json({error:"Private WorkTeams media storage is not configured."},503);
   const user=await userFor(req);
   if(!user)return json({error:"Sign in required."},401);
   const body=await req.json();
   const {action,companyId,entryId}=body||{};
   if(action!=="delete"&&process.env.WORKTEAMS_B2_UPLOAD_ENABLED!=="true")
     return json({error:"Private B2 upload rollout is disabled."},503);
   if(typeof companyId!=="string"||!companyId)
     return json({error:"Missing company."},400);
   const db=serviceClient();
   if(action==="delete"){
     const {data:manager}=await db.from("company_members").select("id,role")
       .eq("company_id",companyId).eq("user_id",user.id).maybeSingle();
     if(!manager||!["owner","admin"].includes(manager.role))
       return json({error:"Only managers may delete videos."},403);
     if(typeof body.videoId!=="string")return json({error:"Missing video ID."},400);
     const {data:video,error:readError}=await db.from("shift_videos")
       .select("id,company_id,member_id,video_url").eq("company_id",companyId)
       .eq("id",body.videoId).maybeSingle();
     if(readError||!video)return json({error:"Video not found."},404);
     try{await removePrivateVideo(db,config,video,{expiredOnly:false});}
     catch{return json({error:"Could not verify and delete every private video part."},503);}
     return json({deleted:true});
   }
   if(typeof entryId!=="string"||!entryId)
     return json({error:"Missing time entry."},400);
   const quickVideo=body.quickVideo===true;
   if(body.quickVideo!==undefined&&typeof body.quickVideo!=="boolean")
     return json({error:"Invalid quick video mode."},400);
   const member=await authorized(db,user,companyId,entryId,quickVideo);
   if(!member)return json({error:"Time entry or quick-video member does not belong to this employee."},403);
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
       quickVideo,mimeType,totalBytes,keys,expiresAt:Date.now()+30*60_000};
     return json({grant:encodeGrant(details,config),parts:partCount,partBytes:PART_BYTES});
   }
   if(action!=="part"&&action!=="verify")
     return json({error:"Unknown private upload action."},400);
   const details=decodeGrant(body.grant,config);
   if(details.userId!==user.id||details.memberId!==member.id||
      details.companyId!==companyId||details.entryId!==entryId||
      details.quickVideo!==quickVideo)
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
     expiresAt:details.expiresAt+7*86400000};
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

export async function GET(req){
 if(process.env.VERCEL_ENV!=="production"||
    !process.env.CRON_SECRET||
    req.headers.get("authorization")!=="Bearer "+process.env.CRON_SECRET)
   return json({error:"Not authorized."},403);
 if(process.env.WORKTEAMS_B2_RETENTION_ENABLED!=="true")
   return json({skipped:true,reason:"Private B2 retention not enabled."});
 try{
   const config=readPrivateB2MediaConfig();
   if(!config)return json({error:"Private media storage unavailable."},503);
   const db=serviceClient();
   const {data:expired,error}=await db.from("shift_videos")
     .select("id,company_id,member_id,video_url")
     .eq("keep_video",false).lte("video_expires_at",new Date().toISOString())
     .like("video_url","%/b2-%.parts.json").limit(10);
   if(error)return json({error:"Could not load expired private videos."},503);
   let removed=0,failed=0;
   for(const video of expired||[]){
     try{await removePrivateVideo(db,config,video,{expiredOnly:true});removed++;}
     catch{failed++;}
   }
   return json({checked:(expired||[]).length,removed,failed});
 }catch{
   return json({error:"Private media retention unavailable."},503);
 }
}
