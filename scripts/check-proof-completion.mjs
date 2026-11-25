import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {proofRequired} from '../lib/proof-policy.js';
const source=readFileSync(new URL('../app/api/time/clock-out/complete/route.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export async function POST','async function POST');
const normalPath='company/entry/walkthrough-1.webm',photoPath='company/entry/book-signature.jpg';
const videoBytes=Uint8Array.from([0x1a,0x45,0xdf,0xa3,1,2,3,4]);
function setup({closed=true,damaged=false,video=true,book=false,failWrite=false,failRead=false,outsider=false}={}){
 const tables={company_members:[{id:'worker',company_id:'company',user_id:'user'}],time_entries:[{id:'entry',member_id:outsider?'other':'worker',company_id:'company',location_id:'site',clock_out:closed?'2026-11-24T14:00Z':null,upload_pending:true}],companies:[{id:'company',industry_key:'janitorial_cleaning',require_walkthrough_video:video,require_book_photo:book}],locations:[{id:'site',company_id:'company'}],shift_proof_overrides:[],shift_videos:[{id:'video',time_entry_id:'entry',company_id:'company',member_id:'worker',video_url:normalPath,file_size_bytes:videoBytes.length,notes:damaged?'VIDEO PROOF NEEDS REVIEW: frozen':''}],comm_book:[]};
 let writes=0;const objects=new Map([[normalPath,{bytes:videoBytes}]]),requested=[],parts=new Map();
 const sb={auth:{getUser:async()=>({data:{user:{id:'user'}}})},storage:{from(bucket){assert.ok(['shift-videos','inspection-photos'].includes(bucket));return {
  info:async path=>({data:objects.has(path)?{size:objects.get(path).size||objects.get(path).bytes.length}:null,error:objects.has(path)?null:Error('missing stored object')}),
  download:async path=>({data:objects.has(path)?new Blob([objects.get(path).bytes]):null,error:objects.has(path)?null:Error('missing index')}),
  createSignedUrl:async path=>{requested.push(path);return {data:{signedUrl:'https://private.example/'+encodeURIComponent(path)}};},
 };}},from(table){let values=null;const filters=[];
  const q={select(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},is(k,v){filters.push(r=>(r[k]??null)===v);return this},not(k,op,v){filters.push(r=>(r[k]??null)!==v);return this},limit(){return this},update(v){values=v;return this},async execute(single){const rows=tables[table].filter(r=>filters.every(f=>f(r)));
   if(values){writes++;if(failWrite)return {error:new Error('write failed')};rows.forEach(r=>Object.assign(r,values));}
   if(table==='time_entries'&&writes&&failRead&&!values)return {error:new Error('receipt failed')};
   return {data:single?rows[0]||null:rows,error:null};},maybeSingle(){return this.execute(true)},then(a,b){return this.execute(false).then(a,b)}};return q;}};
 const fetcher=async(url,options)=>{
  const address=new URL(url),path=decodeURIComponent(address.pathname.slice(1));const item=address.hostname==='b2.example'?parts.get(path):objects.get(path);
  if(!item)return new Response('missing',{status:404});
  if(options.method==='HEAD')return new Response(null,{headers:{'content-length':String(item.size||item.bytes.length),'x-amz-version-id':item.version||''}});
  return new Response(item.bytes,{status:206});
 };
 const config={appKey:'synthetic-private-key'};
 const handler=new Function('NextResponse','createClient','checkRateLimit','clientIp','NO_COMMUNICATION_BOOK_NOTE','proofRequired','fetch','createHmac','timingSafeEqual','readPrivateB2MediaConfig','presignPrivateB2Object',source+'\nreturn POST;')({json:(body,opts)=>({body,status:opts?.status||200})},()=>sb,()=>({ok:true}),()=>'', 'no book',proofRequired,fetcher,createHmac,timingSafeEqual,()=>config,({objectKey})=>({signedUrl:'https://b2.example/'+encodeURIComponent(objectKey)}));
 return {run:()=>handler({headers:{get:()=> 'Bearer token'},json:async()=>({companyId:'company',entryId:'entry'})}),tables,objects,requested,parts,config};
}
let cases=0;
async function check(t,status,label){const before=t.tables.time_entries[0].clock_out;const result=await t.run();assert.equal(result.status,status,label);assert.equal(t.tables.time_entries[0].clock_out,before);
 if(status===409||status===404)assert.equal(t.tables.time_entries[0].upload_pending,true);cases++;return result;}
for(const [options,status] of [[{closed:false},409],[{damaged:true},409],[{book:true},409],[{outsider:true},404],[{failWrite:true},500],[{failRead:true},500],[{},200],[{video:false,book:false},200]])await check(setup(options),status,JSON.stringify(options));
{
 const t=setup();t.objects.clear();await check(t,409,'missing saved video');
}
{
 const t=setup();t.tables.shift_videos[0].video_url='foreign/entry/walkthrough.webm';await check(t,409,'foreign storage path');assert.equal(t.requested.length,0);
}
{
 const t=setup();t.tables.shift_videos[0].file_size_bytes++;await check(t,409,'wrong video size');
}
{
 const t=setup();t.objects.set(normalPath,{bytes:new TextEncoder().encode('not a recording')});t.tables.shift_videos[0].file_size_bytes=t.objects.get(normalPath).bytes.length;await check(t,409,'non-video object');
}
function multipart(t){const path=normalPath+'.parts.json',base=normalPath,bytes=40*1024*1024+10,index={kind:'workteams-walkthrough-parts',version:1,mimeType:'video/webm',bytes,parts:[base+'.part-000.bin',base+'.part-001.bin']};
 t.tables.shift_videos[0].video_url=path;t.tables.shift_videos[0].file_size_bytes=bytes;t.objects.set(path,{bytes:new TextEncoder().encode(JSON.stringify(index))});
 t.objects.set(index.parts[0],{bytes:videoBytes,size:40*1024*1024});t.objects.set(index.parts[1],{bytes:Uint8Array.of(1),size:10});return {path,index};}
{
 const t=setup();multipart(t);await check(t,200,'all multipart recording parts verified');
}
{
 const t=setup(),{index}=multipart(t);t.objects.delete(index.parts[1]);await check(t,409,'missing final video part');
}
{
 const t=setup(),{index}=multipart(t);t.objects.get(index.parts[1]).size=9;await check(t,409,'short final video part');
}
{
 const t=setup(),{path,index}=multipart(t);index.parts[1]='foreign/object';t.objects.set(path,{bytes:new TextEncoder().encode(JSON.stringify(index))});await check(t,409,'foreign manifest part');assert.ok(!t.requested.includes('foreign/object'));
}
{
 const t=setup(),{path,index}=multipart(t);index.mimeType='video/mp4';t.objects.set(path,{bytes:new TextEncoder().encode(JSON.stringify(index))});await check(t,409,'declared container must match stored video');
}
function book(t,bytes=Uint8Array.from([0xff,0xd8,0xff,1,2])){t.tables.comm_book.push({id:'book',company_id:'company',member_id:'worker',time_entry_id:'entry',photo_url:photoPath});t.objects.set(photoPath,{bytes});}
{
 const t=setup({video:false,book:true});book(t);await check(t,200,'saved image is scoped and readable');
}
{
 const t=setup({video:false,book:true});book(t);t.objects.delete(photoPath);await check(t,409,'missing book image');
}
{
 const t=setup({video:false,book:true});book(t,new TextEncoder().encode('not a photograph'));await check(t,409,'non-image book attachment');
}
function privateB2(t,{badSignature=false,foreign=false,missing=false,changedVersion=false}={}){
 const index={kind:'workteams-b2-parts',version:1,mimeType:'video/webm',bytes:videoBytes.length,companyId:'company',memberId:'worker',entryId:foreign?'foreign-entry':'entry',parts:[{key:'workteams/company/entry/video/part-a',bytes:videoBytes.length,versionId:'saved-version'}],expiresAt:Date.now()+100000};
 const key=createHmac('sha256',t.config.appKey).update('workteams-b2-grants-v1').digest();
 const signature=createHmac('sha256',key).update(Buffer.from(JSON.stringify(index)).toString('base64url')).digest('base64url');
 const path='company/worker/b2-private.parts.json';t.tables.shift_videos[0].video_url=path;t.objects.set(path,{bytes:new TextEncoder().encode(JSON.stringify({...index,signature:badSignature?'forged':signature}))});
 if(!missing)t.parts.set(index.parts[0].key,{bytes:videoBytes,version:changedVersion?'changed-version':'saved-version'});
}
for(const [options,status] of [[{},200],[{badSignature:true},409],[{foreign:true},409],[{missing:true},409],[{changedVersion:true},409]]){const t=setup();privateB2(t,options);await check(t,status,'private B2 '+JSON.stringify(options));}

{
 const t=setup();t.tables.companies=[];await check(t,500,'missing company policy never waives proof');assert.equal(t.tables.time_entries[0].upload_pending,true);
}
{
 const t=setup();t.objects.clear();t.tables.shift_proof_overrides.push({company_id:'company',member_id:'worker',time_entry_id:'entry',proof_kind:'walkthrough',reason:' '});await check(t,409,'empty override cannot waive video');
}
{
 const t=setup();t.objects.clear();t.tables.shift_proof_overrides.push({company_id:'company',member_id:'worker',time_entry_id:'entry',proof_kind:'walkthrough',reason:'Camera failed; manager review requested'});await check(t,200,'recorded reason retains explicit management exception');assert.equal(t.tables.time_entries[0].proof_override_used,true);
}
console.log(`ok - ${cases} actual proof-finalization cases validate stored bytes, scope, container signatures, multipart completeness and signed private versions without changing finishing time; semantic notebook/frozen-frame quality is not certified`);
