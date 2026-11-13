import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const read = (p) => readFileSync(p, "utf8");

// Schedule — Friday-counted weekend repeats (owner rule, 2026-11-08,
// restated 2026-11-13): Kristin's title-company cleans repeat on the
// 1st & 3rd WEEKEND of the month, where a weekend counts from its
// Friday (Fri–Thu week) and belongs to the month its Friday falls in.
// In a month that starts on a Saturday or Sunday, those weekends land
// one week later than the plain nth-weekday rule gives. The Schedule
// page therefore carries two extra repeat patterns, fri_weekend
// (1st & 3rd) and fri_weekend_24 (2nd & 4th), which anchor the shift's
// weekday to the nth Friday of the month instead of to the nth
// occurrence of the weekday itself. WorkTeams has no series record and
// no database recurrence constraint — occurrences are materialized as
// ordinary shift rows at creation — so this page's buildOccurrences is
// the only place the rule lives, and this guard drills the real
// function extracted from the page so a refactor cannot silently
// change the dates. The plain nth_weekday patterns are pinned
// unchanged alongside.

const PAGE = "app/app/[companyId]/schedule/page.js";
const page = read(PAGE);

test("schedule page offers both Friday-weekend repeat options", () => {
  assert.ok(page.includes('<option value="fri_weekend">'), "fri_weekend option missing");
  assert.ok(page.includes('<option value="fri_weekend_24">'), "fri_weekend_24 option missing");
  assert.ok(page.includes("weekend counted from Friday"), "Friday-counted option wording missing");
  assert.ok(page.includes("(Fri weekend)"), "series label suffix missing");
  // Plain nth-weekday options stay exactly as they were.
  assert.ok(page.includes('<option value="nth_weekday">'), "nth_weekday option missing");
  assert.ok(page.includes('<option value="nth_weekday_24">'), "nth_weekday_24 option missing");
});

function loadHelpers() {
  const names = page.match(/const WEEKDAY_NAMES = \[[^\]]*\];/);
  assert.ok(names, "WEEKDAY_NAMES declaration not found");
  const start = page.indexOf("function parseDay");
  const end = page.indexOf("function newUUID");
  assert.ok(start >= 0 && end > start, "helper block not found");
  const code =
    names[0] +
    "\n" +
    page.slice(start, end) +
    "\nthis.__exports = { buildOccurrences, recurrenceLabel };";
  const ctx = vm.createContext({});
  vm.runInContext(code, ctx);
  return ctx.__exports;
}

test("Friday-weekend occurrences match the owner's rule", () => {
  const { buildOccurrences } = loadHelpers();
  // vm-realm arrays fail deepStrictEqual on prototype alone; compare values.
  const eq = (got, exp, name) => assert.equal(JSON.stringify(got), JSON.stringify(exp), name);
  // November 2026 starts on a Sunday: her Sundays are the 8th & 22nd,
  // NOT the 1st & 15th the plain nth-weekday rule gives.
  eq(
    buildOccurrences("2026-11-08", "fri_weekend", "2027-03-01"),
    ["2026-11-08", "2026-11-22", "2026-12-06", "2026-12-20", "2027-01-03", "2027-01-17", "2027-02-07", "2027-02-21"],
    "1st & 3rd Sundays, Fri-weekend, from Nov 8 2026"
  );
  eq(
    buildOccurrences("2026-11-15", "fri_weekend_24", "2026-12-31"),
    ["2026-11-15", "2026-11-29", "2026-12-13", "2026-12-27"],
    "2nd & 4th Sundays, Fri-weekend, from Nov 15 2026"
  );
  // May 2027 starts on a Saturday — the next divergence month.
  eq(
    buildOccurrences("2027-05-02", "fri_weekend", "2027-06-30"),
    ["2027-05-09", "2027-05-23", "2027-06-06", "2027-06-20"],
    "May 2027 divergence"
  );
  // A Friday shift anchors on the Fridays themselves.
  eq(
    buildOccurrences("2026-11-06", "fri_weekend", "2026-12-31"),
    ["2026-11-06", "2026-11-20", "2026-12-04", "2026-12-18"],
    "Friday anchor"
  );
  // A Saturday shift rides the same weekends as its Friday.
  eq(
    buildOccurrences("2026-11-14", "fri_weekend_24", "2026-11-30"),
    ["2026-11-14", "2026-11-28"],
    "Saturday anchor, 2nd & 4th"
  );
  // A weekend whose Friday is Feb 26–28 belongs to February even when
  // its Sunday spills into March.
  eq(
    buildOccurrences("2027-02-28", "fri_weekend_24", "2027-03-31"),
    ["2027-02-28", "2027-03-14", "2027-03-28"],
    "Feb/Mar spill keeps the weekend in February"
  );
});

test("plain nth-weekday patterns are unchanged", () => {
  const { buildOccurrences } = loadHelpers();
  assert.equal(JSON.stringify(buildOccurrences("2026-11-01", "nth_weekday", "2026-11-30")), JSON.stringify(["2026-11-01", "2026-11-15"]));
  assert.equal(JSON.stringify(buildOccurrences("2026-11-08", "nth_weekday_24", "2026-11-30")), JSON.stringify(["2026-11-08", "2026-11-22"]));
});

test("Friday-weekend series labels say so", () => {
  const { recurrenceLabel } = loadHelpers();
  assert.equal(recurrenceLabel("fri_weekend", "2026-11-08"), "1st & 3rd Sunday (Fri weekend)");
  assert.equal(recurrenceLabel("fri_weekend_24", "2026-11-15"), "2nd & 4th Sunday (Fri weekend)");
  assert.equal(recurrenceLabel("nth_weekday", "2026-11-01"), "1st & 3rd Sunday");
});
