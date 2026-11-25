// media-vault.mjs — the durable on-phone vault for end-of-shift proof
// media (Wendy, 2026-11-18 offline-fix requirements: walkthrough video
// and book picture must capture offline and upload on reconnect, and
// the saved-offline state must be unmistakable).
//
// Before this vault, a recording lived only in page memory
// (window.__endShiftVideoBlob / the photo File in state): closing the
// page or the phone dying took the proof with it. Now every capture
// is ALSO written here — IndexedDB, keyed one-per-entry-per-kind —
// the moment it exists, and removed only when the upload through
// EndShiftProof's own verified path has succeeded. EndShiftProof
// drains the vault for its entry when it mounts and when the phone
// comes back online, reusing the exact same upload code (no second
// upload implementation to drift).
//
// The vault stores Blobs. It never uploads anything itself and holds
// no credentials.

export const MEDIA_VAULT_DB_NAME = "workteams-media-vault";
const STORE = "media";

export function vaultKey(entryId, kind) {
  return `${entryId}:${kind}`;
}

function openDb(dbName = MEDIA_VAULT_DB_NAME) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, run) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    const req = run(store);
    if (req && typeof req === "object" && "onsuccess" in req) {
      req.onsuccess = () => { result = req.result; };
      req.onerror = () => reject(req.error);
    } else {
      result = req;
    }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// Volatile memory must never be reported as a durable saved capture.
async function withStore(mode, run) {
  if (typeof indexedDB === "undefined") throw new Error("Durable media storage unavailable");
  let db;
  try { db = await openDb(); return await tx(db, mode, run); }
  finally { try { db?.close(); } catch {} }
}

// Save (or replace) the capture for an entry + kind. Fire-and-forget
// friendly: resolves true when stored, false when storage failed.
export async function vaultPut(item) {
  const record = { ...item, key: vaultKey(item.entryId, item.kind), createdAt: item.createdAt || Date.now() };
  return withStore("readwrite", (store) => {
    store.put(record);
    return true;
  }).catch(() => false);
}

export async function vaultGet(entryId, kind) {
  const key = vaultKey(entryId, kind);
  return withStore("readonly", (store) => {
    return store.get(key);
  }).then((r) => r || null).catch(() => null);
}

export async function vaultRemove(entryId, kind) {
  const key = vaultKey(entryId, kind);
  return withStore("readwrite", (store) => {
    store.delete(key);
    return true;
  }).catch(() => false);
}

// All vault items for one company + member (metadata AND blobs — the
// caller decides what to load). Used by the time page's saved-offline
// banner count and available to a future manager view.
export async function vaultListFor({ companyId, memberId } = {}) {
  const all = await withStore("readonly", (store) => {
    return store.getAll();
  }).catch(() => []);
  return (all || []).filter((i) =>
    (!companyId || i.companyId === companyId) && (!memberId || i.memberId === memberId)
  );
}

export async function vaultCountFor(scope) {
  return (await vaultListFor(scope)).length;
}

