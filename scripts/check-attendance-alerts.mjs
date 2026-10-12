import assert from "node:assert/strict";
import fs from "node:fs";
import { chooseAssignedShift, hasShiftAttendance, shiftBounds } from "../lib/attendance-shifts.mjs";

const company = "company-1", member = "kristin", office = "office-1";
const make = (id, start_time, end_time, location_id = office) => ({
  id, company_id: company, member_id: member, location_id,
  shift_date: "2026-10-11", start_time, end_time,
});
const morning = make("early-office", "03:45:00", "16:00:00");
const short = make("1715-office", "17:15:00", "17:30:00");
const evening = make("1800-office", "18:00:00", "19:00:00");
const scheduled = [morning, short, evening];
const at = "2026-10-11T23:01:00.000Z"; // 6:01 PM Central
assert.equal(chooseAssignedShift(scheduled, at)?.id, evening.id,
  "6:01 PM clock-in must link to 6 PM shift, never 3:45 AM Office shift");
assert.equal(chooseAssignedShift(scheduled, "2026-10-11T20:46:00.000Z")?.id, morning.id,
  "Existing early long Office shift may be used while still scheduled");
assert.equal(chooseAssignedShift(scheduled, "2026-10-11T05:30:00.000Z"), null,
  "A shift outside its permitted time window must not authorize arbitrary clock-in");
assert.equal(chooseAssignedShift(scheduled, "2026-10-11T22:15:00.000Z")?.id, short.id,
  "Shift at 5:15 PM uses its own assignment");
// Simulate existing wrong shift_id from old first-of-day clock-in.
const oldWrongLink = [{
  id: "wrong-linked-entry", company_id: company, member_id: member,
  location_id: office, shift_id: morning.id,
  clock_in: "2026-10-11T23:01:37.844Z",
  clock_out: "2026-10-11T23:15:57.629Z",
}];
assert.equal(hasShiftAttendance(evening, oldWrongLink, "2026-10-11T23:30:00Z"), true,
  "Completed entry at Office must suppress false 6 PM no-show even if linked to morning shift");
assert.equal(hasShiftAttendance(short, oldWrongLink, "2026-10-11T23:30:00Z"), false,
  "6 PM entry must not cover a different shift which ended at 5:30 PM");
assert.equal(hasShiftAttendance(evening, [{...oldWrongLink[0], member_id: "another-worker"}],
  "2026-10-11T23:30:00Z"), false, "Another employee cannot count as attendance");
assert.equal(hasShiftAttendance(evening, [{...oldWrongLink[0], location_id: "elsewhere"}],
  "2026-10-11T23:30:00Z"), false, "Attendance at a different location must not count");
assert.equal(hasShiftAttendance(evening, [{
  ...oldWrongLink[0], clock_in: "2026-10-11T22:40:00Z",
  clock_out: "2026-10-11T22:50:00Z",
}], "2026-10-11T23:30:00Z"), false,
"Completed visit that ended before a later shift must not suppress its alert");
assert.equal(hasShiftAttendance(evening, [{
  ...oldWrongLink[0], clock_in: "2026-10-11T22:40:00Z", clock_out: null,
}], "2026-10-11T23:30:00Z"), true,
"Employee still clocked in at correct site must not be reported as absent");
assert.equal(shiftBounds(make("overnight", "22:00:00", "02:00:00")).end.toISOString(),
  "2026-10-12T07:00:00.000Z", "Overnight schedule must end next morning in Central");
assert.equal(shiftBounds(evening).start.toISOString(),
  "2026-10-11T23:00:00.000Z", "Schedule must be converted from Central to UTC correctly");

const clockIn = fs.readFileSync("app/api/time/clock-in/route.js", "utf8");
const attendance = fs.readFileSync("app/api/cron/attendance/route.js", "utf8");
const alerts = fs.readFileSync("lib/owner-alerts.js", "utf8");

assert.ok(clockIn.includes("chooseAssignedShift(memberShifts, now)") &&
  !clockIn.includes("const shift = (memberShifts || []).find("),
  "Clock In must never pick first location shift of entire day");
assert.ok(clockIn.includes('.eq("member_id", member.id)') &&
  clockIn.includes('.eq("location_id", locationId)') &&
  clockIn.includes('shift_id: shift.id'),
  "Schedule matching must remain scoped to the authenticated employee and selected site");
assert.ok(attendance.includes("hasShiftAttendance(shift, onSite, now, tz)") &&
  attendance.includes("hasShiftAttendance(shift, recent, now, tz)") &&
  attendance.includes('.eq("location_id", shift.location_id)'),
  "Attendance cron must use both historical entries and a fresh site-specific check");
assert.ok(attendance.includes('const dedupeKey = `attendance:${shift.id}`') &&
  attendance.includes('`missing-clock:${id}`') &&
  attendance.includes('`no-show:${id}`') &&
  !attendance.includes('dedupeKey: `${critical ?'),
  "Only one late/no-show alert per shift; honor historical dedupe keys");
assert.ok(attendance.includes('if (error) throw error') &&
  attendance.includes('if (recentError) throw recentError') &&
  attendance.includes("Attendance query truncated"),
  "Data read failures or truncation must never generate false absence alerts");
assert.ok(alerts.includes('error.code === "23505"') &&
  alerts.includes("duplicate: true"),
  "Concurrent cron workers must not double-send if dedupe insert races");

console.log("WorkTeams attendance checks passed: correct shift, exact worker/site, completed visits, one alert, overnight and races.");
