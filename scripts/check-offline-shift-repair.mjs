import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localShift, devicePunchTime } from "../lib/local-shift.mjs";
import { createPunchOutbox, createMemoryStorage } from "../lib/punch-outbox.mjs";

const COMPANY="company-a", MEMBER="member-a";
const clockInId="9a26fb9d-5d12-48ae-8148-77c93145a4ec";
function database() {
  const tables={company_members:[{id:MEMBER,company_id:COMPANY,user_id:"user-a"}],companies:[{id:COMPANY,timezone:"America/Chicago"}],locations:[{id:"site-a",company_id:COMPANY,require_geofence:false}],shifts:[{id:"shift-a",company_id:COMPANY,member_id:MEMBER,location_id:"site-a",shift_date:"2026-11-24",start_time:"09:00",end_time:"17:00"}],time_entries:[]};
  let beforeUpdate=null;
  const sb={auth:{getUser:async()=>({data:{user:{id:"user-a"}}})},from(table){
    const filters=[];let operation="read",values;
    const query={select(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},is(k,v){filters.push(r=>(r[k]??null)===v);return this},in(k,vs){filters.push(r=>vs.includes(r[k]));return this},order(){return this},limit(){return this},insert(v){operation="insert";values=v;return this},update(v){operation="update";values=v;return this},async execute(single){
      if(operation==="update"&&beforeUpdate){beforeUpdate();beforeUpdate=null}
      let rows=tables[table].filter(r=>filters.every(f=>f(r)));
      if(operation==="insert"){if(tables[table].some(r=>r.id===values.id))return {data:null,error:{code:"23505",message:"duplicate"}};const row={clock_out:null,...values};tables[table].push(row);rows=[row]}
      if(operation==="update") rows.forEach(r=>Object.assign(r,values));
      return {data:single?(rows[0]?{...rows[0]}:null):rows.map(r=>({...r})),error:null};
    },single(){return this.execute(true)},maybeSingle(){return this.execute(true)},then(resolve,reject){return this.execute(false).then(resolve,reject)}};return query;
  }};
  return {tables,sb,race(fn){beforeUpdate=fn}};
}
function route(kind,db) {
  const source=readFileSync(new URL(`../app/api/time/clock-${kind}/route.js`,import.meta.url),"utf8").replace(/^import .*;\n/gm,"").replace("export async function POST","async function POST");
  return new Function("devicePunchTime","NextResponse","createClient","checkRateLimit","clientIp","entitledTier","canUse","chooseAssignedShift",source+"\nreturn POST;")(
    devicePunchTime,{json:(body,options)=>({body,status:options?.status||200})},()=>db.sb,()=>({ok:true}),()=>"test",()=>"pro",()=>!!db.geo,(shifts,when)=>{db.selectedAt=when.toISOString();return shifts[0]||null}
  );
}
const request=body=>({headers:{get:()=>"Bearer test"},json:async()=>body});
const input={companyId:COMPANY,locationId:"site-a",punchId:clockInId,tappedAt:"2026-11-24T15:00:00.000Z"};

