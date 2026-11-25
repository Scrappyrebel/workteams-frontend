// Project durable, scoped punches over the last server snapshot. Reconnect
// reads must never resurrect a shift already clocked out on this device.
export function localShift(serverEntry, records, companyId, memberId, receipts = [], serverReadStartedAt = 0) {
  const mine = records.filter(r => r.companyId === companyId && r.memberId === memberId);
  const scopedReceipts=receipts.filter(r=>r.punch.companyId===companyId && r.punch.memberId===memberId).sort((a,b)=>b.punch.tappedAtMs-a.punch.tappedAtMs);
  const receivedIn=scopedReceipts.find(r=>r.punch.type==="in");
  const receivedEntry=receivedIn ? {...receivedIn.entry,company_id:companyId,member_id:memberId} : null;
  const receiptIsNewer = receivedIn && receivedIn.deliveredAtMs >= serverReadStartedAt;
  const source=receivedEntry && receiptIsNewer && serverEntry?.id !== receivedEntry.id && (!serverEntry || Date.parse(receivedEntry.clock_in)>Date.parse(serverEntry.clock_in)) ? receivedEntry : serverEntry;
  const pendingIn = mine.find(r => r.type === "in");
  const candidate = pendingIn ? {
    id: pendingIn.id, company_id: companyId, member_id: memberId,
    clock_in: pendingIn.tappedAt, clock_out: null,
    location_id: pendingIn.locationId, clock_in_role: pendingIn.clockInRole,
    local: true, reviewRequired: pendingIn.status === "blocked",
  } : source?.company_id === companyId && source?.member_id === memberId ? source : null;
  if (!candidate || candidate.clock_out) return null;
  if(scopedReceipts.some(r=>r.punch.type==="out" && r.punch.entryId===candidate.id))return null;
  if (mine.some(r => r.type === "out" && r.entryId === candidate.id)) return null;
  return candidate;
}

export function devicePunchTime(value, receivedAt = Date.now(), clockIn = null) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms > receivedAt || (clockIn && ms < Date.parse(clockIn))) {
    throw new Error("Original device time needs management review.");
  }
  return new Date(ms).toISOString();
}
