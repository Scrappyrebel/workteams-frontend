import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Schedule — Repeats depth (D-WT-13) invariants:
// * Catalog verdict was M and the storage finding is load-bearing:
//   WorkTeams has NO series record. Migration 031 adds only
//   shifts.series_id + shifts.recurrence_label; a repeat materializes
//   as ordinary shift rows sharing one series_id, created/edited on
//   the Schedule page. This page's build is therefore read-derivation
//   plus ONE write that is a strict subset of the existing one.
// * Existing behaviour is byte-pinned below: future-only load grouped
//   by series_id, the first row's label/time/place/person on the card,
//   one-offs listed separately, and Delete series removing only shifts
//   from today onward behind the two-tap confirm.
// * The depth build adds, expansion-only: a "Repeats at a glance"
//   summary, per-series derived detail (next dates, cadence read off
//   the stored dates, per-shift and total SCHEDULED time, end state,
//   exact past counts, single dates that differ from the series' usual
//   pattern), a manager pointer to the Schedule page's existing create
//   flow, and "End series sooner" — pick a last date, two-tap confirm,
//   delete only shifts AFTER that date and never before today.
// * Pause, a stored pattern, and editing a series' pattern are NOT
//   built: no column or table exists to hold them (decision items in
//   the PR). Nothing here touches the time clock, shift videos or the
//   Communication Book, and no labour-law wording is introduced —
//   scheduled time is labelled as scheduled, never worked.
// * Owner ruling 2026-11-02 (decision item D3, now FIXED): Delete
//   series is blocked when any shift in the series has recorded work —
//   it could previously delete a shift someone had already started
//   work on that day, detaching its time record. The guard below pins
//   the block, the plain on-page message, and the exact boundary of
//   the one protected-area exception it needs: the page may READ time
//   records (a select of shift ids, nothing else) solely to make this
//   check. It still never writes to them, and the clock, videos and
//   Communication Book remain entirely untouched.

const PAGE = "app/app/[companyId]/schedule/repeats/page.js";
const LIB = "lib/repeat-series.mjs";

test("existing repeats behaviour is unchanged", () => {
  const page = read(PAGE);
  for (const needle of [
    '.gte("shift_date", today)',
    'if (s.series_id) {',
    'label: first.recurrence_label || "Repeating"',
    "Everything on repeat, plus one-time shifts — in one place.",
    "Nothing repeating right now.",
    "No one-time shifts scheduled.",
    'confirmSeriesId === g.seriesId ? "Tap again: delete all future repeats" : "Delete series"',
    '.eq("series_id", seriesId)',
    "Removes the FUTURE shifts of a repeat series; past shifts stay as history.",
  ]) {
    assert.ok(page.includes(needle), `repeats page keeps: ${needle}`);
  }
});

test("page stays clear of protected areas", () => {
  const page = read(PAGE) + read(LIB);
  // "time_entries" left this list under the 2026-11-02 ruling: the
  // delete guard below READs time records (select only) to protect
  // them. Everything else about the clock stays banned, and the next
  // test pins the read-only boundary exactly.
  for (const banned of ["clock_in", "clock_out", "shift_videos", "comm_book", "communication_book"]) {
    assert.ok(!page.includes(banned), `repeats depth must not reference ${banned}`);
  }
});

test("delete series is blocked when any shift in the series has recorded work", async () => {
  const page = read(PAGE);
  // The only contact with time records anywhere in page + lib is a
  // read of shift ids for this check — every occurrence must be a
  // select, never a write.
  const all = page + read(LIB);
  const occurrences = all.split('.from("time_entries")').length - 1;
  assert.ok(occurrences >= 1, "delete guard reads time records");
  for (const part of all.split('.from("time_entries")').slice(1)) {
    assert.ok(part.trimStart().startsWith('.select("shift_id")'), "every read of time records is a select of shift_id — never a write");
  }
  // The check runs fresh inside deleteSeries, BEFORE the delete, and
  // both a positive count and a failed check stop the deletion.
  const fn = page.slice(page.indexOf("async function deleteSeries"), page.indexOf("async function endSeriesEarly"));
  assert.ok(fn.includes("fetchWorkedCount(sb, seriesId)"), "deleteSeries runs the worked check");
  assert.ok(fn.indexOf("fetchWorkedCount(sb, seriesId)") < fn.indexOf(".delete()"), "the worked check happens before any delete");
  assert.ok(fn.includes("worked === null"), "a failed check fails closed — nothing is deleted");
  assert.ok(fn.includes("worked > 0"), "a worked shift blocks the delete");
  // The page is honest up front: a series with recorded work shows why
  // it cannot be deleted instead of offering the button.
  assert.ok(page.includes("isManager && g.workedCount === 0"), "delete button is offered only when no shift in the series has recorded work");
  assert.ok(page.includes("This series can"), "blocked message renders on the page");
  assert.ok(page.includes("work has been recorded on"), "blocked message says why, in plain words");
  assert.ok(page.includes("would detach its time record"), "blocked message names the harm honestly");
  // The counting itself, on fixtures: a worked shift in the series
  // blocks; other series' work and no work do not.
  const lib = await import("../lib/repeat-series.mjs");
  assert.equal(lib.countWorkedShifts(["a", "b", "c"], ["b"]), 1);
  assert.equal(lib.countWorkedShifts(["a", "b", "c"], new Set(["a", "c"])), 2);
  assert.equal(lib.countWorkedShifts(["a", "b"], ["x", "y"]), 0);
  assert.equal(lib.countWorkedShifts(["a", "b"], []), 0);
  assert.equal(lib.countWorkedShifts([], ["a"]), 0);
});

