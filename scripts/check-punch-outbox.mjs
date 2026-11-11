// Build-blocking drill for the clock-punch delivery guarantee.
//
// The Protected Core Baseline guards used to check only the SHAPE of the
// time-clock code. This check performs the ACT, behaviorally, against the
// real outbox module (lib/punch-outbox.mjs) with a fake server that mirrors
// the clock-out route's idempotent semantics:
//
//   offline tap        -> the punch exists in durable storage, queued
//   response lost      -> read-back reconciles it; delivered exactly once
//   server down        -> punch stays queued, then lands on reconnect
//   duplicate tap/send -> still exactly one server-side effect
//   hung request       -> the attempt is bounded; the punch is not wedged
//   refused punch      -> blocked + visible, never silently retried forever
//   page wiring        -> the time page really routes punches through the
//                         outbox (removing the local-first write fails here)
//
// If any of this breaks, the build fails and nothing ships.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPunchOutbox, createMemoryStorage } from "../lib/punch-outbox.mjs";

const TAPPED = Date.parse("2026-11-11T15:00:00Z");
const baseIntent = {
  type: "out",
  companyId: "company-1",
  memberId: "member-1",
  entryId: "entry-1",
  lat: 38.5,
  lng: -90.5,
  awaitingGps: false,
};

// Fake clock-out server with the real route's semantics: closing an open
// entry writes the timestamp once; closing an already-closed entry returns
// the recorded state (alreadyClosed) with NO second effect.
function fakeClockOutServer({ loseResponses = 0, down = false } = {}) {
  const state = {
    entry: { id: "entry-1", clock_in: "2026-11-11T14:06:00Z", clock_out: null },
    posts: 0,
    closes: 0,
  };
  const send = async () => {
    state.posts += 1;
    if (down) throw new Error("fetch failed: network unreachable");
    if (!state.entry.clock_out) {
      state.entry = { ...state.entry, clock_out: "2026-11-11T15:15:00Z" };
      state.closes += 1;
    }
    if (loseResponses > 0) {
      loseResponses -= 1;
      throw new Error("The response never came back");
    }
    return { ...state.entry };
  };
  const confirm = async () => (state.entry.clock_out ? { ...state.entry } : null);
  return { state, send, confirm };
}

function makeOutbox(storage, server, extra = {}) {
  const delivered = [];
  const outbox = createPunchOutbox({
    storage,
    send: server.send,
    confirm: server.confirm,
    gpsGraceMs: 0,
    drainIntervalMs: 0,
    now: () => TAPPED,
    onDelivered: (punch, entry) => delivered.push({ punch, entry }),
    ...extra,
  });
  return { outbox, delivered };
}

// 1. Offline: the tap is written to durable storage BEFORE any network
//    result, and survives a "reload" (a fresh outbox over the same storage).
{
  const storage = createMemoryStorage();
  const server = fakeClockOutServer({ down: true });
  const { outbox } = makeOutbox(storage, server);
  const punch = await outbox.enqueue({ ...baseIntent });
  assert.ok(punch.id, "enqueue returns the punch with its client ID");
  const stored = await storage.getAll();
  assert.equal(stored.length, 1, "punch persisted locally before delivery");
  assert.equal(stored[0].status, "queued");
  await outbox.drainOnce(); // server unreachable
  assert.equal(server.state.closes, 0, "nothing reached the server");
  assert.equal(outbox.snapshot().records.length, 1, "punch still queued after failed delivery");
  assert.equal(outbox.snapshot().records[0].status, "queued", "failed attempt returns to queued, never wedged in sending");

  const { outbox: reopened } = makeOutbox(storage, server);
  await reopened.load();
  assert.equal(reopened.snapshot().records.length, 1, "punch survives a page reload / app kill");
  outbox.stop();
  reopened.stop();
  console.log("ok - offline tap is stored first and survives reload");
}

// 2. The response is lost AFTER the server wrote the timestamp: read-back
//    reconciles it — delivered exactly once, no second POST effect.
{
  const storage = createMemoryStorage();
  const server = fakeClockOutServer({ loseResponses: 1 });
  const { outbox, delivered } = makeOutbox(storage, server);
  await outbox.enqueue({ ...baseIntent });
  await outbox.drainOnce();
  assert.equal(server.state.closes, 1, "server wrote the timestamp exactly once");
  assert.equal(delivered.length, 1, "read-back confirmed the delivery");
  assert.equal(delivered[0].entry.clock_out, "2026-11-11T15:15:00Z", "confirmed entry carries the recorded clock-out");
  assert.equal((await storage.getAll()).length, 0, "delivered punch leaves the outbox");
  outbox.stop();
  console.log("ok - lost response reconciles by read-back, exactly one effect");
}

