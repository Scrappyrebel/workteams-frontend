"use client";

// WorkTeams private storage is an opt-in rollout. The existing resumable
// Supabase video uploader remains the emergency fallback and the default.
const ENDPOINT="/api/shift-media/b2";
const PART_BYTES=20*1024*1024;

async function control(session,payload){
 const response=await fetch(ENDPOINT,{
   method:"POST",cache:"no-store",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||"Primary private video storage is unavailable.");
 return data;
}

export async function uploadWorkTeamsB2Video({
 file,session,companyId,entryId,onProgress,
}){
 if(process.env.NEXT_PUBLIC_WORKTEAMS_B2_ENABLED!=="true")
   return null;
 if(!session?.access_token||!companyId||!entryId||!file?.size||
    file.size>500*1024*1024)
   throw Error("Private video upload is missing a valid file, shift or login.");
 const lower=(file.type||"").toLowerCase();
 const mime=lower.includes("mp4")?"video/mp4":
   lower.includes("quicktime")?"video/quicktime":"video/webm";
 const base={companyId,entryId};
 const begin=await control(session,{...base,action:"begin",
   mimeType:mime,totalBytes:file.size});
 if(typeof begin.grant!=="string"||begin.grant.length>12000||
    begin.partBytes!==PART_BYTES||
    begin.parts!==Math.ceil(file.size/PART_BYTES))
   throw Error("Invalid primary video storage session.");
 for(let i=0;i<begin.parts;i++){
   const start=i*PART_BYTES;
   const chunk=file.slice(start,Math.min(start+PART_BYTES,file.size),mime);
   let saved=false,problem;
   for(const delay of [0,750,1500]){
     if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
     try{
       const grant=await control(session,{...base,action:"part",
         grant:begin.grant,partIndex:i});
       if(typeof grant.signedUrl!=="string"||
          !grant.signedUrl.startsWith("https://s3.")||
          Number(grant.bytes)!==chunk.size)
         throw Error("Primary upload grant did not match this recording.");
       const response=await fetch(grant.signedUrl,{
         method:"PUT",headers:grant.headers,body:chunk,
         cache:"no-store",redirect:"error",signal:AbortSignal.timeout(45000),
       });
       if(response.ok){saved=true;break;}
       problem=Error("Primary video storage rejected the upload.");
       if(response.status>=400&&response.status<500)break;
     }catch(error){
       problem=error;
       if(error instanceof TypeError||
         (error instanceof Error&&["TimeoutError","AbortError"].includes(error.name)))
         break;
     }
   }
   if(!saved)throw problem||Error("Primary video storage failed.");
   onProgress?.((i+1)/begin.parts*0.98);
 }
 const verified=await control(session,{...base,action:"verify",grant:begin.grant});
 if(verified.status!=="verified-not-attached"||
    typeof verified.storagePath!=="string"||
    !verified.storagePath.startsWith(companyId+"/")||
    !verified.storagePath.endsWith(".parts.json")||
    Number(verified.bytes)!==file.size)
   throw Error("Primary video storage could not verify the recording.");
 onProgress?.(1);
 return verified.storagePath;
}
