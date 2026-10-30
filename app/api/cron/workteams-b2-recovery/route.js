import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {readPrivateB2MediaConfig,presignPrivateB2Object} from "../../../../lib/workteams-private-b2.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
const BUCKET="shift-videos";
const SOURCE_PART_BYTES=40*1024*1024;
const B2_PART_BYTES=20*1024*1024;
const MAX_BYTES=500*1024*1024;
const HEADERS={"Cache-Control":"private, no-store"};
const respond=(body,status=200)=>NextResponse.json(body,{status,headers:HEADERS});

function dbClient(){
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
}
function signature(payload,config){
 const key=createHmac("sha256",config.appKey).update("workteams-b2-grants-v1").digest();
 return createHmac("sha256",key).update(payload).digest("base64url");
}
function signedIndex(index,config){
 const {signature:mac,...plain}=index||{};
 if(typeof mac!=="string")throw Error("Unsigned private index.");
 const expected=signature(Buffer.from(JSON.stringify(plain)).toString("base64url"),config);
 const a=Buffer.from(mac),b=Buffer.from(expected);
 if(a.length!==b.length||!timingSafeEqual(a,b))throw Error("Invalid private index signature.");
 return plain;
}
function uuidFrom(value){
 const hex=createHash("sha256").update(value).digest("hex");
 return hex.slice(0,8)+"-"+hex.slice(8,12)+"-4"+hex.slice(13,16)+"-8"+hex.slice(17,20)+"-"+hex.slice(20,32);
}
async function getSource(db,video){
 const path=video.video_url;
 if(typeof path!=="string"||path.includes("..")||
    !path.startsWith(video.company_id+"/")||
    !/\/walkthrough-[^/]{1,180}(?:\.mp4|\.webm|\.mov)(?:\.parts\.json)?$/.test(path))
   throw Error("Source is not a standard shift walkthrough.");
 if(!path.endsWith(".parts.json"))
   return {paths:[path],mime:/\.webm$/.test(path)?"video/webm":/\.mov$/.test(path)?"video/quicktime":"video/mp4",bytes:0};
 const {data,error}=await db.storage.from(BUCKET).download(path);
 if(error||!data||data.size>16384)throw Error("Supabase source index missing.");
 const index=JSON.parse(await data.text());
 const base=path.slice(0,-".parts.json".length);
 if(index.kind!=="workteams-walkthrough-parts"||index.version!==1||
    !["video/mp4","video/webm"].includes(index.mimeType)||
    !Number.isSafeInteger(index.bytes)||index.bytes<1||index.bytes>MAX_BYTES||
    !Array.isArray(index.parts)||index.parts.length<2||index.parts.length>20)
   throw Error("Invalid source walkthrough manifest.");
 for(let i=0;i<index.parts.length;i++)
   if(index.parts[i]!==base+".part-"+String(i).padStart(3,"0")+".bin")
     throw Error("Cross-tenant source part rejected.");
 return {paths:index.parts,mime:index.mimeType,bytes:index.bytes};
}
async function head(config,part){
 const req=presignPrivateB2Object({config,method:"HEAD",objectKey:part.key,expiresSeconds:90});
 const res=await fetch(req.signedUrl,{method:"HEAD",cache:"no-store",
   redirect:"error",signal:AbortSignal.timeout(10000)});
 if(!res.ok||Number(res.headers.get("content-length"))!==part.bytes)return null;
 return res.headers.get("x-amz-version-id");
}
function verifyScope(index,video){
 if(index.kind!=="workteams-b2-parts"||index.version!==1||
    index.companyId!==video.company_id||index.memberId!==video.member_id||
    !/^[0-9a-f-]{36}$/i.test(index.entryId)||
    !Array.isArray(index.parts)||index.parts.length<1||index.parts.length>25||
    !Number.isSafeInteger(index.bytes)||index.bytes<1||index.bytes>MAX_BYTES||
    !Array.isArray(index.sourcePaths)||index.sourcePaths.length<1||index.sourcePaths.length>21)
   throw Error("Recovered video receipt mismatched saved video.");
 let sum=0;
 for(const part of index.parts){
   if(typeof part.key!=="string"||
      !part.key.startsWith("workteams/"+video.company_id+"/"+index.entryId+"/video/")||
      !Number.isSafeInteger(part.bytes)||part.bytes<1||part.bytes>B2_PART_BYTES||
      typeof part.versionId!=="string"||!part.versionId)
     throw Error("Unsafe recovery part receipt.");
   sum+=part.bytes;
 }
 if(sum!==index.bytes)throw Error("Recovered video bytes did not match.");
 for(const path of index.sourcePaths)
   if(typeof path!=="string"||path.includes("..")||
      !path.startsWith(video.company_id+"/")||path.includes("/b2-"))
     throw Error("Unsafe temporary Supabase source path.");
}
async function migrate(db,config,video){
 const source=await getSource(db,video);
 const sizes=[];
 let total=0;
 for(const path of source.paths){
   const {data,error}=await db.storage.from(BUCKET).info(path);
   const bytes=Number(data?.size);
   if(error||!Number.isSafeInteger(bytes)||bytes<1||bytes>SOURCE_PART_BYTES)
     throw Error("Missing or oversized source recording part.");
   sizes.push(bytes);
   total+=bytes;
 }
 if(total>MAX_BYTES||(source.bytes&&source.bytes!==total)||
    (video.file_size_bytes&&Number(video.file_size_bytes)!==total))
   throw Error("Backup video size mismatch.");
 const entries=sizes.flatMap(size=>Array.from({length:Math.ceil(size/B2_PART_BYTES)},
   (_,i)=>Math.min(B2_PART_BYTES,size-i*B2_PART_BYTES)));
 if(entries.length>25)throw Error("Recovery video exceeds B2 segment limit.");
 const entryId=video.time_entry_id||video.id;
 const b2IndexPath=video.company_id+"/"+video.member_id+"/b2-recovered-"+video.id+".parts.json";
 const parts=[];
 let partIndex=0;
 for(let sourceIndex=0;sourceIndex<source.paths.length;sourceIndex++){
   const {data,error}=await db.storage.from(BUCKET).download(source.paths[sourceIndex]);
   if(error||!data||data.size!==sizes[sourceIndex])throw Error("Source part changed during copy.");
   for(let start=0;start<data.size;start+=B2_PART_BYTES){
     const blob=data.slice(start,Math.min(start+B2_PART_BYTES,data.size),source.mime);
     const key="workteams/"+video.company_id+"/"+entryId+"/video/"+
       uuidFrom("workteams-evidence-recovery:"+video.id+":"+partIndex);
     const part={key,bytes:blob.size};
     let version=await head(config,part);
     if(!version){
       const grant=presignPrivateB2Object({config,method:"PUT",objectKey:key,
         contentType:source.mime,expiresSeconds:300});
       const response=await fetch(grant.signedUrl,{
         method:"PUT",headers:grant.headers,body:blob,
         cache:"no-store",redirect:"error",signal:AbortSignal.timeout(60000),
       });
       if(!response.ok)throw Error("Could not copy part to B2.");
       version=await head(config,part);
     }
     if(!version)throw Error("Could not verify B2 recovery version.");
     parts.push({...part,versionId:version});
     partIndex++;
   }
 }
 if(parts.length!==entries.length)throw Error("Incomplete recovered video.");
 const plain={kind:"workteams-b2-parts",version:1,
   mimeType:source.mime,bytes:total,companyId:video.company_id,
   memberId:video.member_id,entryId,parts,
   expiresAt:video.video_expires_at?Date.parse(video.video_expires_at):
     Date.parse(video.created_at)+7*86400000,
   sourcePaths:[...source.paths,...(source.paths.includes(video.video_url)?[]:[video.video_url])],
   migratedAt:Date.now()};
 const index={...plain,signature:signature(Buffer.from(JSON.stringify(plain)).toString("base64url"),config)};
 const {error:storeError}=await db.storage.from(BUCKET).upload(
   b2IndexPath,new Blob([JSON.stringify(index)],{type:"application/json"}),
   {contentType:"application/json",upsert:false});
 if(storeError){
   const {data:old,error}=await db.storage.from(BUCKET).download(b2IndexPath);
   if(error||!old)throw Error("Recovered video index could not be stored.");
   const previous=signedIndex(JSON.parse(await old.text()),config);
   verifyScope(previous,video);
   if(previous.bytes!==total||previous.sourcePaths.join("|")!==plain.sourcePaths.join("|")||
      previous.parts.length!==parts.length)
     throw Error("Previously stored recovery index did not match original.");
   for(let i=0;i<parts.length;i++){
     if(previous.parts[i].key!==parts[i].key||
        previous.parts[i].bytes!==parts[i].bytes||
        previous.parts[i].versionId!==parts[i].versionId)
       throw Error("Stored B2 recovery version differs from verified copy.");
   }
 }
 const {data:swapped,error:swapError}=await db.from("shift_videos")
   .update({video_url:b2IndexPath}).eq("id",video.id)
   .eq("company_id",video.company_id).eq("video_url",video.video_url)
   .select("id").maybeSingle();
 if(swapError||!swapped)throw Error("Could not safely attach verified B2 copy.");
 return true;
}
async function cleanup(db,config,video){
 const {data:blob,error}=await db.storage.from(BUCKET).download(video.video_url);
 if(error||!blob||blob.size>18000)return false;
 const index=signedIndex(JSON.parse(await blob.text()),config);
 if(!Array.isArray(index.sourcePaths)||!index.migratedAt||
    Date.now()-index.migratedAt<60*60000)return false;
 verifyScope(index,video);
 const present=[];
 for(const path of index.sourcePaths){
   const {data}=await db.storage.from(BUCKET).info(path);
   if(data)present.push(path);
 }
 if(!present.length)return false;
 for(const part of index.parts)
   if((await head(config,part))!==part.versionId)
     throw Error("Original B2 version cannot be verified; preserve Supabase backup.");
 const {data:stillCurrent}=await db.from("shift_videos").select("id")
   .eq("id",video.id).eq("company_id",video.company_id)
   .eq("video_url",video.video_url).maybeSingle();
 if(!stillCurrent)throw Error("Saved video changed before backup cleanup.");
 const {error:removed}=await db.storage.from(BUCKET).remove(present);
 if(removed)throw Error("Temporary Supabase cleanup failed.");
 return true;
}
export async function GET(request){
 if(process.env.VERCEL_ENV!=="production"||!process.env.CRON_SECRET||
    request.headers.get("authorization")!=="Bearer "+process.env.CRON_SECRET)
   return respond({error:"Not authorized."},403);
 if(process.env.WORKTEAMS_B2_RECOVERY_ENABLED!=="true")
   return respond({skipped:true,reason:"B2 recovery is not enabled."});
 try{
   const config=readPrivateB2MediaConfig({...process.env,WORKTEAMS_B2_PRIVATE_MEDIA_ENABLED:"true"});
   if(!config)return respond({error:"Private B2 media unavailable."},503);
   const db=dbClient(),now=Date.now();
   const {data:videos,error}=await db.from("shift_videos")
     .select("id,company_id,member_id,time_entry_id,video_url,file_size_bytes,keep_video,video_expires_at,created_at")
     .like("video_url","%/walkthrough-%")
     .order("created_at",{ascending:false}).limit(2);
   if(error)return respond({error:"Could not load backup recordings."},503);
   let copied=0,failed=0;
   for(const video of videos||[]){
     const expiry=Date.parse(video.video_expires_at||"");
     if(!video.keep_video&&(!Number.isFinite(expiry)||expiry-now<24*3600000))continue;
     try{await migrate(db,config,video);copied++;}catch{failed++;}
   }
   const {data:recovered,error:cleanupQueryError}=await db.from("shift_videos")
     .select("id,company_id,member_id,video_url")
     .like("video_url","%/b2-recovered-%.parts.json")
     .order("created_at",{ascending:false}).limit(50);
   let cleaned=0,cleanupFailures=cleanupQueryError?1:0;
   for(const video of recovered||[]){
     try{if(await cleanup(db,config,video))cleaned++;}catch{cleanupFailures++;}
   }
   return respond({checked:(videos||[]).length,copied,failed,cleaned,cleanupFailures});
 }catch{
   return respond({error:"Private recovery worker unavailable."},503);
 }
}