// 3. Server down at tap time, back later: the queued punch lands on the
//    next drain (reconnect) — exactly once.
{
  const storage = createMemoryStorage();
  const server = fakeClockOutServer({ down: true });
  const { outbox, delivered } = makeOutbox(storage, server);
  await outbox.enqueue({ ...baseIntent });
  await outbox.drainOnce();
  assert.equal(delivered.length, 0);
  outbox.stop(); // the "closed app" — its retries stop with it
  const serverUp = fakeClockOutServer();
  const { outbox: outbox2, delivered: delivered2 } = makeOutbox(storage, serverUp);
  await outbox2.load();
  await outbox2.drainOnce();
  assert.equal(serverUp.state.closes, 1, "punch delivered once after reconnect");
  assert.equal(delivered2.length, 1);
  assert.equal((await storage.getAll()).length, 0);
  outbox.stop();
  outbox2.stop();
  console.log("ok - queued punch delivers on reconnect, exactly once");
}

// 4. Duplicates cannot happen: a double tap creates ONE punch, and a
//    duplicate delivery of the same punch is a server-side no-op.
{
  const storage = createMemoryStorage();
  const server = fakeClockOutServer();
  const { outbox, delivered } = makeOutbox(storage, server);
  const first = await outbox.enqueue({ ...baseIntent });
  const second = await outbox.enqueue({ ...baseIntent });
  assert.equal(second.id, first.id, "double tap returns the same punch, not a new one");
  assert.equal((await storage.getAll()).length, 1, "one stored punch for two taps");
  await outbox.drainOnce();
  await outbox.drainOnce();
  assert.equal(server.state.closes, 1, "exactly one clock-out effect after repeated drains");
  assert.equal(delivered.length, 1);
  // Simulate a stray duplicate delivery of the same intent afterwards:
  const dup = await server.send({ ...baseIntent, id: first.id });
  assert.equal(dup.clock_out, "2026-11-11T15:15:00Z", "already-closed entry answers with its recorded state");
  assert.equal(server.state.closes, 1, "duplicate delivery changed nothing");
  outbox.stop();
  console.log("ok - duplicates: one punch, one effect, recorded state on retry");
}

// 5. A hung request can never wedge the punch (the Nov 8 trap): the
//    attempt is time-bounded, the record returns to queued, and a later
//    healthy attempt delivers it.
{
  const storage = createMemoryStorage();
  let hang = true;
  const server = fakeClockOutServer();
  const send = async (punch) => {
    if (hang) return new Promise(() => {}); // never settles
    return server.send(punch);
  };
  const { outbox, delivered } = makeOutbox(storage, { send, confirm: server.confirm }, { sendTimeoutMs: 50 });
  await outbox.enqueue({ ...baseIntent });
  const started = Date.now();
  await outbox.drainOnce();
  assert.ok(Date.now() - started < 5000, "hung attempt is bounded by the send timeout");
  assert.equal(outbox.snapshot().records.length, 1, "punch still owed after the hang");
  assert.equal(outbox.snapshot().records[0].status, "queued", "punch is not stuck in 'sending'");
  hang = false;
  await outbox.drainOnce();
  assert.equal(server.state.closes, 1, "punch delivers once the connection behaves");
  assert.equal(delivered.length, 1);
  outbox.stop();
  console.log("ok - hung request times out, punch unwedged and delivered later");
}

// 6. A punch the server refuses for good is BLOCKED and visible — not
//    retried forever, not silently dropped.
{
  const storage = createMemoryStorage();
  let posts = 0;
  const send = async () => {
    posts += 1;
    const err = new Error("Entry not found");
    err.permanent = true;
    throw err;
  };
  const { outbox } = makeOutbox(storage, { send, confirm: async () => null });
  await outbox.enqueue({ ...baseIntent });
  await outbox.drainOnce();
  await outbox.drainOnce();
  const rec = outbox.snapshot().records[0];
  assert.equal(rec.status, "blocked", "refused punch is blocked");
  assert.equal(rec.blockedReason, "Entry not found", "the server's reason is kept for the employee to see");
  assert.equal(posts, 1, "blocked punches are not retried silently");
  await outbox.retryBlocked(rec.id);
  await outbox.drainOnce();
  assert.equal(posts, 2, "an explicit retry re-arms the punch");
  outbox.stop();
  console.log("ok - refused punch blocks visibly with its reason, retry is explicit");
}

// 7. Page wiring: the guarantee only counts if the time page actually
//    routes Clock In / Clock Out through the outbox. Ripping the
//    local-first write out of the page fails the build here.
{
  const page = readFileSync(new URL("../app/app/[companyId]/time/page.js", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../lib/punch-outbox.mjs", import.meta.url), "utf8");
  assert.ok(page.includes("punch-outbox"), "time page imports the punch outbox");
  assert.ok(page.includes("createPunchOutbox"), "time page creates the outbox");
  assert.ok(page.includes(".enqueue("), "time page enqueues punches (local-first write)");
  assert.ok(
    page.includes('await api("/api/time/clock-out"'),
    "clock-out delivery still goes through the page's api() sender"
  );
  assert.ok(lib.includes("indexedDB"), "durable storage is IndexedDB-backed");
  assert.ok(lib.includes("storage.put"), "the outbox persists through its storage adapter");
  console.log("ok - time page is wired through the outbox");
}

console.log("\nPunch outbox drill passed: stored first, delivered exactly once, never wedged, never silent.");
