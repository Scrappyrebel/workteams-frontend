import assert from "node:assert/strict";
import {uploadWorkTeamsB2Video} from "../lib/workteams-b2-client.js";

const previousFlag=process.env.NEXT_PUBLIC_WORKTEAMS_B2_ENABLED;
const originalFetch=globalThis.fetch;
const bytes=new Blob([Uint8Array.from([1,2,3,4,5,6,7,8])],{type:"video/webm"});
const companyId="a005319f-47c8-43bf-a5e5-89cf4b39467d";
const entryId="9d790983-cc7a-4854-8a3b-b8fec66ad9c5";
const session={access_token:"local-test-only"};
const input={file:bytes,companyId,entryId,session};
const signedUrl="https://s3.us-east-005.backblazeb2.com/test-bucket/private-video";

function response(value,status=200){
 return Response.json(value,{status});
}
try{
 delete process.env.NEXT_PUBLIC_WORKTEAMS_B2_ENABLED;
 globalThis.fetch=async()=>{throw Error("disabled mode must not use network");};
 assert.equal(await uploadWorkTeamsB2Video(input),null,"WorkTeams primary must be disabled until configured");

 process.env.NEXT_PUBLIC_WORKTEAMS_B2_ENABLED="true";
 const actions=[];
 let puts=0;
 globalThis.fetch=async(url,options)=>{
   if(url===signedUrl){
     puts++;
     throw new TypeError("Failed to fetch");
   }
   assert.equal(url,"/api/shift-media/b2");
   assert.equal(options.headers.Authorization,"Bearer local-test-only");
   const body=JSON.parse(options.body);
   actions.push(body.action);
   if(body.action==="begin")return response({grant:"local-only",parts:1,partBytes:20*1024*1024});
   if(body.action==="part")return response({signedUrl,bytes:bytes.size,headers:{"Content-Type":"video/webm"}});
   throw Error("Video must not finalize after B2 browser failure");
 };
 await assert.rejects(uploadWorkTeamsB2Video(input),/Failed to fetch/);
 assert.deepEqual(actions,["begin","part"]);
 assert.equal(puts,1,"CORS/network failure must not loop B2 and delay the Supabase fallback");

 const progress=[];
 actions.length=0;
 globalThis.fetch=async(url,options)=>{
   if(url===signedUrl)return new Response(null,{status:200});
   const body=JSON.parse(options.body);
   actions.push(body.action);
   if(body.action==="begin")return response({grant:"local-only",parts:1,partBytes:20*1024*1024});
   if(body.action==="part")return response({signedUrl,bytes:bytes.size,headers:{"Content-Type":"video/webm"}});
   if(body.action==="verify")return response({
     status:"verified-not-attached",storagePath:companyId+"/member/b2-local.parts.json",
     bytes:bytes.size,parts:1,
   });
   throw Error("Unexpected upload action");
 };
 const path=await uploadWorkTeamsB2Video({...input,onProgress:n=>progress.push(n)});
 assert.ok(path.endsWith(".parts.json"));
 assert.deepEqual(actions,["begin","part","verify"]);
 assert.equal(progress.at(-1),1);
 console.log("WorkTeams B2-disabled, browser-failure, and verified primary upload simulations passed.");
}finally{
 if(previousFlag===undefined)delete process.env.NEXT_PUBLIC_WORKTEAMS_B2_ENABLED;
 else process.env.NEXT_PUBLIC_WORKTEAMS_B2_ENABLED=previousFlag;
 globalThis.fetch=originalFetch;
}
