// A device copy selects a previously verified scope; it never authorizes delivery.
export const COLD_CLOCK_POINTER = "workteams-offline-clock-scope-v1";
export function coldClockSession(storage, key) {
  try {
    if (!/^sb-[a-z0-9]+-auth-token$/.test(key)) return null;
    const session = JSON.parse(storage.getItem(key) || "null");
    if (!session?.access_token || !session.refresh_token || !session.user?.id) return null;
    const part = session.access_token.split(".")[1];
    const jwt = JSON.parse(atob(part.replace(/-/g,"+").replace(/_/g,"/")));
    if (jwt.sub !== session.user.id || !jwt.session_id) return null;
    return {userId:session.user.id, sessionId:jwt.session_id};
  } catch { return null; }
}
export function prepareColdClock(storage, userId, companyId, supabaseUrl) {
  try {
    const authKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
    const identity = coldClockSession(storage, authKey);
    const key = `workteams-offline-context-v1:${userId}:${companyId}`;
    const snap = JSON.parse(storage.getItem(key) || "null");
    if (identity?.userId !== userId || snap?.userId !== userId || snap.companyId !== companyId ||
        snap.shell?.company?.id !== companyId || snap.shell?.member?.user_id !== userId ||
        snap.shell?.member?.company_id !== companyId) return false;
    storage.setItem(key, JSON.stringify({...snap, authKey, authSessionId:identity.sessionId}));
    storage.setItem(COLD_CLOCK_POINTER, JSON.stringify({...identity, companyId, authKey}));
    return true;
  } catch { return false; }
}
export function readColdClock(storage, pathname) {
  const pointer = JSON.parse(storage.getItem(COLD_CLOCK_POINTER) || "null");
  const identity = pointer && coldClockSession(storage, pointer.authKey);
  if (!identity || identity.userId !== pointer.userId || identity.sessionId !== pointer.sessionId)
    throw Error("Reconnect and open your assigned Time Clock once to prepare offline startup for this sign-in.");
  const match = pathname.match(/^\/app\/([0-9a-f-]{36})(?:\/time)?\/?$/i);
  if (!match && !["/", "/app", "/app/"].includes(pathname)) throw Error("Reconnect to open this page.");
  const companyId = match?.[1] || pointer.companyId;
  const snap = JSON.parse(storage.getItem(`workteams-offline-context-v1:${identity.userId}:${companyId}`) || "null");
  if (snap?.userId !== identity.userId || snap.companyId !== companyId || snap.authKey !== pointer.authKey ||
      snap.authSessionId !== identity.sessionId || snap.shell?.company?.id !== companyId ||
      snap.shell?.member?.user_id !== identity.userId || snap.shell?.member?.company_id !== companyId || !snap.shell?.member?.id)
    throw Error("No prepared clock matches this company and sign-in. Reconnect and open its Time Clock once.");
  return snap;
}
