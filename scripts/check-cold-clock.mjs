import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {IDBFactory} from "fake-indexeddb";
import {prepareColdClock,readColdClock} from "../lib/cold-clock-identity.mjs";
import {createIndexedDbStorage,createPunchOutbox} from "../lib/punch-outbox.mjs";
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const generated={self:{}};vm.runInNewContext(read("public/offline-clock-shell.js"),generated);
const html=generated.self.WORKTEAMS_OFFLINE_HTML;
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const company="11111111-1111-4111-8111-111111111111",otherCompany="22222222-2222-4222-8222-222222222222";
const user="user-1",member="member-1",key="sb-test-auth-token",now=Date.now();
const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
function fixture(cid=company,uid=user,mid=member){
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
 const token=uid=>`header.${btoa(JSON.stringify({sub:uid,session_id:"session-1"}))}.signature`;
 storage.setItem(key,JSON.stringify({access_token:token(uid),refresh_token:"local-test",user:{id:uid}}));
 const snap={userId:uid,companyId:cid,shell:{company:{id:cid,name:"Subscriber",timezone:"America/Chicago"},member:{id:mid,user_id:uid,company_id:cid}},
  time:{forDate:day,serverReadStartedAt:now-1000,openEntry:null,shifts:[{id:"shift",company_id:cid,member_id:mid,location_id:"site",shift_date:day,start_time:"23:59",end_time:"23:59:59"}],locations:[{id:"site",name:"Office"}],hats:[]}};
 storage.setItem(`workteams-offline-context-v1:${uid}:${cid}`,JSON.stringify(snap));
 assert.equal(prepareColdClock(storage,uid,cid,"https://test.supabase.co"),true);
 return {storage,idb:new IDBFactory(),cid,uid,mid,map};
}
async function screen(f,path=`/app/${f.cid}/time`){
 const elements=new Map(),listeners={},navigations=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{id,hidden:false,disabled:true,textContent:"",options:[],value:"",append(o){this.options.push(o);if(this.options.length===1)this.value=o.value;}});return elements.get(id);};
 const context={self:{},document:{getElementById:element,createElement:()=>({value:"",textContent:""})},localStorage:f.storage,indexedDB:f.idb,
  location:{pathname:path,replace:url=>navigations.push(url)},navigator:{onLine:false},window:{addEventListener:(name,fn)=>{listeners[name]=fn;}},
  crypto:webcrypto,Date,Intl,URL,atob,setTimeout,clearTimeout,setInterval,clearInterval,console};
 await vm.runInNewContext(script,context);
 return {element,listeners,navigations,context};
}
test("actual generated startup needs no cached HTML, Next chunks, imports or network",()=>{
 assert.ok(html.includes("Offline Time Clock"));assert.ok(!/<script[^>]+src=/.test(html));assert.ok(!/import\s*\(/.test(script));
 const sw=read("public/sw.js"),handlers={};
 const worker={self:{location:{origin:"https://workteams.test"},addEventListener:(type,fn)=>{(handlers[type]||=[]).push(fn);}},
  importScripts:()=>{},Response,URL,AbortController,setTimeout,clearTimeout,fetch:async()=>{throw Error("airplane mode");}};
 worker.self.WORKTEAMS_OFFLINE_HTML=html;vm.runInNewContext(sw,worker);
 return (async()=>{for(const path of ["/app",`/app/${company}/time`]){let result;
  for(const fn of handlers.fetch)fn({request:{method:"GET",mode:"navigate",url:`https://workteams.test${path}`},respondWith:p=>{result=p;},waitUntil:()=>{}});
  const response=await result;assert.equal(response.status,200);assert.match(await response.text(),/Offline Time Clock/);
  assert.match(response.headers.get("cache-control"),/no-store/);
 }})();
});
test("cold restart saves both original punches through the existing queue; reconnect delivers once",async()=>{
 const f=fixture();let page=await screen(f,"/app");assert.equal(page.element("clock-controls").hidden,false);
 assert.equal(page.element("clock-in").disabled,false);await page.element("clock-in").onclick();
 page=await screen(f);assert.equal(page.element("clock-in").disabled,true);assert.equal(page.element("clock-out").disabled,false);
 await page.element("clock-out").onclick();page=await screen(f);assert.equal(page.element("clock-out").disabled,true);
 globalThis.indexedDB=f.idb;const storage=createIndexedDbStorage();// IndexedDB returns key order (random UUIDs), not tap order.
 const queued=(await storage.getAll()).sort((a,b)=>a.tappedAtMs-b.tappedAtMs||a.createdSeq-b.createdSeq);assert.equal(queued.length,2);
 assert.deepEqual(queued.map(p=>p.type),["in","out"]);assert.equal(queued[1].entryId,queued[0].id);
 page.context.navigator.onLine=true;await page.listeners.online();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(page.navigations,[`/app/${company}/time`]);
 const entries=new Map();const sender=createPunchOutbox({storage,send:async p=>{
  if(p.type==="in")entries.set(p.id,{id:p.id,company_id:p.companyId,member_id:p.memberId,location_id:p.locationId,clock_in:p.tappedAt,clock_out:null,punch_revision:0});
  else{const entry=entries.get(p.entryId);assert.ok(entry);entry.clock_out=p.tappedAt;entry.punch_revision=1;}
  return entries.get(p.type==="in"?p.id:p.entryId);
 }});
 await sender.load();await sender.drainOnce();await sender.drainOnce();sender.stop();
 assert.equal(entries.size,1);assert.equal([...entries.values()][0].clock_in,queued[0].tappedAt);assert.equal([...entries.values()][0].clock_out,queued[1].tappedAt);
 assert.equal((await storage.getAll()).length,0);assert.equal((await storage.getReceipts()).length,2);
 page=await screen(f);assert.equal(page.element("clock-in").disabled,true,"a stale schedule cannot replay a completed punch");
});
test("two subscribers stay isolated; sign-out, another login and foreign routes cannot open a saved clock",async()=>{
 for(const [cid,uid,mid] of [[company,user,member],[otherCompany,"user-2","member-2"]]){
  const f=fixture(cid,uid,mid),good=await screen(f);assert.equal(good.element("clock-controls").hidden,false);
  const foreign=await screen(f,`/app/${cid===company?otherCompany:company}/time`);assert.equal(foreign.element("clock-controls").hidden,true);
  f.storage.removeItem(key);const signedOut=await screen(f);assert.equal(signedOut.element("clock-controls").hidden,true);
 }
 const f=fixture();const session=JSON.parse(f.storage.getItem(key));session.access_token=`h.${btoa(JSON.stringify({sub:user,session_id:"new-session"}))}.s`;f.storage.setItem(key,JSON.stringify(session));
 assert.throws(()=>readColdClock(f.storage,`/app/${company}/time`));
});
test("stale assignments cannot clock in; overnight open entries can still clock out",async()=>{
 const f=fixture(),k=`workteams-offline-context-v1:${user}:${company}`,snap=JSON.parse(f.storage.getItem(k));snap.time.forDate="2000-01-01";
 f.storage.setItem(k,JSON.stringify(snap));let page=await screen(f);assert.equal(page.element("clock-in").disabled,true);
 snap.time.openEntry={id:"overnight",location_id:"site",clock_in:"2026-11-24T23:00:00Z",clock_out:null,punch_revision:0};f.storage.setItem(k,JSON.stringify(snap));
 page=await screen(f);assert.equal(page.element("clock-out").disabled,false);await page.element("clock-out").onclick();
 globalThis.indexedDB=f.idb;assert.equal((await createIndexedDbStorage().getAll())[0].entryId,"overnight");
});
test("unreadable context fails closed and no startup code clears saved media",async()=>{
 const f=fixture();f.storage.getItem=()=>{throw Error("storage unavailable");};const page=await screen(f);assert.equal(page.element("clock-controls").hidden,true);
 assert.ok(!script.includes("vaultRemove("));assert.ok(!script.includes("deleteDatabase("));
});
test("failed durable writes never claim saved; multiple working roles preserve the selected key",async()=>{
 const f=fixture();f.idb.open=()=>{throw Error("IndexedDB unavailable");};
 const put=f.storage.setItem;f.storage.setItem=(key,value)=>{if(key.startsWith("workteams-punch-outbox"))throw Error("Device storage is full");put(key,value);};
 let page=await screen(f);await page.element("clock-in").onclick();assert.ok(!page.element("clock-status").textContent.includes("Clock-in saved"));
 assert.match(page.element("clock-status").textContent,/storage/);
 const second=fixture(),key=`workteams-offline-context-v1:${user}:${company}`,snap=JSON.parse(second.storage.getItem(key));
 snap.time.hats=[{key:"cleaner",label:"Cleaner"},{key:"manager",label:"Manager"}];second.storage.setItem(key,JSON.stringify(snap));
 page=await screen(second);assert.equal(page.element("clock-in").disabled,true);
 page.element("clock-role").value="cleaner";page.element("clock-role").onchange();await page.element("clock-in").onclick();
 globalThis.indexedDB=second.idb;assert.equal((await createIndexedDbStorage().getAll())[0].clockInRole,"cleaner");
});
