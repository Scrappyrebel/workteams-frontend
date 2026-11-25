// Project scoped, durable originals and receipts over a server snapshot.
// A receipt cannot reverse a newer manager correction or reopening.
export function localShift(serverEntry, records, companyId, memberId, receipts = [], serverReadStartedAt = 0) {
  const scoped=receipts.filter(r=>r?.punch?.companyId===companyId&&r.punch.memberId===memberId)
    .sort((a,b)=>(a.deliveredAtMs||0)-(b.deliveredAtMs||0));
  const acknowledged=new Set(scoped.map(r=>r.punch.id||r.id).filter(Boolean));
  const mine=records.filter(r=>r.companyId===companyId&&r.memberId===memberId&&!acknowledged.has(r.id))
    .sort((a,b)=>a.tappedAtMs-b.tappedAtMs||(a.createdSeq||0)-(b.createdSeq||0));
  const entries=new Map();
  const ownServer=serverEntry?.company_id===companyId&&serverEntry?.member_id===memberId?serverEntry:null;
  if(ownServer)entries.set(ownServer.id,{...ownServer});
  for(const receipt of scoped){
    const value=receipt.entry,punch=receipt.punch;
    if(!value?.id||(value.company_id!==undefined&&value.company_id!==companyId)||
       (value.member_id!==undefined&&value.member_id!==memberId)||
       (punch.type==='out'&&value.id!==punch.entryId)||
       (punch.type==='in'&&punch.id&&value.id!==punch.id))continue;
    const fresh=serverReadStartedAt===0||receipt.deliveredAtMs>=serverReadStartedAt;
    if(ownServer?.id===value.id){
      if(Number.isInteger(ownServer.punch_revision)&&ownServer.punch_revision>0&&!Number.isInteger(value.punch_revision))continue;
      const revisions=Number.isInteger(ownServer.punch_revision)&&Number.isInteger(value.punch_revision);
      if(revisions?(value.punch_revision<ownServer.punch_revision||(value.punch_revision===ownServer.punch_revision&&punch.type==='in')):(!fresh||(punch.type==='in'&&!value.clock_out)))continue;
    }else if(!fresh)continue;
    const current=entries.get(value.id);
    if(current&&Number.isInteger(current.punch_revision)&&Number.isInteger(value.punch_revision)&&value.punch_revision<current.punch_revision)continue;
    entries.set(value.id,{...current,...value,company_id:companyId,member_id:memberId});
  }
  for(const punch of mine){
    if(punch.type==='in'&&!entries.has(punch.id))entries.set(punch.id,{id:punch.id,company_id:companyId,member_id:memberId,
      clock_in:punch.tappedAt,clock_out:null,location_id:punch.locationId,clock_in_role:punch.clockInRole,
      local:true,reviewRequired:punch.status==='blocked'});
    if(punch.type==='out'&&entries.has(punch.entryId)){
      const current=entries.get(punch.entryId);
      if(!current.clock_out)entries.set(punch.entryId,{...current,clock_out:punch.tappedAt});
    }
  }
  return [...entries.values()].filter(entry=>!entry.clock_out).sort((a,b)=>Date.parse(b.clock_in)-Date.parse(a.clock_in))[0]||null;
}

export function devicePunchTime(value, receivedAt = Date.now(), clockIn = null) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms > receivedAt || (clockIn && ms < Date.parse(clockIn))) {
    throw new Error("Original device time needs management review.");
  }
  return new Date(ms).toISOString();
}
