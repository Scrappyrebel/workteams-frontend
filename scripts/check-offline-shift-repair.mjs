import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localShift, devicePunchTime } from "../lib/local-shift.mjs";
import { createPunchOutbox, createMemoryStorage, createIndexedDbStorage } from "../lib/punch-outbox.mjs";

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
 const source=readFileSync(new URL("../components/ServiceWorkerRegister.js",import.meta.url),"utf8").replace(/^import .*;\n/gm,"").replace("export default function ServiceWorkerRegister","function ServiceWorkerRegister").replace(/return <aside[\s\S]*?<\/aside>;/,"return null;");
 let updates=0,reloads=0,cleanup,now=100000;const handlers={},timers=new Map(),messages=[];
 const worker={controller:{},register:async(url,options)=>{assert.equal(url,"/sw.js");assert.equal(options.scope,"/");assert.equal(options.updateViaCache,"none");return {update:()=>{updates++;return Promise.resolve()}};},addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:name=>delete handlers[name]};
 const win={location:{reload:()=>reloads++},setInterval:(fn,ms)=>{timers.set(ms,fn);return ms;},clearInterval:id=>timers.delete(id),addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:name=>delete handlers[name]};
 const doc={visibilityState:"visible",addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:name=>delete handlers[name]};
 new Function("navigator","window","document","location","localStorage","Date","useEffect","useState","usePathname","probeOfflineStartup","readColdClock",source+"\nServiceWorkerRegister();")(
   {serviceWorker:worker,onLine:true},win,doc,{origin:"https://workteams.test",pathname:"/app"},{},{now:()=>now},fn=>cleanup=fn(),()=>["",message=>messages.push(message)],()=>"/app",async()=>({scope:"https://workteams.test/"}),()=>({time:{}}));
 const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
 await settle();handlers.controllerchange();await settle();assert.equal(reloads,0);assert.equal(updates,1);
 now+=30001;handlers.pageshow();await settle();assert.equal(updates,2);
 handlers.online();await settle();assert.equal(updates,2,"rapid resume events are throttled");
 now+=30001;handlers.visibilitychange();await settle();assert.equal(updates,3);
 now+=30*60*1000;timers.get(30*60*1000)();await settle();assert.equal(updates,4);
 assert.ok(messages.some(message=>message.includes("current clock and saved sign-in confirmed")));
 cleanup();assert.equal(timers.size,0);assert.deepEqual(Object.keys(handlers),[]);assert.equal(reloads,0);
 console.log("ok - service-worker updates check automatically without reloading active work");
}

{
 const storage=createIndexedDbStorage("workteams-receipt-drill-"+crypto.randomUUID());let now=Date.parse(input.tappedAt);
 const make=()=>createPunchOutbox({storage,now:()=>now,canSend:()=>true,drainIntervalMs:0,send:async p=>({id:p.type==="in"?p.id:p.entryId,clock_in:input.tappedAt,clock_out:p.type==="out"?p.tappedAt:null,location_id:"site-a"})});
 const first=make();const start=await first.enqueue({type:"in",companyId:COMPANY,memberId:MEMBER,locationId:"site-a"});await first.drainOnce();first.stop();
 const reopened=make();await reopened.load();const active=localShift(null,[],COMPANY,MEMBER,reopened.snapshot().receipts);assert.equal(active.id,start.id);assert.equal(localShift(null,[],COMPANY,"different-member",reopened.snapshot().receipts),null);
 now+=7200000;await reopened.enqueue({type:"out",companyId:COMPANY,memberId:MEMBER,entryId:active.id});await reopened.drainOnce();reopened.stop();
 const afterRestart=make();await afterRestart.load();assert.equal(afterRestart.snapshot().records.length,0);assert.equal(afterRestart.snapshot().receipts.length,2);assert.equal(localShift(active,[],COMPANY,MEMBER,afterRestart.snapshot().receipts),null);afterRestart.stop();
 console.log("ok - actual IndexedDB confirmations survive reopening and stale reads cannot resurrect a finished shift");
}
{
 const storage=createMemoryStorage();storage.putReceipt=async()=>{throw Error("quota")};const box=createPunchOutbox({storage,send:async()=>({id:"closed",clock_in:input.tappedAt,clock_out:input.tappedAt}),canSend:()=>true,drainIntervalMs:0});
 await box.enqueue({type:"out",companyId:COMPANY,memberId:MEMBER,entryId:"closed"});await assert.rejects(box.drainOnce(),/quota/);assert.equal(box.snapshot().records[0].status,"queued");assert.equal((await storage.getAll()).length,1);box.stop();
 console.log("ok - failed confirmation persistence retains the original punch and remains retryable");
}

