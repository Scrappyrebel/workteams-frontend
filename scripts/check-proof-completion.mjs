import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proofRequired} from '../lib/proof-policy.js';
const source=readFileSync(new URL('../app/api/time/clock-out/complete/route.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export async function POST','async function POST');
function setup({closed=true,damaged=false,video=true,book=false,failWrite=false,failRead=false,outsider=false}={}){
 const tables={company_members:[{id:'worker',company_id:'company',user_id:'user'}],time_entries:[{id:'entry',member_id:outsider?'other':'worker',company_id:'company',location_id:'site',clock_out:closed?'2026-11-24T14:00Z':null,upload_pending:true}],companies:[{id:'company',industry_key:'janitorial_cleaning',require_walkthrough_video:video,require_book_photo:book}],locations:[{id:'site',company_id:'company'}],shift_proof_overrides:[],shift_videos:[{id:'video',time_entry_id:'entry',company_id:'company',member_id:'worker',video_url:'video.webm',file_size_bytes:123,notes:damaged?'VIDEO PROOF NEEDS REVIEW: frozen':''}],comm_book:[]};
 let writes=0;
 const sb={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){let values=null;const filters=[];
  const q={select(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},is(k,v){filters.push(r=>(r[k]??null)===v);return this},not(k,op,v){filters.push(r=>(r[k]??null)!==v);return this},limit(){return this},update(v){values=v;return this},async execute(single){const rows=tables[table].filter(r=>filters.every(f=>f(r)));
   if(values){writes++;if(failWrite)return {error:new Error('write failed')};rows.forEach(r=>Object.assign(r,values));}
   if(table==='time_entries'&&writes&&failRead&&!values)return {error:new Error('receipt failed')};
   return {data:single?rows[0]||null:rows,error:null};},maybeSingle(){return this.execute(true)},then(a,b){return this.execute(false).then(a,b)}};return q;}};
 const handler=new Function('NextResponse','createClient','checkRateLimit','clientIp','NO_COMMUNICATION_BOOK_NOTE','proofRequired',source+'\nreturn POST;')({json:(body,opts)=>({body,status:opts?.status||200})},()=>sb,()=>({ok:true}),()=>'', 'no book',proofRequired);
 return {run:()=>handler({headers:{get:()=> 'Bearer token'},json:async()=>({companyId:'company',entryId:'entry'})}),tables};
}
for(const [options,status] of [[{closed:false},409],[{damaged:true},409],[{book:true},409],[{outsider:true},404],[{failWrite:true},500],[{failRead:true},500],[{},200],[{video:false,book:false},200]]){
 const t=setup(options),before=t.tables.time_entries[0].clock_out;
 const result=await t.run();assert.equal(result.status,status,JSON.stringify(options));assert.equal(t.tables.time_entries[0].clock_out,before);
 if(status===409||status===404)assert.equal(t.tables.time_entries[0].upload_pending,true);
}
console.log('ok - actual proof finalization rejects missing time, damaged video, missing book, foreign worker and failed write/read receipts; successful finalization never changes finishing time');
