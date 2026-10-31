import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Schedule History honesty (Phase 3, P3-02) invariants:
// * The page used to promise "Who worked, where, and when" while
//   rendering only the shifts table — scheduled shifts, with no
//   clock-in/out, no hours worked, and no outcome. A manager could
//   read a scheduled row as a work record.
// * The subtitle must now say who was SCHEDULED, and actuals may be
//   shown only where they are honestly derived: a time entry stored
//   as linked to that exact shift (time_entries.shift_id, written by
//   the clock-in route) that also passes the existing attendance
//   guard (hasShiftAttendance — same company/member/location and the
//   linked clock-in window). That guard rejects older records whose
//   shift_id came from the old first-shift-of-the-day matching.
// * Unlinked entries (manager-approved clock-ins, older rows) are
//   never matched to a shift by date/time/location guessing: their
//   rows render as scheduled only, and the page must never label a
//   row a no-show (or late, or worked) without a linked record.
// * Hours shown are the stored clock-out minus the stored clock-in,
//   exactly as the Time Clock page computes them. No pay, rate, or
//   payroll value is calculated or displayed on this page.
// * Protected areas stay untouched by this page: it only READS
//   time_entries the way existing features do; it writes nothing.

const page = readFileSync("app/app/[companyId]/schedule/history/page.js", "utf8");

assert.ok(
  page.includes("Who was scheduled, where, and when"),
  "subtitle must promise scheduled shifts, not worked shifts"
);
assert.ok(
  !page.includes("Who worked, where, and when"),
  "the old worked-only subtitle promise must not return"
);
assert.ok(
  page.includes('.from("time_entries")') && page.includes('.in("shift_id", shiftIds)'),
  "actuals must be read only from time entries linked by shift_id"
);
assert.ok(
  page.includes("hasShiftAttendance(s, [e], now, tz)"),
  "a linked entry must pass the existing attendance guard before it is shown"
);
assert.ok(
  page.includes("e.shift_id === s.id && e.member_id === s.member_id"),
  "a linked entry must belong to the shift's own member"
);
assert.ok(
  page.includes("Scheduled only — no clock record is linked to this shift."),
  "unmatched rows must be plainly shown as scheduled only"
);
assert.ok(
  page.includes("does not by itself mean the person did not work"),
  "scheduled-only must not be readable as a no-show finding"
);
assert.ok(
  !/no-show/i.test(page),
  "this page must never label a shift a no-show"
);
assert.ok(
  page.includes('((new Date(e.clock_out) - new Date(e.clock_in)) / 3600000).toFixed(2)'),
  "hours worked must be stored clock-out minus stored clock-in, as on the Time Clock page"
);
assert.ok(
  page.includes("clocked in ${lateMinutes} min after the scheduled start"),
  "lateness is shown only as the factual gap for a linked record"
);
assert.ok(
  !/pay_rate|estPay|hourly_rate/i.test(page),
  "no pay or rate calculation may appear on Schedule History"
);
assert.ok(
  !/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(page),
  "Schedule History is read-only: it must never write"
);

console.log("Schedule History actuals honesty guards passed.");
