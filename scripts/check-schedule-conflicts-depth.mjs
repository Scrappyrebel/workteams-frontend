import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Schedule depth (D-WT-12) invariants:
// * The catalog found the Schedule page PROFESSIONAL but with two
//   gaps: no overlap/double-booking check anywhere in the create/edit
//   path (page, API routes, or the shifts table — 001 has no time
//   constraint and the only trigger on shifts is 023's same-company
//   guard), and no notification to the assignee on shift
//   create/edit/delete (the only notify call on the page is the
//   schedule-REQUEST decision path).
// * This build closes the first gap EXPANSION-ONLY: warnings computed
//   purely from shifts the page has already loaded (list + week +
//   month states) and the approved time off it already loads, shown
//   inside the existing create-confirmation panel and live in the
//   edit form, plus a coverage/open-shift summary over the loaded
//   week. A warning NEVER blocks: the insert, the tolerant 079 retry,
//   and saveEdit's update run exactly as before. Making a warning
//   block a save is a behaviour change and a Wendy decision item.
// * The notification gap is NOT closed here: the app's existing push
//   routes are per-entity (schedule-requests, messages, work-orders)
//   and none can announce a shift assignment; a new send route is
//   new sending behaviour and a Wendy decision item. This guard pins
//   that no shift-notify call sneaks into the page.
// * Protected areas stay untouched: the page reads no time_entries,
//   shift videos or Communication Book data, and the 2026-10-29
//   "Working as" department behaviour (079) is preserved verbatim.

const PAGE = "app/app/[companyId]/schedule/page.js";
const page = read(PAGE);
const {
  timeToMinutes,
  shiftInterval,
  shiftsConflict,
  findScheduleConflicts,
  findTimeOffConflicts,
  summarizeWeekCoverage,
} = await import("../lib/schedule-conflicts.mjs");

const shift = (id, member_id, shift_date, start_time, end_time, extra = {}) => ({
  id, member_id, shift_date, start_time, end_time, ...extra,
});

test("overlap semantics: real overlaps warn, back-to-back does not", () => {
  const cand = shift(null, "m1", "2026-11-03", "09:00", "12:00");
  assert.equal(shiftsConflict(cand, shift("a", "m1", "2026-11-03", "11:00", "13:00")), true);
  assert.equal(shiftsConflict(cand, shift("b", "m1", "2026-11-03", "12:00", "14:00")), false, "starting exactly at the other's end is not an overlap");
  assert.equal(shiftsConflict(cand, shift("c", "m1", "2026-11-03", "07:00", "09:00")), false, "ending exactly at the start is not an overlap");
  assert.equal(shiftsConflict(cand, shift("d", "m2", "2026-11-03", "10:00", "11:00")), false, "a different person never conflicts");
  assert.equal(shiftsConflict(cand, shift("e", "m1", "2026-11-04", "10:00", "11:00")), false, "a different day never conflicts");
  assert.equal(shiftsConflict(shift(null, null, "2026-11-03", "09:00", "12:00"), shift("f", "m1", "2026-11-03", "10:00", "11:00")), false, "an unassigned (open) shift never conflicts");
});

test("overlap semantics: overnight shifts spill into the next day", () => {
  // 22:00-02:00 on Nov 3 occupies 00:00-02:00 on Nov 4.
  const night = shift("n", "m1", "2026-11-03", "22:00", "02:00");
  assert.equal(shiftInterval(night).end, 26 * 60);
  assert.equal(shiftsConflict(shift(null, "m1", "2026-11-04", "01:00", "03:00"), night), true);
  assert.equal(shiftsConflict(shift(null, "m1", "2026-11-04", "02:00", "04:00"), night), false, "starting at the overnight end is back-to-back");
  assert.equal(shiftsConflict(shift(null, "m1", "2026-11-03", "21:00", "23:00"), night), true, "same-evening overlap with an overnight shift warns");
});

test("findScheduleConflicts honours exclusions and never self-conflicts", () => {
  const existing = [
    shift("self", "m1", "2026-11-03", "09:00", "12:00"),
    shift("sib", "m1", "2026-11-03", "10:00", "13:00", { series_id: "series-1" }),
    shift("other", "m1", "2026-11-03", "11:00", "14:00"),
  ];
  const cand = shift("self", "m1", "2026-11-03", "09:30", "12:30");
  // Editing "self" with no exclusions still skips its own stored row.
  assert.deepEqual(findScheduleConflicts([cand], existing).map((c) => c.existing.id), ["sib", "other"]);
  // Explicit id exclusion removes the edited shift in every shape.
  assert.deepEqual(
    findScheduleConflicts([{ ...cand, id: null }], existing, { excludeIds: ["self"] }).map((c) => c.existing.id),
    ["sib", "other"]
  );
  // A series-scope edit excludes the series' own rows.
  assert.deepEqual(
    findScheduleConflicts([cand], existing, { excludeIds: ["self"], excludeSeriesId: "series-1" }).map((c) => c.existing.id),
    ["other"]
  );
});

