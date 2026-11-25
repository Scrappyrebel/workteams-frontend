// Project durable, scoped punches over the last server snapshot. Reconnect
// reads must never resurrect a shift already clocked out on this device.
export function localShift(serverEntry, records, companyId, memberId) {
  const mine = records.filter(r => r.companyId === companyId && r.memberId === memberId);
  const pendingIn = mine.find(r => r.type === "in");
  const candidate = pendingIn ? {
    id: pendingIn.id, company_id: companyId, member_id: memberId,
    clock_in: pendingIn.tappedAt, clock_out: null,
    location_id: pendingIn.locationId, clock_in_role: pendingIn.clockInRole,
    local: true, reviewRequired: pendingIn.status === "blocked",
  } : serverEntry?.company_id === companyId && serverEntry?.member_id === memberId ? serverEntry : null;
  if (!candidate) return null;
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
