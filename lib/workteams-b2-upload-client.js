"use client";

// This is never enabled until the private B2 bucket and signed playback have
// completed owner verification. The caller catches any failure and immediately
// resumes the existing Supabase video upload with the original Blob.
const ENDPOINT="/api/shift-media/b2";
const PART_BYTES=20*1024*1024;
async function command(payload,session){
 const response=await fetch(ENDPOINT,{
   method:"POST",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
   body:JSON.stringify(payload),cache:"no-store",signal:AbortSignal.timeout(12000),
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||"Private storage request failed.");
 return data;
}
export async function uploadWorkteamsB2Evidence({file,companyId,entryId,session,onProgress}){
 if(!file?.size||file.size>500*1024*1024||!session?.access_token)
   throw new Error("Invalid private recording or signed-in session.");
 const mimeType=(file.type||"video/mp4").toLowerCase();
 if(!["video/mp4","video/webm","video/quicktime"].includes(mimeType))
   throw new Error("Unsupported video format.");
 const base={companyId,entryId};
 const begin=await command({...base,action:"begin",totalBytes:file.size,mimeType},session);
 const count=Number(begin.parts);
 if(!Number.isSafeInteger(count)||count<1||count>25||
    Number(begin.partBytes)!==PART_BYTES||typeof begin.grant!=="string")
   throw new Error("Invalid private upload grant.");
 for(let i=0;i<count;i++){
   const start=i*PART_BYTES,end=Math.min(file.size,start+PART_BYTES);
   const chunk=file.slice(start,end,mimeType);
   let sent=false,lastError=null;
   for(const delay of [0,750]){
     if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
     try{
       const grant=await command({...base,action:"part",grant:begin.grant,partIndex:i},session);
       if(typeof grant.signedUrl!=="string"||!grant.signedUrl.startsWith("https://s3.")||
          Number(grant.bytes)!==chunk.size)
         throw new Error("Invalid private media upload address.");
       const res=await fetch(grant.signedUrl,{method:"PUT",headers:grant.headers,body:chunk,
         cache:"no-store",redirect:"error",signal:AbortSignal.timeout(45000)});
       if(res.ok){sent=true;break;}
       lastError=new Error("Private storage returned "+res.status+".");
       if(res.status>=400&&res.status<500)break;
     }catch(error){
       lastError=error;
       if(error instanceof TypeError||
          (error instanceof Error&&["TimeoutError","AbortError"].includes(error.name)))break;
     }
   }
   if(!sent)throw lastError||new Error("Private storage upload interrupted.");
   onProgress?.(((i+1)/count)*0.98);
 }
 const receipt=await command({...base,action:"verify",grant:begin.grant},session);
 if(receipt.status!=="verified-not-attached"||
    typeof receipt.storagePath!=="string"||
    !receipt.storagePath.startsWith(companyId+"/")||
    !receipt.storagePath.endsWith(".parts.json")||
    Number(receipt.bytes)!==file.size)
   throw new Error("B2 recording was not verified against its private manifest.");
 onProgress?.(1);
 return receipt.storagePath;
}