{
  const db=database(),post=route("in",db);
  const first=await post(request(input));assert.equal(first.status,200);
  assert.equal(first.body.entry.id,clockInId);assert.equal(first.body.entry.clock_in,input.tappedAt);assert.equal(db.selectedAt,input.tappedAt);
  // Retry after the shift was closed still returns its exact original entry.
  db.tables.time_entries[0].clock_out="2026-11-24T17:00:00.000Z";
  assert.equal((await post(request(input))).body.entry.id,clockInId);assert.equal(db.tables.time_entries.length,1);
  console.log("ok - clock-in route preserves original time and exact identity across closed-shift retry");
}
{
  const db=database();await route("in",db)(request(input));const post=route("out",db);
  const out={companyId:COMPANY,entryId:clockInId,punchId:"out-a",tappedAt:"2026-11-24T17:00:00.000Z",lat:null,lng:null};
  const first=await post(request(out));assert.equal(first.status,200);assert.equal(first.body.entry.clock_out,out.tappedAt);assert.equal(first.body.entry.clock_out_lat,null);
  const retry=await post(request({...out,tappedAt:"2026-11-24T18:00:00.000Z"}));assert.equal(retry.body.entry.clock_out,out.tappedAt);
  console.log("ok - clock-out route preserves finishing time and missing GPS across retry");
}
{
  const db=database();await route("in",db)(request(input));db.race(()=>db.tables.time_entries[0].clock_out="2026-11-24T16:30:00.000Z");
  const result=await route("out",db)(request({companyId:COMPANY,entryId:clockInId,punchId:"out-a",tappedAt:"2026-11-24T17:00:00.000Z"}));
  assert.equal(result.body.entry.clock_out,"2026-11-24T16:30:00.000Z");console.log("ok - concurrent closure is returned without overwriting management time");
}
{
  const db=database();await route("in",db)(request(input));db.tables.time_entries[0].member_id="another-worker";
  const result=await route("out",db)(request({companyId:COMPANY,entryId:clockInId,punchId:"out-a",tappedAt:"2026-11-24T17:00:00.000Z"}));
  assert.equal(result.status,404);assert.equal(db.tables.time_entries[0].clock_out,null);console.log("ok - another employee's entry cannot be closed");
}
{
  const storage=createMemoryStorage();let now=Date.parse(input.tappedAt),online=false;const server=new Map();
  const make=()=>createPunchOutbox({storage,now:()=>now,canSend:()=>online,drainIntervalMs:0,send:async p=>{
    if(p.type==="in"){const entry={id:p.id,clock_in:p.tappedAt,clock_out:null};server.set(p.id,entry);return entry}
    const entry=server.get(p.entryId);assert.ok(entry);entry.clock_out ||= p.tappedAt;return entry;
  }});
  const box=make();const start=await box.enqueue({type:"in",companyId:COMPANY,memberId:MEMBER,locationId:"site-a"});
  const active=localShift(null,box.snapshot().records,COMPANY,MEMBER);assert.equal(active.id,start.id);assert.equal(active.clock_in,input.tappedAt);
  now+=2*3600000;const end=await box.enqueue({type:"out",companyId:COMPANY,memberId:MEMBER,entryId:active.id});
  assert.equal(localShift(active,box.snapshot().records,COMPANY,MEMBER),null);assert.equal(localShift(active,box.snapshot().records,"company-b",MEMBER),null);box.stop();
  const restored=make();await restored.load();assert.equal(restored.snapshot().records.length,2);assert.equal(localShift(active,restored.snapshot().records,COMPANY,MEMBER),null);
  online=true;await restored.drainOnce();const saved=server.get(start.id);assert.equal(saved.clock_out,end.tappedAt);assert.equal(Date.parse(saved.clock_out)-Date.parse(saved.clock_in),7200000);assert.equal(server.size,1);restored.stop();
  console.log("ok - complete offline shift survives reopening, synchronizes in order and totals two original hours");
}
assert.throws(()=>devicePunchTime("invalid"));assert.throws(()=>devicePunchTime("2999-01-01T00:00:00Z"));
console.log("ok - invalid and future device times require review");

{
 const db=database();db.geo=true;Object.assign(db.tables.locations[0],{lat:38,lng:-90,require_geofence:true});
 const post=route("in",db);const absent=await post(request({...input,lat:null,lng:null}));assert.equal(absent.status,400);assert.equal(db.tables.time_entries.length,0);
 const outside=await post(request({...input,lat:0,lng:0}));assert.equal(outside.status,403);assert.equal(db.tables.time_entries.length,0);
 console.log("ok - required geofence still rejects missing and outside GPS without losing the local punch");
}

{
 const source=readFileSync(new URL("../components/ServiceWorkerRegister.js",import.meta.url),"utf8").replace(/^import .*;\n/gm,"").replace("export default function ServiceWorkerRegister","function ServiceWorkerRegister");
 let updates=0,reloads=0,interval,cleanup;const handlers={};
 const worker={controller:{},register:async()=>({update:()=>{updates++;return Promise.resolve()}}),addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:()=>{}};
 new Function("navigator","window","useEffect",source+"\nServiceWorkerRegister();")({serviceWorker:worker},{location:{reload:()=>reloads++},setInterval:fn=>{interval=fn;return 1},clearInterval:()=>{}},fn=>cleanup=fn());
 await Promise.resolve();await Promise.resolve();handlers.controllerchange?.();assert.equal(reloads,0);assert.equal(updates,1);interval();assert.equal(updates,2);cleanup();
 console.log("ok - service-worker updates check automatically without reloading active work");
}
