// Offline context — the last server-confirmed picture of "who am I,
// where do I work, what is my shift", kept on the phone so the Time
// Clock can open and take punches with no signal at all.
//
// Why this exists (drills, 2026-11-18): in airplane mode WorkTeams
// could not clock anyone in. The punch outbox (lib/punch-outbox.mjs)
// already guarantees a TAP is never lost — but the app itself could
// not start offline: the company layout identifies the user against
// the server, and the time page loads locations, today's shifts and
// the open entry from the database before it will render the clock.
//
// The pattern (the one Workforce proved in the same drills): cache
// the pages (public/sw.js) + cache the context + queue the punches.
// This module is the context piece. It stores ONLY what the server
// already confirmed while the phone was online:
//
//   shell — user id, the company row, the member row (saved by the
//           company layout after a successful load).
//   time  — locations, today's valid shifts, the open entry, hats
//           (saved by the time page after a successful load), plus
//           forDate: the local date those shifts belong to.
//
// Safety rules baked in:
//   * A snapshot is keyed by (user id, company id) and is only ever
//     read back for that same pair — a shared phone never shows one
//     person's context to another.
//   * Clock-IN data (shifts/locations) is only usable on the date it
//     was saved for. Yesterday's schedule never clocks anyone in
//     today; the page re-checks each shift's window anyway.
//   * The open entry is usable for clock-OUT whenever it exists: a
//     shift clocked in online in the morning must clock out at night
//     in a dead-signal building, even across midnight.
//   * A snapshot never SENDS anything. Punches still travel through
//     the outbox to the server, which re-checks the session, the
//     schedule and the geofence before recording them. If the
//     session died, delivery fails loudly on screen — nothing is
//     ever accepted from the snapshot alone.

export const OFFLINE_CONTEXT_KEY_PREFIX = "workteams-offline-context-v1";

export function offlineContextKey(userId, companyId) {
  return `${OFFLINE_CONTEXT_KEY_PREFIX}:${userId}:${companyId}`;
}

function storageGet(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function storageSet(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Merge a section ({ shell } or { time }) into the stored snapshot
// for this (user, company). Returns true when written.
export function saveOfflineContext(storage, userId, companyId, patch) {
  if (!storage || !userId || !companyId || !patch) return false;
  const key = offlineContextKey(userId, companyId);
  const existing = storageGet(storage, key) || { userId, companyId };
  if (existing.userId !== userId || existing.companyId !== companyId) return false;
  const next = { ...existing, ...patch, userId, companyId, savedAtMs: Date.now() };
  return storageSet(storage, key, next);
}

// The stored snapshot for exactly this (user, company), or null.
export function loadOfflineContext(storage, userId, companyId) {
  if (!storage || !userId || !companyId) return null;
  const snap = storageGet(storage, offlineContextKey(userId, companyId));
  if (!snap) return null;
  if (snap.userId !== userId || snap.companyId !== companyId) return null;
  return snap;
}

export function clearOfflineContext(storage, userId, companyId) {
  if (!storage || !userId || !companyId) return;
  try {
    storage.removeItem(offlineContextKey(userId, companyId));
  } catch {
    /* already gone */
  }
}

// The shell section (company + member), or null when absent/invalid.
export function shellSnapshot(snap) {
  const shell = snap?.shell;
  if (!shell?.company?.id || !shell?.member?.id) return null;
  return shell;
}

// Clock-in may use the time section only on the date it was saved
// for. Returns the time section, or null.
export function clockInSnapshot(snap, todayISO) {
  const time = snap?.time;
  if (!time || time.forDate !== todayISO) return null;
  if (!Array.isArray(time.shifts) || !Array.isArray(time.locations)) return null;
  return time;
}

// The open entry saved with the time section (for an offline
// clock-out), or null. Not date-gated — see the header.
export function openEntrySnapshot(snap) {
  const entry = snap?.time?.openEntry;
  return entry && entry.id ? entry : null;
}

// Browser storage handle (localStorage), or null where unavailable.
export function browserOfflineStorage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* private modes can throw on access */
  }
  return null;
}


// Local identity only selects an already authenticated, scoped device copy.
// It never authorizes server writes; delivery validates the real session.
export function cachedOfflineUser(storage, supabaseUrl) {
  try {
    const ref=new URL(supabaseUrl).hostname.split(".")[0];
    const session=JSON.parse(storage.getItem(`sb-${ref}-auth-token`) || "null");
    if(!session?.access_token || !session?.refresh_token || !session?.user?.id)return null;
    return {id:session.user.id,email:session.user.email};
  } catch {return null;}
}
