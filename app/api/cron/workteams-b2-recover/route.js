import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {readPrivateB2MediaConfig,presignPrivateB2Object} from "../../../../lib/workteams-private-b2.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
const STORAGE="shift-videos";
const PART_BYTES=20*1024*1024;
const SOURCE_MAX=40*1024*1024;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const HEADERS={"Cache-Control":"no-store"};
const json=(data,status=200)=>NextResponse.json(data,{status,headers:HEADERS});
const service=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth:{persistSession:false,autoRefreshToken:false}});

function sign(value,config){
 const key=createHmac("sha256",config.appKey).update("workteams-b2-grants-v1").digest();
 return createHmac("sha256",key).update(value).digest("base64url");
}
function signedIndex(unsigned,config){
 return {...unsigned,signature:sign(Buffer.from(JSON.stringify(unsigned)).toString("base64url"),config)};
}
function checkIndex(index,config){
 const {signature:mac,...unsigned}=index||{};
 if(typeof mac!=="string")throw Error("Unsigned private evidence index.");
 const expected=sign(Buffer.from(JSON.stringify(unsigned)).toString("base64url"),config);
 const a=Buffer.from(mac),b=Buffer.from(expected);
 if(a.length!==b.length||!timingSafeEqual(a,b))
   throw Error("Untrusted private evidence index.");
 return unsigned;
}
function uuidFor(videoId,partIndex){
 const hash=createHash("sha256").update("workteams-recovery-b2-v1:"+videoId+":"+partIndex).digest("hex");
 return hash.slice(0,8)+"-"+hash.slice(8,12)+"-4"+hash.slice(13,16)+"-8"+hash.slice(17,20)+"-"+hash.slice(20,32);
}
function safeVideo(row){
 return UUID.test(row.id)&&UUID.test(row.company_id)&&UUID.test(row.member_id)&&
   UUID.test(row.time_entry_id)&&typeof row.video_url==="string"&&
   row.video_url.startsWith(row.company_id+"/"+row.time_entry_id+"/")&&
   !row.video_url.includes("..")&&!row.video_url.includes("/b2-")&&
   row.keep_video===false&&(!row.video_expires_at||Date.parse(row.video_expires_at)>Date.now());
}
function mimeFor(path){
 return /\.webm$/i.test(path)?"video/webm":/\.mov$/i.test(path)?"video/quicktime":"video/mp4";
}
async function getSource(db,row){
 const path=row.video_url;
 if(!path.endsWith(".parts.json"))
   return {sourcePaths:[path],mimeType:mimeFor(path),totalBytes:Number(row.file_size_bytes)||0};
 const {data,error}=await db.storage.from(STORAGE).download(path);
 if(error||!data||data.size>16000)throw Error("Original Supabase index unavailable.");
 const manifest=JSON.parse(await data.text());
 const base=path.slice(0,-".parts.json".length);
 if(manifest.kind!=="workteams-walkthrough-parts"||manifest.version!==1||
    !["video/mp4","video/webm","video/quicktime"].includes(manifest.mimeType)||
    !Number.isSafeInteger(manifest.bytes)||manifest.bytes<1||manifest.bytes>500*1024*1024||
    !Array.isArray(manifest.parts)||manifest.parts.length<2||manifest.parts.length>20)
   throw Error("Invalid saved Supabase index.");
 for(let i=0;i<manifest.parts.length;i++){
   if(manifest.parts[i]!==base+".part-"+String(i).padStart(3,"0")+".bin")
     throw Error("Untrusted source video segment path.");
 }
 return {sourcePaths:manifest.parts.concat(path),mimeType:manifest.mimeType,totalBytes:manifest.bytes};
}
async function b2Head(config,part){
 const grant=presignPrivateB2Object({config,method:"HEAD",objectKey:part.key,expiresSeconds:90});
 const response=await fetch(grant.signedUrl,{method:"HEAD",redirect:"error",cache:"no-store",
   signal:AbortSignal.timeout(10000)});
 if(!response.ok||Number(response.headers.get("content-length"))!==part.bytes)return null;
 return response.headers.get("x-amz-version-id");
}
async function migrate(db,config,row){
 const source=await getSource(db,row);
 const originalParts=source.sourcePaths.filter(p=>p!==row.video_url);
 const mediaPaths=originalParts.length?originalParts:[row.video_url];
 const lengths=[];
 let total=0;
 for(const path of mediaPaths){
   const {data:meta,error}=await db.storage.from(STORAGE).info(path);
   const bytes=Number(meta?.size);
   if(error||!Number.isSafeInteger(bytes)||bytes<1||bytes>SOURCE_MAX||
      !path.startsWith(row.company_id+"/"+row.time_entry_id+"/"))
     throw Error("Backup source changed or is too large.");
   lengths.push(bytes);total+=bytes;
 }
 if(total>500*1024*1024||(source.totalBytes&&source.totalBytes!==total)||
    (row.file_size_bytes&&Number(row.file_size_bytes)!==total))
   throw Error("Backup video size did not match original record.");
 const planned=[];
 for(const size of lengths){
   for(let start=0;start<size;start+=PART_BYTES)planned.push(Math.min(PART_BYTES,size-start));
 }
 if(!planned.length||planned.length>25)throw Error("Exceeded safe B2 part count.");
 const parts=planned.map((bytes,i)=>({
   key:"workteams/"+row.company_id+"/"+row.time_entry_id+"/video/"+uuidFor(row.id,i),
   bytes,
 }));
 let i=0;
 const versions=[];
 for(let sourceIndex=0;sourceIndex<mediaPaths.length;sourceIndex++){
   const {data,error}=await db.storage.from(STORAGE).download(mediaPaths[sourceIndex]);
   if(error||!data||data.size!==lengths[sourceIndex])
     throw Error("Supabase source bytes could not be verified.");
   for(let start=0;start<data.size;start+=PART_BYTES){
     const blob=data.slice(start,Math.min(start+PART_BYTES,data.size),source.mimeType);
     const part=parts[i++];
     if(part.bytes!==blob.size)throw Error("B2 segment size mismatch.");
     let versionId=await b2Head(config,part);
     if(!versionId){
       const grant=presignPrivateB2Object({config,method:"PUT",objectKey:part.key,
         contentType:source.mimeType,expiresSeconds:300});
       const stored=await fetch(grant.signedUrl,{method:"PUT",headers:grant.headers,
         body:blob,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(60000)});
       if(!stored.ok)throw Error("Backblaze recovery upload failed.");
       versionId=await b2Head(config,part);
     }
     if(!versionId)throw Error("B2 recovery bytes were not verified.");
     versions.push({...part,versionId});
   }
 }
 if(i!==planned.length)throw Error("Incomplete B2 recovery.");
 const path=row.company_id+"/"+row.member_id+"/b2-"+uuidFor(row.id,999)+".parts.json";
 // Retain signed original source paths for one-hour delayed safe cleanup.
 const unsigned={kind:"workteams-b2-parts",version:1,mimeType:source.mimeType,
   bytes:total,companyId:row.company_id,memberId:row.member_id,entryId:row.time_entry_id,
   parts:versions,sourcePaths:source.sourcePaths,recoveredAt:new Date().toISOString(),
   expiresAt:row.video_expires_at?Date.parse(row.video_expires_at):Date.now()+7*86400000};
 const receipt=JSON.stringify(signedIndex(unsigned,config));
 const {error:writeError}=await db.storage.from(STORAGE).upload(path,
   new Blob([receipt],{type:"application/json"}),
   {contentType:"application/json",upsert:false});
 if(writeError){
   const {data:existing,error}=await db.storage.from(STORAGE).download(path);
   if(error||!existing||existing.size>18000)
     throw Error("Could not finalize immutable private recovery index.");
   const prior=checkIndex(JSON.parse(await existing.text()),config);
   if(prior.kind!==unsigned.kind||prior.companyId!==unsigned.companyId||
      prior.memberId!==unsigned.memberId||prior.entryId!==unsigned.entryId||
      prior.bytes!==unsigned.bytes||prior.mimeType!==unsigned.mimeType||
      JSON.stringify(prior.parts)!==JSON.stringify(unsigned.parts)||
      JSON.stringify(prior.sourcePaths)!==JSON.stringify(unsigned.sourcePaths))
     throw Error("Existing recovery receipt differs from verified recording.");
 }
 const {data:updated,error:updateError}=await db.from("shift_videos")
   .update({video_url:path}).eq("id",row.id).eq("company_id",row.company_id)
   .eq("member_id",row.member_id).eq("time_entry_id",row.time_entry_id)
   .eq("video_url",row.video_url).eq("keep_video",false)
   .select("id").maybeSingle();
 if(updateError||!updated)throw Error("B2 copy is safe but source pointer was not switched.");
 return true;
}
async function cleanup(db,config){
 const {data,error}=await db.from("shift_videos")
   .select("id,company_id,member_id,time_entry_id,video_url,keep_video")
   .eq("keep_video",false).like("video_url","%/b2-%.parts.json").limit(8);
 if(error)throw Error("Could not inspect pending Supabase cleanup.");
 let cleaned=0,failed=0;
 for(const row of data||[]){
   try{
     if(!UUID.test(row.id)||!UUID.test(row.company_id)||
        !UUID.test(row.time_entry_id)||!UUID.test(row.member_id))continue;
     const {data:blob,error:downloadError}=await db.storage.from(STORAGE).download(row.video_url);
     if(downloadError||!blob||blob.size>18000)continue;
     const unsigned=checkIndex(JSON.parse(await blob.text()),config);
     if(unsigned.kind!=="workteams-b2-parts"||unsigned.companyId!==row.company_id||
        unsigned.memberId!==row.member_id||unsigned.entryId!==row.time_entry_id||
        !Number.isSafeInteger(Date.parse(unsigned.recoveredAt))||
        Date.parse(unsigned.recoveredAt)>Date.now()-60*60000||
        !Array.isArray(unsigned.sourcePaths)||!unsigned.sourcePaths.length||
        unsigned.sourcePaths.length>21||!Array.isArray(unsigned.parts)||
        unsigned.parts.length<1||unsigned.parts.length>25)continue;
     if(unsigned.sourcePaths.some(p=>typeof p!=="string"||
        !p.startsWith(row.company_id+"/"+row.time_entry_id+"/")||
        p.includes("..")||p===row.video_url))continue;
     // Each exact object version must remain available before deleting backups.
     for(const part of unsigned.parts){
       if(typeof part.key!=="string"||
          !part.key.startsWith("workteams/"+row.company_id+"/"+row.time_entry_id+"/video/")||
          !Number.isSafeInteger(part.bytes)||part.bytes<1||part.bytes>PART_BYTES||
          (await b2Head(config,part))!==part.versionId)throw Error("Cannot verify exact recovered B2 version.");
     }
     const {data:current,error:currentError}=await db.from("shift_videos")
       .select("id,keep_video").eq("id",row.id).eq("video_url",row.video_url)
       .eq("keep_video",false).maybeSingle();
     if(currentError||!current)continue;
     const {error:removeError}=await db.storage.from(STORAGE).remove(unsigned.sourcePaths);
     if(removeError)throw Error("Cannot delete verified temporary backup.");
     cleaned++;
   }catch{failed++;}
 }
 return {cleaned,cleanupFailures:failed};
}
export async function GET(request){
 if(process.env.VERCEL_ENV!=="production"||!process.env.CRON_SECRET||
    request.headers.get("authorization")!=="Bearer "+process.env.CRON_SECRET)
   return json({error:"Not authorized."},403);
 if(process.env.WORKTEAMS_B2_RECOVERY_ENABLED!=="true")
   return json({skipped:true,reason:"WorkTeams backup recovery not enabled."});
 try{
   const config=readPrivateB2MediaConfig({...process.env,WORKTEAMS_B2_PRIVATE_MEDIA_ENABLED:"true"});
   if(!config)return json({error:"Dedicated private B2 storage unavailable."},503);
   const db=service();
   const cleanupStatus=await cleanup(db,config).catch(()=>({cleaned:0,cleanupFailures:1}));
   const {data:rows,error}=await db.from("shift_videos")
     .select("id,company_id,member_id,time_entry_id,video_url,keep_video,video_expires_at,file_size_bytes")
     .eq("keep_video",false).not("time_entry_id","is",null)
     .gt("video_expires_at",new Date().toISOString())
     .not("video_url","like","%/b2-%.parts.json")
     .order("created_at",{ascending:false}).limit(5);
   if(error)return json({error:"Could not discover backup video candidates."},503);
   let copied=0,failed=0;
   for(const row of rows||[]){
     if(!safeVideo(row))continue;
     try{await migrate(db,config,row);copied++;}
     catch{failed++;}
   }
   return json({checked:(rows||[]).length,copied,failed,...cleanupStatus});
 }catch{
   return json({error:"Private WorkTeams recovery unavailable."},503);
 }
}