test("derived detail comes from the stored rows via the shared helpers", () => {
  const page = read(PAGE);
  for (const needle of [
    'from "../../../../../lib/repeat-series.mjs"',
    "summarizeSeries(rows)",
    "Repeats at a glance",
    "of scheduled time",
    "Next: {friendlyDate(g.summary.firstDate)}",
    "The last repeat is",
    "kept in history",
    "from the series' usual pattern (a single date was changed)",
    "changed from the usual pattern: ",
    '{ count: "exact", head: true }',
    '.lt("shift_date", today)',
  ]) {
    assert.ok(page.includes(needle), `repeats depth renders: ${needle}`);
  }
});

test("end series sooner is manager-only, two-tap, and a strict subset of delete series", () => {
  const page = read(PAGE);
  for (const needle of [
    "End series sooner",
    "Last date for this series",
    "min={todayISO}",
    "max={g.lastDate}",
    '.gt("shift_date", lastDate)',
    "Shifts after that date are removed. Shifts on or before it stay, today's shifts stay, and earlier shifts stay as history.",
    "That is already the last date — nothing would change.",
    "`Tap again: end after ${friendlyDate(endPick.date)}`",
  ]) {
    assert.ok(page.includes(needle), `end-sooner keeps: ${needle}`);
  }
  // The end-sooner delete can never reach today or the past: the gt on
  // the picked date is paired with the same gte-today floor delete
  // series uses, inside endSeriesEarly itself.
  const fn = page.slice(page.indexOf("async function endSeriesEarly"), page.indexOf("if (loading || !company)"));
  assert.ok(fn.includes('.gt("shift_date", lastDate)'), "end-sooner deletes only after the picked date");
  assert.ok(fn.includes('.gte("shift_date", chicagoToday(company?.timezone))'), "end-sooner keeps the today floor");
  assert.ok(fn.includes("lastDate >= g.lastDate"), "end-sooner no-ops at the current last date");
});

test("create guidance points at the existing Schedule flow instead of duplicating it", () => {
  const page = read(PAGE);
  assert.ok(page.includes("New repeats are started on the Schedule page"), "guidance line present");
  assert.ok(page.includes("`/app/${company.id}/schedule`"), "guidance links to Schedule");
  assert.ok(!page.includes("buildOccurrences"), "no second occurrence builder is introduced");
  assert.ok(!page.includes('.insert('), "repeats page inserts nothing");
});

test("repeat-series helpers derive pattern, cadence and scheduled time honestly", async () => {
  const lib = await import("../lib/repeat-series.mjs");
  assert.equal(lib.minutesOfDay("09:30"), 570);
  assert.equal(lib.minutesOfDay("9:05:00"), 545);
  assert.equal(lib.minutesOfDay(""), null);
  assert.equal(lib.shiftMinutes({ start_time: "09:00", end_time: "12:30" }), 210);
  // Overnight shifts wrap past midnight; equal or missing times have
  // no derivable length and must not be silently counted.
  assert.equal(lib.shiftMinutes({ start_time: "22:00", end_time: "02:00" }), 240);
  assert.equal(lib.shiftMinutes({ start_time: "09:00", end_time: "09:00" }), null);
  assert.equal(lib.shiftMinutes({ start_time: "09:00", end_time: null }), null);
  assert.equal(lib.daysBetween("2026-11-02", "2026-11-09"), 7);
  assert.equal(lib.formatMinutes(570), "9h 30m");
  assert.equal(lib.formatMinutes(540), "9h");
  assert.equal(lib.formatMinutes(45), "45m");

  const rows = [
    { id: "a", shift_date: "2026-11-02", start_time: "09:00", end_time: "12:00", location_id: "L1", member_id: "M1", department: "Cleaning / Field Work", notes: null },
    { id: "b", shift_date: "2026-11-09", start_time: "09:00", end_time: "12:00", location_id: "L1", member_id: "M1", department: "Cleaning / Field Work", notes: null },
    { id: "c", shift_date: "2026-11-16", start_time: "10:00", end_time: "12:00", location_id: "L1", member_id: "M2", department: "Cleaning / Field Work", notes: "Deep clean" },
  ];
  const s = lib.summarizeSeries(rows);
  assert.equal(s.count, 3);
  assert.equal(s.firstDate, "2026-11-02");
  assert.equal(s.lastDate, "2026-11-16");
  assert.deepEqual(s.gaps, [7, 7]);
  assert.equal(s.totalMinutes, 180 + 180 + 120);
  assert.deepEqual(s.changedById, { c: ["time", "person", "notes"] });
  assert.equal(s.changedCount, 1);
  assert.equal(s.distinctMembers, 2);
  assert.equal(lib.summarizeSeries([]).count, 0);
});
