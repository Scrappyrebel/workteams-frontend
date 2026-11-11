// Punch outbox — the local-first delivery guarantee for Clock In / Clock Out.
//
// Why this exists (incident, Sun Nov 8, 2026): an employee tapped Clock Out,
// the single fire-and-forget POST never reached the server, and her shift ran
// 56.16 hours with no trace of the tap anywhere. Diagnosis:
// ~/workspace/workteams-clockout-diagnosis (Candy, 2026-11-11).
//
// The pattern is the one every mature time-clock app uses (offline-first /
// transactional outbox):
//   1. The tap is written to durable on-device storage FIRST — before any
//      network call. From that instant the punch exists even if the app is
//      closed, the phone dies, or the building has no signal.
//   2. A sender drains the outbox in tap order, with a bounded timeout and
//      backoff retries, on enqueue, on reconnect, on page load, and on an
//      interval while the page is open. Nobody has to press "sync".
//   3. Every punch carries a client-generated unique ID. Delivery is
//      idempotent: clock-out targets one specific entry and the API answers
//      an already-closed entry with its recorded state; clock-in is
//      reconciled by read-back, so a retry can never double-pay anyone.
//   4. A timeout means "unknown", never "failed": after any failed or
//      timed-out attempt the sender asks the server what actually happened
//      (read-back) before deciding the punch is still owed.
//   5. The UI reads its truth from this outbox: queued = "saved on this
//      phone", sending = "sending", and "confirmed" is only ever reported
//      after the server's answer comes back.
//
// This module is transport- and storage-agnostic so it can be exercised
// behaviorally in node (scripts/check-punch-outbox.mjs) with a fake server.
// The time page injects the real send/confirm (its api() helper + Supabase
// reads) and the browser storage opened by openBrowserPunchStorage().

export const PUNCH_OUTBOX_DB_NAME = "workteams-punch-outbox";
const PUNCH_STORE = "punches";
const LOCAL_STORAGE_KEY = "workteams-punch-outbox-v1";

const DEFAULT_BACKOFF_MS = [0, 2000, 5000, 15000, 30000, 60000];
const DEFAULT_SEND_TIMEOUT_MS = 20000;
const DEFAULT_GPS_GRACE_MS = 4000;
const DEFAULT_DRAIN_INTERVAL_MS = 30000;
// A server-recorded clock-in this close before the tap still counts as this
// punch's result (server clock vs phone clock skew on the read-back path).
const CONFIRM_SKEW_MS = 5 * 60 * 1000;

