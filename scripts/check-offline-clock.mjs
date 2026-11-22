// Offline clock-in/out (Wendy, 2026-11-21 — her #1 priority after
// the Nov 18 airplane-mode drills failed in all three apps: "I do
// not want to be paying people because the system isn't doing what
// it's supposed to do").
//
// The build, in three parts, all pinned here:
//   1. Pages: public/sw.js caches /app/ documents + RSC payloads
//      network-first (offline = cached copy, never stale-first),
//      and answers an uncached navigation with a plain offline page
//      instead of the browser's dead error.
//   2. Context: lib/offline-context.mjs keeps the last server-
//      confirmed shell (company/member) + time picture (today's
//      shifts, locations, open entry, hats) on the phone, scoped to
//      (user, company), with clock-in data gated to its saved date.
//   3. Punches: unchanged — lib/punch-outbox.mjs already saves every
//      tap on the phone first and delivers with read-back. The time
//      page hydrates from the context when its reads fail, shows an
//      unmistakable offline banner, and the company layout falls
//      back to the shell snapshot when it cannot reach the server.
//
// Nothing here weakens a server gate: delivery still goes through
// the clock-in/out APIs, which re-check the session, the schedule
// and the geofence. A snapshot can only display and queue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  saveOfflineContext,
  loadOfflineContext,
  shellSnapshot,
  clockInSnapshot,
  openEntrySnapshot,
  offlineContextKey,
} from "../lib/offline-context.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const USER = "user-1";
const COMPANY = "company-1";
const shell = {
  company: { id: COMPANY, name: "Lilly B's", timezone: "America/Chicago" },
  member: { id: "member-1", user_id: USER, role: "cleaner" },
};
const time = {
  forDate: "2026-11-21",
  shifts: [{ id: "shift-1", location_id: "loc-1", shift_date: "2026-11-21", start_time: "09:00", end_time: "17:00" }],
  locations: [{ id: "loc-1", name: "Office", lat: 38.7, lng: -90.7, geofence_radius_m: 100 }],
  openEntry: { id: "entry-1", clock_in: "2026-11-21T14:00:00Z", clock_out: null, location_id: "loc-1" },
  hats: [],
};

test("snapshot round-trips per (user, company) and merges sections", () => {
  const storage = fakeStorage();
  assert.equal(saveOfflineContext(storage, USER, COMPANY, { shell }), true);
  assert.equal(saveOfflineContext(storage, USER, COMPANY, { time }), true);
  const snap = loadOfflineContext(storage, USER, COMPANY);
  assert.deepEqual(shellSnapshot(snap), shell);
  assert.deepEqual(clockInSnapshot(snap, "2026-11-21"), time);
  assert.equal(openEntrySnapshot(snap)?.id, "entry-1");
  assert.ok(storage.getItem(offlineContextKey(USER, COMPANY)));
});

test("a snapshot never leaks across users or companies", () => {
  const storage = fakeStorage();
  saveOfflineContext(storage, USER, COMPANY, { shell, time });
  assert.equal(loadOfflineContext(storage, "user-2", COMPANY), null);
  assert.equal(loadOfflineContext(storage, USER, "company-2"), null);
  assert.equal(loadOfflineContext(storage, null, COMPANY), null);
});

test("clock-in data is gated to the date it was saved for", () => {
  const storage = fakeStorage();
  saveOfflineContext(storage, USER, COMPANY, { time });
  const snap = loadOfflineContext(storage, USER, COMPANY);
  assert.equal(clockInSnapshot(snap, "2026-11-22"), null, "yesterday's shifts never clock anyone in today");
  // The open entry is NOT date-gated: an overnight shift clocked in
  // yesterday must still clock out today.
  assert.equal(openEntrySnapshot(snap)?.id, "entry-1");
});

test("corrupt or partial snapshots read as absent, never crash", () => {
  const storage = fakeStorage();
  storage.setItem(offlineContextKey(USER, COMPANY), "{not json");
  assert.equal(loadOfflineContext(storage, USER, COMPANY), null);
  saveOfflineContext(storage, USER, COMPANY, { time: { forDate: "2026-11-21" } });
  const snap = loadOfflineContext(storage, USER, COMPANY);
  assert.equal(shellSnapshot(snap), null);
  assert.equal(clockInSnapshot(snap, "2026-11-21"), null);
  assert.equal(openEntrySnapshot(snap), null);
});

// Supersession (Wendy, 2026-11-22): the cache-name needle below was
// bumped v4 -> v5 with the never-strand-an-install build. Every
// behaviour this test pins is unchanged — network-first pages, the
// plain offline fallback, redirects never cached — v5 only makes the
// worker's promise impossible to reject (a bad cache on a crew phone
// jammed v4's loads with the browser's dead error page) and renames
// the cache so activate purges the v4 copy.
test("service worker serves cached app pages offline, network-first", () => {
  const sw = read("public/sw.js");
  for (const needle of [
    "workteams-v5-safe-20261122",
    'request.mode === "navigate"',
    'url.searchParams.has("_rsc")',
    "url.pathname.startsWith(\"/app/\")",
    "!res.redirected",
    "You're offline",
    "WorkTeams needs a signal once to load this page",
  ]) {
    assert.ok(sw.includes(needle), `sw.js keeps: ${needle}`);
  }
});

test("layout falls back to the session + snapshot, login only when no session", () => {
  const layout = read("app/app/[companyId]/layout.js");
  for (const needle of [
    "getSession",
    "loadOfflineContext",
    "shellSnapshot",
    "saveOfflineContext",
    "offline: true",
  ]) {
    assert.ok(layout.includes(needle), `layout keeps: ${needle}`);
  }
});

test("time page hydrates offline and says so in plain words", () => {
  const page = read("app/app/[companyId]/time/page.js");
  for (const needle of [
    "clockInSnapshot",
    "openEntrySnapshot",
    "saveOfflineContext",
    "No connection — you are working offline",
    "sends itself when you are back in signal",
    'window.addEventListener("offline", goOffline)',
    'window.addEventListener("online", goOnline)',
  ]) {
    assert.ok(page.includes(needle), `time page keeps: ${needle}`);
  }
});