{
 const entry={id:"receipt-in",company_id:COMPANY,member_id:MEMBER,clock_in:"2026-11-24T12:00Z",clock_out:null};
 const receipts=[{punch:{companyId:COMPANY,memberId:MEMBER,type:"in",tappedAtMs:1},entry,deliveredAtMs:100}];
 assert.equal(localShift(null,[],COMPANY,MEMBER,receipts,101),null);
 const corrected={...entry,clock_in:"2026-11-24T12:30Z"};assert.equal(localShift(corrected,[],COMPANY,MEMBER,receipts,0).clock_in,corrected.clock_in);
 assert.equal(localShift(null,[],COMPANY,MEMBER,receipts,99).id,entry.id);
 const page=readFileSync(new URL("../app/app/[companyId]/time/page.js",import.meta.url),"utf8");assert.ok(page.indexOf("const open =")<page.indexOf("[company?.id, member?.id, open?.id]"));
 console.log("ok - newer authoritative closure and corrections win over old receipts; clock-screen hooks read active state after initialization");
}

{
 const active={id:'manager-reopened',company_id:COMPANY,member_id:MEMBER,clock_in:'2026-11-24T15:00Z',clock_out:null,punch_revision:2};
 const oldOut={id:'original-out',punch:{id:'original-out',companyId:COMPANY,memberId:MEMBER,type:'out',entryId:active.id,tappedAtMs:2},entry:{...active,clock_out:'2026-11-24T17:00Z',punch_revision:1},deliveredAtMs:100};
 assert.equal(localShift(active,[],COMPANY,MEMBER,[oldOut],0).id,active.id);
 const legacyOut={...oldOut,entry:{...oldOut.entry}};delete legacyOut.entry.punch_revision;
 assert.equal(localShift(active,[],COMPANY,MEMBER,[legacyOut],0).id,active.id);
 assert.equal(localShift({...active,punch_revision:0},[],COMPANY,MEMBER,[oldOut],0),null);
 const legacy={...active};delete legacy.punch_revision;
 assert.equal(localShift(legacy,[],COMPANY,MEMBER,[oldOut],101).id,active.id);
 const acknowledged={id:active.id,type:'in',companyId:COMPANY,memberId:MEMBER,tappedAt:'2026-11-24T14:00Z',tappedAtMs:1};
 const inReceipt={id:active.id,punch:acknowledged,entry:{...active,punch_revision:0},deliveredAtMs:100};
 const corrected={...active,clock_in:'2026-11-24T15:30Z',punch_revision:3};
 assert.equal(localShift(corrected,[acknowledged],COMPANY,MEMBER,[inReceipt,oldOut],0).clock_in,corrected.clock_in);
 assert.equal(localShift({...active,company_id:'foreign'},[],COMPANY,MEMBER,[],0),null);
 console.log('ok - older finishing receipts and acknowledged originals cannot hide management reopenings or reverse corrected starts');
}
{
 const source=readFileSync(new URL('../app/app/[companyId]/time/page.js',import.meta.url),'utf8');
 const expression=source.split('canSend: (r) => ')[1].split(',\n')[0];const liveAuthUserRef={current:null};
 const canSend=new Function('company','member','liveAuthUserRef','return r=>('+expression+');')({id:COMPANY},{id:MEMBER,user_id:'actor-a'},liveAuthUserRef);
 const punch={companyId:COMPANY,memberId:MEMBER};assert.equal(canSend(punch),false);
 liveAuthUserRef.current='actor-b';assert.equal(canSend(punch),false);liveAuthUserRef.current='actor-a';assert.equal(canSend(punch),true);
 assert.equal(canSend({...punch,memberId:'other'}),false);
 console.log('ok - actual time-clock sender predicate pauses when the authenticated actor changes');
}

{
 for(const patch of [{id:'wrong-entry'},{company_id:'foreign'},{member_id:'foreign'},{clock_out:null},{clock_out:'invalid'}]){
  const storage=createMemoryStorage(),box=createPunchOutbox({storage,canSend:()=>true,drainIntervalMs:0,
   send:async()=>({id:'receipt-entry',company_id:COMPANY,member_id:MEMBER,clock_in:'2026-11-24T12:00Z',clock_out:'2026-11-24T14:00Z',...patch})});
  await box.enqueue({type:'out',companyId:COMPANY,memberId:MEMBER,entryId:'receipt-entry'});
  await assert.rejects(box.drainOnce(),/receipt does not match/);assert.equal((await storage.getAll()).length,1);assert.equal(box.snapshot().lastDelivered,null);box.stop();
 }
 const storage=createMemoryStorage(),box=createPunchOutbox({storage,canSend:()=>true,drainIntervalMs:0,
  send:async()=>({id:'receipt-entry',clock_in:'2026-11-24T12:00Z',clock_out:'2026-11-24T14:00Z',notes:'private note',pay_rate_applied:30,clock_in_lat:38,access_token:'synthetic-secret'})});
 await box.enqueue({type:'out',companyId:COMPANY,memberId:MEMBER,entryId:'receipt-entry',notes:'private note',lat:38,lng:-90});await box.drainOnce();
 const saved=JSON.stringify(await storage.getReceipts());assert.ok(!saved.includes('private note'));assert.ok(!saved.includes('synthetic-secret'));assert.ok(!saved.includes('pay_rate_applied'));assert.ok(!saved.includes('clock_in_lat'));box.stop();
 console.log('ok - invalid/foreign receipts retain originals and durable confirmations exclude notes, pay rates, GPS and credentials');
}