export function newPunchId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `punch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ---------------------------------------------------------------- storage

// In-memory adapter — used by the node drill and as the last-resort fallback
// (session-only durability beats losing the punch outright).
export function createMemoryStorage() {
  const map = new Map();
  return {
    async getAll() {
      return [...map.values()].map((r) => ({ ...r }));
    },
    async put(record) {
      map.set(record.id, { ...record });
    },
    async remove(id) {
      map.delete(id);
    },
  };
}

// IndexedDB adapter (preferred in the browser: durable across app kills,
// not subject to localStorage's string quota or sync-write jank).
export function createIndexedDbStorage(dbName = PUNCH_OUTBOX_DB_NAME) {
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(PUNCH_STORE)) {
          req.result.createObjectStore(PUNCH_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function run(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PUNCH_STORE, mode);
      let result;
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error("Punch storage transaction aborted"));
      };
      fn(tx.objectStore(PUNCH_STORE), (v) => {
        result = v;
      });
    });
  }
  return {
    async getAll() {
      return run("readonly", (store, done) => {
        const req = store.getAll();
        req.onsuccess = () => done(req.result || []);
      });
    },
    async put(record) {
      return run("readwrite", (store) => {
        store.put(record);
      });
    },
    async remove(id) {
      return run("readwrite", (store) => {
        store.delete(id);
      });
    },
  };
}

// localStorage adapter — fallback when IndexedDB is unavailable (older
// webviews / private modes that block it).
export function createLocalStorageAdapter(ls, key = LOCAL_STORAGE_KEY) {
  const readAll = () => {
    try {
      const rows = JSON.parse(ls.getItem(key) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };
  const writeAll = (rows) => ls.setItem(key, JSON.stringify(rows));
  return {
    async getAll() {
      return readAll();
    },
    async put(record) {
      const rows = readAll().filter((r) => r.id !== record.id);
      rows.push(record);
      writeAll(rows);
    },
    async remove(id) {
      writeAll(readAll().filter((r) => r.id !== id));
    },
  };
}

// Browser storage: IndexedDB preferred, localStorage fallback, memory last.
// The probe write matters: some browsers expose indexedDB but throw on use.
export async function openBrowserPunchStorage() {
  if (typeof indexedDB !== "undefined") {
    const idb = createIndexedDbStorage();
    try {
      await idb.getAll();
      return idb;
    } catch {
      /* fall through to localStorage */
    }
  }
  if (typeof localStorage !== "undefined") {
    return createLocalStorageAdapter(localStorage);
  }
  return createMemoryStorage();
}

// ---------------------------------------------------------------- helpers

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const err = new Error("Delivery timed out — the server may or may not have received it.");
      err.code = "timeout";
      reject(err);
    }, ms);
    // Deliberately NOT unref'd: this timer is the guarantee that a hung
    // attempt settles. (Retry/interval timers below are opportunistic and
    // do unref where the platform supports it.)
    Promise.resolve(promise).then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function byTapOrder(a, b) {
  return a.tappedAtMs - b.tappedAtMs || a.createdSeq - b.createdSeq;
}

// ---------------------------------------------------------------- outbox

// options:
//   storage   — adapter { getAll, put, remove } (required)
//   send      — async (punch) => entry | null. Throws on failure; set
//               err.permanent = true for "the server refused this punch for
//               good" (400/403/404), err.blockedIfUnconfirmed = true when a
//               read-back that finds nothing settles it as blocked (409
//               "already clocked in"). A resolved entry is the server's
//               recorded state for the punch.
//   confirm   — async (punch) => entry | null. Read-back: asks the server
//               whether this punch's effect already exists (used whenever
//               the outcome of an attempt is unknown). Optional.
//   canSend   — (punch) => boolean. Scopes delivery to the signed-in
//               member/company so one person's queued punches are never
//               delivered under another person's session on a shared phone.
//   onChange  — (snapshot) => void. snapshot = { records, lastDelivered }.
//   onDelivered — (punch, entry) => void. Fires once per delivered punch.
//   sendTimeoutMs, gpsGraceMs, backoffMs, drainIntervalMs — tunables.
//   now       — clock injection for tests.
export function createPunchOutbox(options) {
  const {
    storage,
    send,
    confirm = null,
    canSend = () => true,
    onChange = () => {},
    onDelivered = () => {},
    sendTimeoutMs = DEFAULT_SEND_TIMEOUT_MS,
    gpsGraceMs = DEFAULT_GPS_GRACE_MS,
    backoffMs = DEFAULT_BACKOFF_MS,
    drainIntervalMs = DEFAULT_DRAIN_INTERVAL_MS,
    now = () => Date.now(),
  } = options || {};
  if (!storage || typeof send !== "function") {
    throw new Error("createPunchOutbox requires a storage adapter and a send function");
  }

  const records = new Map(); // id -> record (record objects are JSON-safe)
  let createdSeq = 0;
  let loaded = false;
  let drainPromise = null;
  let retryTimer = null;
  let intervalTimer = null;
  let lastDelivered = null;

  const snapshot = () => ({
    records: [...records.values()].sort(byTapOrder).map((r) => ({ ...r })),
    lastDelivered: lastDelivered ? { ...lastDelivered } : null,
  });
  const emit = () => {
    try {
      onChange(snapshot());
    } catch {
      /* a UI listener must never break delivery */
    }
  };
  const persist = async (record) => {
    await storage.put({ ...record });
  };

  function scheduleDrain(delayMs) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      drainOnce().catch(() => {});
    }, Math.max(0, delayMs));
    if (retryTimer && typeof retryTimer.unref === "function") retryTimer.unref();
  }

  async function load() {
    const rows = await storage.getAll();
    records.clear();
    for (const row of rows || []) {
      if (!row || !row.id) continue;
      // A record left in "sending" by a killed page was never confirmed —
      // it goes back to queued and will be reconciled by read-back.
      if (row.status === "sending") row.status = "queued";
      records.set(row.id, row);
      createdSeq = Math.max(createdSeq, row.createdSeq || 0);
    }
    loaded = true;
    emit();
    return snapshot();
  }

  // The local-first write. Resolves only AFTER the record is durable in
  // storage — the tap never exists solely inside a network request.
  async function enqueue(intent) {
    if (!loaded) await load();
    // Dedupe: one live punch per intent. A repeat tap (or a retry tap after
    // a block) must not create a second punch for the same act.
    for (const existing of [...records.values()]) {
      const sameAct =
        existing.companyId === intent.companyId &&
        existing.memberId === intent.memberId &&
        existing.type === intent.type &&
        (intent.type === "out" ? existing.entryId === intent.entryId : true);
      if (!sameAct) continue;
      if (existing.status === "queued" || existing.status === "sending") {
        return { ...existing };
      }
      if (existing.status === "blocked") {
        records.delete(existing.id);
        await storage.remove(existing.id).catch(() => {});
      }
    }
    const t = now();
    const record = {
      id: newPunchId(),
      type: intent.type, // "in" | "out"
      companyId: intent.companyId,
      memberId: intent.memberId,
      entryId: intent.entryId || null, // clock-out target
      locationId: intent.locationId || null, // clock-in target
      clockInRole: intent.clockInRole || null,
      lat: intent.lat ?? null,
      lng: intent.lng ?? null,
      awaitingGps: !!intent.awaitingGps,
      tappedAt: new Date(t).toISOString(),
      tappedAtMs: t,
      createdSeq: ++createdSeq,
      status: "queued",
      attempts: 0,
      lastError: null,
      blockedReason: null,
    };
    records.set(record.id, record);
    await persist(record);
    emit();
    scheduleDrain(0);
    return { ...record };
  }

  // GPS settles after the tap (it can take seconds indoors). The punch is
  // already durable; this just enriches it while it is still ours to edit.
  async function attachGps(id, pos) {
    const record = records.get(id);
    if (!record || record.status === "blocked") return;
    record.lat = pos?.lat ?? null;
    record.lng = pos?.lng ?? null;
    record.awaitingGps = false;
    await persist(record).catch(() => {});
    emit();
    scheduleDrain(0);
  }

  async function safeConfirm(record) {
    if (!confirm) return null;
    try {
      return await confirm({ ...record });
    } catch {
      return null;
    }
  }

  async function markDelivered(record, entry) {
    records.delete(record.id);
    await storage.remove(record.id).catch(() => {});
    lastDelivered = { punchId: record.id, type: record.type, entry, atMs: now() };
    emit();
    try {
      onDelivered({ ...record }, entry);
    } catch {
      /* delivery already happened; a UI callback must not undo it */
    }
  }

  // One pass over the queue, in tap order. A retryable failure stops the
  // pass (punches must land in the order they happened — a clock-out may
  // only travel after its clock-in) and schedules the next attempt with
  // backoff. Blocked punches are set aside, visible, and never retried
  // silently.
  async function drainOnce() {
    if (drainPromise) return drainPromise;
    if (!loaded) await load();
    drainPromise = (async () => {
      for (;;) {
        const queue = [...records.values()]
          .filter((r) => r.status === "queued" && canSend(r))
          .sort(byTapOrder);
        if (!queue.length) return;
        const record = queue[0];
        if (record.awaitingGps && now() - record.tappedAtMs < gpsGraceMs) {
          // Give tap-time GPS a brief chance to attach before the punch
          // travels; after the grace window the punch goes without it
          // (the server accepts null coordinates — the punch itself is
          // never held hostage to a GPS fix).
          scheduleDrain(gpsGraceMs);
          return;
        }
        record.status = "sending";
        record.attempts += 1;
        await persist(record);
        emit();

        let entry = null;
        let failure = null;
        try {
          entry = await withTimeout(send({ ...record }), sendTimeoutMs);
        } catch (e) {
          failure = e;
        }

        if (!failure && entry) {
          // The write answered — still verify by read-back when we can,
          // so "confirmed" means the server's stored record, not just a
          // response in flight. If read-back is momentarily unavailable,
          // the write's own response (the server-issued row) stands.
          const readBack = await safeConfirm(record);
          await markDelivered(record, readBack || entry);
          continue;
        }
        if (!failure && !entry) {
          // The transport claims success but produced no recorded state —
          // that is an unknown outcome, not a confirmation.
          failure = new Error("The server answered without a recorded entry.");
          failure.code = "no-entry";
        }

        // Unknown outcome (timeout, lost response, dead connection): ask
        // the server what actually happened before owing a retry. This is
        // what makes retries safe — the punch can land exactly once even
        // when the first attempt's reply never came back.
        const confirmed = await safeConfirm(record);
        if (confirmed) {
          await markDelivered(record, confirmed);
          continue;
        }
        if (failure.permanent || failure.blockedIfUnconfirmed) {
          record.status = "blocked";
          record.blockedReason = failure.message || "The server refused this punch.";
          record.lastError = record.blockedReason;
          await persist(record);
          emit();
          continue;
        }
        record.status = "queued";
        record.lastError = failure.message || "Connection problem.";
        await persist(record);
        emit();
        const delay = backoffMs[Math.min(record.attempts, backoffMs.length - 1)];
        scheduleDrain(delay);
        return;
      }
    })();
    try {
      await drainPromise;
    } finally {
      drainPromise = null;
    }
  }

  function kick() {
    scheduleDrain(0);
  }

  // Re-arm a blocked punch (the employee taps "Try again" after the cause —
  // e.g. a manager fixing the schedule — is resolved).
  async function retryBlocked(id) {
    const record = records.get(id);
    if (!record || record.status !== "blocked") return;
    record.status = "queued";
    record.attempts = 0;
    record.blockedReason = null;
    record.lastError = null;
    await persist(record);
    emit();
    scheduleDrain(0);
  }

  async function drop(id) {
    if (!records.has(id)) return;
    records.delete(id);
    await storage.remove(id).catch(() => {});
    emit();
  }

  // Load leftovers from a previous session, start delivering, and keep a
  // slow interval drain running while the page is open. Returns stop().
  function start() {
    load()
      .then(() => drainOnce())
      .catch(() => {});
    if (drainIntervalMs > 0) {
      intervalTimer = setInterval(() => {
        drainOnce().catch(() => {});
      }, drainIntervalMs);
      if (intervalTimer && typeof intervalTimer.unref === "function") intervalTimer.unref();
    }
    return stop;
  }

  function stop() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
  }

  return {
    load,
    enqueue,
    attachGps,
    drainOnce,
    kick,
    retryBlocked,
    drop,
    start,
    stop,
    snapshot,
    // Read-back reconciliation window, exported for the page's confirm fn.
    CONFIRM_SKEW_MS,
  };
}
