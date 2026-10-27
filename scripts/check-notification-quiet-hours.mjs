import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Notification quiet hours (migration 072, audit item A3) invariants:
// * Parity with Workforce's quiet hours (its migration 266): two nullable
//   TIME columns on the member's existing preferences row (068). Both NULL
//   = off = the behavior before this build; no new table is created.
// * The window is read in the company's timezone (companies.timezone,
//   migration 041) by ONE shared check in lib/notification-prefs.js —
//   getCompanyTimezone + inQuietHours + pushHeldByQuietHours — and every
//   non-urgent push send path uses it: crew-chat messages, schedule-
//   request notifications, work-order notices. The lib reads the new
//   columns in a separate tolerant probe so a pre-072 database keeps the
//   category preferences working exactly as today.
// * Held means: the underlying message/request/work order is already
//   saved in the app as usual; only the phone push is not sent at that
//   moment. There is no queue and no scheduler anywhere in this build —
//   a held push is never re-sent later. The notify routes count held
//   recipients honestly in their responses.
// * URGENT always passes. This app's urgent class is the emergency /
//   help channel (the emergency send route + lib/owner-alerts.js over
//   emergency_alerts) — it never consulted member preferences and must
//   stay that way: neither file may reference quiet hours.
// * The notifications page gains ONLY the new quiet-hours controls; its
//   load/save of the window is a separate probe so the category panel is
//   unaffected until migration 072 runs.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in any changed file.

const SQL_PATH = "supabase/072_notification_quiet_hours.sql";
const LIB = "lib/notification-prefs.js";
const MESSAGES_ROUTE = "app/api/messages/notify/route.js";
const SCHEDULE_ROUTE = "app/api/schedule-requests/notify/route.js";
const WORKORDERS_ROUTE = "app/api/work-orders/notify/route.js";
const EMERGENCY_ROUTE = "app/api/emergency/send/route.js";
const OWNER_ALERTS = "lib/owner-alerts.js";
const PREFS_PAGE = "app/app/[companyId]/notifications/page.js";

test("migration 072 adds the two quiet-hours columns and nothing else structural", () => {
  assert.ok(existsSync(SQL_PATH), "migration 072 exists");
  const sql = read(SQL_PATH);
  for (const needle of [
    "BEGIN;",
    "COMMIT;",
    "add column if not exists quiet_hours_start time",
    "add column if not exists quiet_hours_end time",
    "member_notification_preferences",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  assert.ok(!/create table/i.test(sql), "migration creates no new table");
  // Protected areas: the migration touches none of them.
  for (const banned of ["shift_videos", "communication_book", "time_entries"])
    assert.ok(!sql.includes(banned), `migration stays out of: ${banned}`);
});

test("the shared quiet-hours check lives in lib/notification-prefs.js", () => {
  const lib = read(LIB);
  for (const needle of [
    "quiet_hours_start, quiet_hours_end",
    "export async function getCompanyTimezone",
    "export function inQuietHours",
    "export function pushHeldByQuietHours",
    "if (urgent) return false", // urgent pushes are never held
    "DEFAULT_COMPANY_TIMEZONE",
  ]) assert.ok(lib.includes(needle), `lib contains: ${needle}`);
  // The categories select stays exactly as migration 068 built it — the
  // quiet-hours columns ride in their own tolerant probe.
  assert.ok(
    lib.includes('"member_id, schedule_changes, messages, customer_replies, pay"'),
    "categories select unchanged"
  );
});

test("every non-urgent push send path honors the shared check", () => {
  for (const route of [MESSAGES_ROUTE, SCHEDULE_ROUTE, WORKORDERS_ROUTE]) {
    const src = read(route);
    for (const needle of ["getNotificationPrefs", "getCompanyTimezone", "pushHeldByQuietHours"])
      assert.ok(src.includes(needle), `${route} uses: ${needle}`);
    for (const banned of ["time_entries", "shift_videos", "communication_book", "comm_book"])
      assert.ok(!src.includes(banned), `${route} stays out of: ${banned}`);
  }
});

test("the urgent emergency channel never consults quiet hours", () => {
  for (const file of [EMERGENCY_ROUTE, OWNER_ALERTS]) {
    const src = read(file).toLowerCase();
    assert.ok(!src.includes("quiet"), `${file} has no quiet-hours reference`);
    assert.ok(!src.includes("notification-prefs"), `${file} does not import notification prefs`);
  }
});

test("no scheduler or delayed-delivery mechanism was built", () => {
  for (const file of [LIB, MESSAGES_ROUTE, SCHEDULE_ROUTE, WORKORDERS_ROUTE]) {
    const src = read(file);
    assert.ok(!src.includes("setTimeout"), `${file} does not delay sends`);
    assert.ok(!/quiet.*queue|queue.*quiet/i.test(src), `${file} has no quiet-hours queue`);
  }
});

test("notifications page carries the quiet-hours controls on their own probe", () => {
  const page = read(PREFS_PAGE);
  for (const needle of [
    "Quiet hours",
    "quiet_hours_start, quiet_hours_end",
    "quiet_hours_start:",
    'type="time"',
    "Save quiet hours",
    "Turn off quiet hours",
    "quiet hours or not", // the emergency-always-through promise stays stated
  ]) assert.ok(page.includes(needle), `page contains: ${needle}`);
  // The category panel's own select is untouched by the new columns.
  assert.ok(
    page.includes('"schedule_changes, messages, customer_replies, pay"'),
    "category select unchanged"
  );
});
