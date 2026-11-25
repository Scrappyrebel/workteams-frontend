// Per-location "require geofence" tick box (Wendy, 2026-11-18
// offline-fix requirements): a location with no signal gets the tick
// removed, and clock-in there skips the location check. Design:
//   * locations.require_geofence (migration 102) defaults TRUE —
//     nothing changes anywhere until a manager unticks a location.
//   * The Locations form carries the tick with plain words about the
//     no-signal case; saves fail soft until migration 102 has run.
//   * The clock-in route enforces the fence only when the tick is
//     on (its select also falls back until 102 has run).
//   * The time page's client pre-check and "Geofence active" hint
//     honor the same tick, so the crew is never told a fence applies
//     when it does not.
//   * The owner's geofence verification report marks tick-off
//     locations as not-required instead of failing their punches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("migration 102 adds the column defaulting to required", () => {
  const p = "supabase/102_location_require_geofence.sql";
  assert.ok(existsSync(new URL(`../${p}`, import.meta.url)), "migration exists");
  const sql = read(p);
  assert.ok(sql.includes("add column if not exists require_geofence boolean not null default true"), "additive, default true");
});

test("locations form carries the tick and saves fail-soft", () => {
  const page = read("app/app/[companyId]/locations/page.js");
  for (const needle of [
    "require_geofence: true, require_walkthrough_video: true, require_book_photo: true, rate_area_id",
    "require_geofence: form.require_geofence !== false,",
    "require_geofence: l.require_geofence !== false,",
    "Require the geofence to clock in",
    "Untick this for a place with no signal",
    "Geofence off — no location check to clock in",
    "/require_geofence/.test(error.message || \"\")",
  ]) {
    assert.ok(page.includes(needle), `locations page keeps: ${needle}`);
  }
});

test("clock-in route skips the fence only when the tick is off", () => {
  const route = read("app/api/time/clock-in/route.js");
  for (const needle of [
    "geofence_radius_m, require_geofence",
    "location.require_geofence !== false",
  ]) {
    assert.ok(route.includes(needle), `clock-in keeps: ${needle}`);
  }
});

test("time page hint honors the tick; server authorizes after durable capture", () => {
  const page = read("app/app/[companyId]/time/page.js");
  for (const needle of [
    "geofence_radius_m, require_geofence",
    "sel.require_geofence !== false",
  ]) {
    assert.ok(page.includes(needle), `time page keeps: ${needle}`);
  }
});

test("owner verification report treats tick-off locations as not required", () => {
  const route = read("app/api/locations/geofence-check/route.js");
  for (const needle of [
    "geofence_required: loc ? loc.require_geofence !== false : true",
    "loc.require_geofence === false ? null : inM <= (loc.geofence_radius_m || 100)",
  ]) {
    assert.ok(route.includes(needle), `geofence-check keeps: ${needle}`);
  }
});