test("time-off conflicts are inclusive of both range ends", () => {
  const off = [{ member_id: "m1", start_date: "2026-11-05", end_date: "2026-11-07", name: "Sam" }];
  const mk = (d) => shift(null, "m1", d, "09:00", "10:00");
  assert.equal(findTimeOffConflicts([mk("2026-11-05")], off).length, 1);
  assert.equal(findTimeOffConflicts([mk("2026-11-07")], off).length, 1);
  assert.equal(findTimeOffConflicts([mk("2026-11-08")], off).length, 0);
  assert.equal(findTimeOffConflicts([shift(null, "m2", "2026-11-06", "09:00", "10:00")], off).length, 0, "another member's time off never warns");
});

test("week coverage summary counts assigned, open, people and hours", () => {
  const summary = summarizeWeekCoverage([
    shift("1", "m1", "2026-11-02", "09:00", "12:00"),
    shift("2", "m1", "2026-11-03", "09:00", "10:30"),
    shift("3", "m2", "2026-11-03", "22:00", "02:00"),
    shift("4", null, "2026-11-04", "09:00", "10:00"),
  ]);
  assert.deepEqual(summary, { total: 4, assigned: 3, open: 1, people: 2, hours: 9.5 });
  assert.deepEqual(summarizeWeekCoverage([]), { total: 0, assigned: 0, open: 0, people: 0, hours: 0 });
});

test("page wires warnings into create confirmation and edit form, from loaded shifts only", () => {
  for (const needle of [
    'from "../../../../lib/schedule-conflicts.mjs"',
    "findScheduleConflicts(confirmAdd.rows, loadedShifts)",
    "findTimeOffConflicts(confirmAdd.rows, approvedOff)",
    "warningBox(conflictLines(addConflicts, addOffConflicts, 5))",
    "warningBox(conflictLines(editConflicts, editOffConflicts, 3))",
    "summarizeWeekCoverage(weekShifts)",
    "Possible double-booking",
    "This is a warning only — nothing here stops you.",
    "open (unassigned)",
  ]) {
    assert.ok(page.includes(needle), `schedule page carries: ${needle}`);
  }
  // The warning pool is the three already-loaded shift states — the
  // build adds no new shifts query for warnings.
  assert.ok(page.includes("for (const s of [...shifts, ...weekShifts, ...monthShifts])"), "warning pool unions the loaded views");
  assert.equal((page.match(/\.from\("shifts"\)/g) || []).length, 10, "the build adds no new shifts query (10 call sites, as on main)");
});

test("create and save behaviour is byte-preserved around the warnings", () => {
  for (const needle of [
    'let { error } = await sb.from("shifts").insert(rows);',
    "if (error && /department|position_name/i.test(error.message || \"\"))",
    "if (!sameShiftRows(prep.rows, confirmAdd.rows))",
    "setConfirmAdd(null);",
    "refreshVisible();",
    'department: editForm.member_id ? (editForm.department || null) : null',
    "This and all future shifts in the series",
  ]) {
    assert.ok(page.includes(needle), `existing behaviour kept: ${needle}`);
  }
  // saveEdit gained no confirmation gate and no early return: the only
  // alert paths in it are the pre-existing validation/save failures.
  const saveStart = page.indexOf("async function saveEdit(s)");
  const saveEnd = page.indexOf("async function deleteShift(id)");
  const saveBlock = page.slice(saveStart, saveEnd);
  assert.ok(!saveBlock.includes("warningBox") && !saveBlock.includes("findScheduleConflicts"), "saveEdit itself stays warning-free and ungated");
  assert.ok(!saveBlock.includes("confirm("), "saveEdit gained no native confirm");
});

test("no assignee notification was added and protected areas stay untouched", () => {
  // The page's only notify call remains the schedule-request decision.
  assert.equal((page.match(/schedule-requests\/notify/g) || []).length, 1, "only the request-decision notify call exists");
  assert.ok(!page.includes("/api/shifts/notify"), "no new shift-notify route is called");
  assert.ok(!page.includes("sendPush"), "the page never sends pushes directly");
  for (const banned of ["time_entries", "shift_videos", "comm_book", "chooseAssignedShift"]) {
    assert.ok(!page.includes(banned), `schedule page does not touch ${banned}`);
  }
});
