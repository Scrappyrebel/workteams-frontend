import assert from "node:assert/strict";
import { createPunchOutbox, createMemoryStorage, createLocalStorageAdapter } from "../lib/punch-outbox.mjs";
const intent = {type:"out",companyId:"company-a",userId:"worker-a",memberId:"worker-a",employeeId:"worker-a",entryId:"entry-a",shiftId:"shift-a",payload:{clock_out_at:"2026-11-25T02:00:00Z"}};
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const make = overrides => createPunchOutbox({storage:createMemoryStorage(),send:async()=>null,canSend:()=>false,drainIntervalMs:0,...overrides});
let failed=0;
async function check(name,run){try{await run();console.log("ok - "+name)}catch(e){failed++;console.error("FAIL - "+name+": "+e.message)}}
await check("simultaneous repeated taps persist one original punch",async()=>{
 const storage=createMemoryStorage(), put=storage.put;storage.put=async r=>{await pause(5);await put(r)};
 const box=make({storage});const punches=await Promise.all(Array.from({length:10},()=>box.enqueue(intent)));
 assert.equal(new Set(punches.map(p=>p.id)).size,1);assert.equal((await storage.getAll()).length,1);box.stop();
});
await check("failed local write never appears saved",async()=>{
 const box=make({storage:{getAll:async()=>[],put:async()=>{throw Error("quota")},remove:async()=>{}}});
 await assert.rejects(box.enqueue(intent),/quota/);assert.equal(box.snapshot().records.length,0);box.stop();
});
await check("blocked punch retains identity and timestamp on repeated tap",async()=>{
 const storage=createMemoryStorage();const box=make({storage,canSend:()=>true,send:async()=>{throw Object.assign(Error("management review"),{permanent:true})}});
 const first=await box.enqueue(intent);await box.drainOnce();const repeat=await box.enqueue(intent);
 assert.equal(repeat.id,first.id);assert.equal(repeat.tappedAt,first.tappedAt);assert.equal(repeat.status,"blocked");box.stop();
});
await check("hung confirmation cannot strand delivery",async()=>{
 const box=make({canSend:()=>true,sendTimeoutMs:10,send:async()=>({id:"entry-a",clock_in:"2026-11-24T12:00Z",clock_out:"2026-11-24T14:00Z"}),confirm:()=>new Promise(()=>{})});
 await box.enqueue(intent);let timer;try{await Promise.race([box.drainOnce(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("confirmation hung")),150)})]);assert.equal(box.snapshot().records.length,0)}finally{clearTimeout(timer);box.stop()}
});
await check("corrupt local storage is reported without erasing punches",async()=>{
 let value="{broken",writes=0;const storage=createLocalStorageAdapter({getItem:()=>value,setItem:(_,v)=>{writes++;value=v}});
 await assert.rejects(storage.getAll());assert.equal(writes,0);
});
await check("other employee punches stay pending",async()=>{
 const storage=createMemoryStorage();const first=make({storage});await first.enqueue(intent);first.stop();
 let sends=0;const other=make({storage,canSend:r=>r.companyId==="company-b",send:async()=>{sends++;return {id:"wrong"}}});
 await other.load();await other.drainOnce();assert.equal(sends,0);assert.equal(other.snapshot().records.length,1);other.stop();
});
if(failed)process.exitCode=1;

