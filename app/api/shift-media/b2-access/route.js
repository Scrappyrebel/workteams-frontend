import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createHmac,timingSafeEqual} from "node:crypto";
import {readPrivateB2MediaConfig,presignPrivateB2Object} from "../../../../lib/workteams-private-b2.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const NO_CACHE={"Cache-Control":"private, no-store"};
const error=(message,status)=>NextResponse.json({error:message},{status,headers:NO_CACHE});
function serviceDb(){
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
}
async function authenticated(req){
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return null;
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{
   global:{headers:{Authorization:"Bearer "+token}},
 });
 const {data:{user}}=await db.auth.getUser();
 return user||null;
}
function signature(payload,config){
 const key=createHmac("sha256",config.appKey).update("workteams-b2-grants-v1").digest();
 return createHmac("sha256",key).update(payload).digest("base64url");
}
export async function GET(req){
 try{
   const config=readPrivateB2MediaConfig();
   if(!config)return error("Private WorkTeams media storage unavailable.",503);
   const user=await authenticated(req);
   if(!user)return error("Sign in required.",401);
   const params=new URL(req.url).searchParams;
   const companyId=params.get("companyId")||"";
   const path=params.get("storagePath")||"";
   if(!/^[0-9a-f-]{36}$/i.test(companyId)||!path.startsWith(companyId+"/")||
      !/^[-A-Za-z0-9_/.]{1,300}$/.test(path)||path.includes("..")||
      !path.endsWith(".parts.json"))
     return error("Invalid private evidence address.",400);
   const db=serviceDb();
   const {data:member,error:memberError}=await db.from("company_members")
     .select("id,role").eq("company_id",companyId).eq("user_id",user.id).maybeSingle();
   if(memberError||!member)return error("Access denied.",403);
   const {data:row,error:rowError}=await db.from("shift_videos")
     .select("id,member_id,video_url,keep_video,video_expires_at,created_at")
     .eq("company_id",companyId).eq("video_url",path).maybeSingle();
   if(rowError||!row)return error("Recording not found.",404);
   if(row.member_id!==member.id&&!["owner","admin"].includes(member.role))
     return error("Access denied.",403);
   const expiry=row.video_expires_at?Date.parse(row.video_expires_at):
     Date.parse(row.created_at)+7*86400000;
   if(!row.keep_video&&(!Number.isFinite(expiry)||expiry<=Date.now()))
     return error("Recording retention expired.",410);
   const {data:file,error:readError}=await db.storage.from("shift-videos").download(path);
   if(readError||!file||file.size>18000)return error("Private video index unavailable.",404);
   const index=JSON.parse(await file.text());
   const {signature:mac,...unsigned}=index||{};
   if(typeof mac!=="string")return error("Invalid private evidence receipt.",503);
   const expected=signature(Buffer.from(JSON.stringify(unsigned)).toString("base64url"),config);
   const a=Buffer.from(mac),b=Buffer.from(expected);
   if(a.length!==b.length||!timingSafeEqual(a,b))
     return error("Untrusted private evidence receipt.",503);
   if(index.kind!=="workteams-b2-parts"||index.version!==1||
      index.companyId!==companyId||index.memberId!==row.member_id||
      !/^[0-9a-f-]{36}$/i.test(index.entryId)||!["video/mp4","video/webm","video/quicktime"].includes(index.mimeType)||
      !Number.isSafeInteger(index.bytes)||index.bytes<1||index.bytes>500*1024*1024||
      !Array.isArray(index.parts)||index.parts.length<1||index.parts.length>25)
     return error("Invalid private evidence index.",503);
   let sum=0;
   for(const part of index.parts){
     if(typeof part?.key!=="string"||
        !part.key.startsWith("workteams/"+companyId+"/"+index.entryId+"/video/")||
        !Number.isSafeInteger(part.bytes)||part.bytes<1||part.bytes>20*1024*1024||
        typeof part.versionId!=="string"||!part.versionId)
       return error("Invalid private evidence part.",503);
     sum+=part.bytes;
   }
   if(sum!==index.bytes)return error("Incomplete private recording.",503);
   const signed=index.parts.map(part=>({
     url:presignPrivateB2Object({config,method:"GET",objectKey:part.key,expiresSeconds:300}).signedUrl,
     bytes:part.bytes,
   }));
   return NextResponse.json({mimeType:index.mimeType,totalBytes:index.bytes,parts:signed},{headers:NO_CACHE});
 }catch{
   return error("Private recording cannot be opened.",503);
 }
}
