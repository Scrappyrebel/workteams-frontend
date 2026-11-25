// Bundled into the public worker's offline HTML; no Next chunks or network imports.
export async function coldClockClient(core) {
  const el = id => document.getElementById(id);
  const status=el("clock-status"), controls=el("clock-controls"), locations=el("clock-location"), roles=el("clock-role");
  let snap, outbox, busy=false, reconnect=false, gps=Promise.resolve();
  const scope = () => {const current=core.readColdClock(localStorage, location.pathname);
    if(current.userId!==snap.userId || current.companyId!==snap.companyId || current.shell.member.id!==snap.shell.member.id || current.authSessionId!==snap.authSessionId)
      throw Error("Your sign-in or company changed. Reconnect before saving more time.");};
  const mine = row => row.companyId===snap.companyId && row.memberId===snap.shell.member.id;
  const needsRefresh = () => outbox.snapshot().receipts.some(r=>mine(r.punch||{}) && r.punch.type==="in" && r.deliveredAtMs>=(snap.time?.serverReadStartedAt||0));
  const active = () => core.localShift(snap.time?.openEntry ? {...snap.time.openEntry,company_id:snap.companyId,member_id:snap.shell.member.id}:null,
    outbox.snapshot().records,snap.companyId,snap.shell.member.id,outbox.snapshot().receipts,snap.time?.serverReadStartedAt||0);
  function eligible(){
    const zone=snap.shell.company.timezone || "America/Chicago";
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const get=k=>parts.find(p=>p.type===k)?.value, today=`${get("year")}-${get("month")}-${get("day")}`;
    // The existing saved query is already member-scoped and selects no member_id.
    // Reject an explicit mismatch while accepting that verified legacy shape.
    return snap.time?.forDate===today ? (snap.time.shifts||[]).filter(s=>(!s.member_id || s.member_id===snap.shell.member.id) &&
      (!s.company_id||s.company_id===snap.companyId) && core.chooseAssignedShift([s],new Date(),new Set(),zone)) : [];
  }
  function render(){
    try{scope();}catch(error){controls.hidden=true;el("clock-company").textContent="WorkTeams";el("clock-summary").textContent="";status.textContent=error.message;return;}
    const entry=active(), pending=outbox.snapshot().records.filter(mine);
    el("clock-in").disabled=busy || !!entry || pending.length>0 || needsRefresh() || !eligible().some(s=>s.location_id===locations.value) || (roles.options.length>1&&!roles.value);
    el("clock-out").disabled=busy || !entry;
    locations.disabled=busy || !!entry;roles.disabled=busy || !!entry;
    const lastOut=pending.filter(p=>p.type==="out").sort((a,b)=>b.tappedAtMs-a.tappedAtMs)[0];
    el("clock-summary").textContent=entry ? `Clock-in saved: ${new Date(entry.clock_in).toLocaleString()}. You can save your finishing time without signal.` :
      lastOut ? `Finishing time saved on this phone: ${new Date(lastOut.tappedAt).toLocaleString()}. Awaiting server synchronization.` : "Choose a saved assigned location. A current schedule is required for a new clock-in.";
  }
  async function returnOnline(){
    if(navigator.onLine===false){status.textContent="Still offline. Your saved time remains on this phone.";return;}
    reconnect=true;if(busy)return;await gps.catch(()=>{});
    location.replace(`/app/${snap.companyId}/time`);
  }
  async function save(type){
    if(busy)return;busy=true;render();
    try{
      scope();await outbox.load();const entry=active();
      const shift=eligible().find(s=>s.location_id===locations.value);
      if(type==="in" && (entry || outbox.snapshot().records.some(mine) || needsRefresh() || !shift || (roles.options.length>1&&!roles.value)))throw Error("No unused assigned clock-in is available. Reconnect to refresh your schedule.");
      if(type==="out"&&!entry)throw Error("No open time entry is available to finish.");
      const punch=await outbox.enqueue({type,companyId:snap.companyId,memberId:snap.shell.member.id,
        entryId:type==="out"?entry.id:null,locationId:type==="out"?entry.location_id:shift.location_id,
        clockInRole:type==="in"&&roles.options.length>1?roles.value:null,lat:null,lng:null,awaitingGps:false});
      status.textContent=`${type==="in"?"Clock-in":"Clock-out"} saved on this phone. It will send when you reconnect. Required proof remains separate.`;
      if(navigator.geolocation)gps=new Promise(resolve=>navigator.geolocation.getCurrentPosition(
        position=>{void outbox.attachGps(punch.id,{lat:position.coords.latitude,lng:position.coords.longitude}).catch(()=>{}).finally(resolve);},
        ()=>resolve(),{enableHighAccuracy:true,timeout:8000}));
    }catch(error){status.textContent=error.message || "Your time could not be saved. Keep device data and contact management.";}
    finally{busy=false;render();if(reconnect)void returnOnline();}
  }
  try{
    snap=core.readColdClock(localStorage,location.pathname);
    el("clock-company").textContent=snap.shell.company.name || "WorkTeams";
    const storage=await core.openBrowserPunchStorage();
    outbox=core.createPunchOutbox({storage,canSend:()=>false,send:async()=>{throw Error("Reconnect to synchronize.");},onChange:()=>{if(outbox)render();}});
    await outbox.load();
    for(const id of new Set(eligible().map(s=>s.location_id))){const option=document.createElement("option");option.value=id;
      option.textContent=snap.time.locations?.find(l=>l.id===id)?.name || "Assigned location";locations.append(option);}
    const hats=snap.time?.hats||[];
    if(hats.length>1){const option=document.createElement("option");option.value="";option.textContent="Choose working role";roles.append(option);}
    for(const hat of hats){const option=document.createElement("option");option.value=typeof hat==="string"?hat:hat.key||"";option.textContent=hat.label||option.value;roles.append(option);}
    controls.hidden=false;status.textContent="Offline clock ready. Times are saved on this phone; server confirmation happens after reconnection.";
    el("clock-in").onclick=()=>save("in");el("clock-out").onclick=()=>save("out");
    locations.onchange=render;roles.onchange=render;el("clock-reconnect").onclick=()=>returnOnline();
    window.addEventListener("online",()=>void returnOnline());window.addEventListener("storage",render);
    render();
  }catch(error){controls.hidden=true;status.textContent=error.message || "Offline startup could not read this device's prepared clock. Reconnect once; keep your saved app data.";}
}
