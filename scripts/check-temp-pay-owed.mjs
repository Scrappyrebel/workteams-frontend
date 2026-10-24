import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Temp pay-owed invariants. The audit finding this pins: a temp's
// per-assignment pay_rate_cents was written at assignment time but never
// reached any pay report, so there was no view of what each temp is
// owed. The fix must stay honest about hours: the ONLY recorded
// worked-hours field in the temp schema is the client-confirmed hours
// on the job request (hours_confirmed, migration 047) — there is no
// per-assignment hours field and time_entries has no temp-job link.
// So owed may be computed ONLY from assignment rate x confirmed hours,
// on accepted assignments of completed jobs; everything else is listed
// without an amount. Requested hours must never become pay.

const libSource = read("lib/temp-pay-owed.js");
const {
  buildTempPayOwed,
  classifyAssignment,
  rateCentsForAssignment,
  owedCents,
  hoursToHundredths,
} = await import("data:text/javascript," + encodeURIComponent(libSource));

const CONFIG = { temp_hourly_pay: 20 }; // $20.00 agency default
const REQ_DONE = {
  id: "r1", customer_name: "Acme Corp", service_type: "commercial",
  job_date: "2026-10-20", status: "completed",
  hours_requested: 8, hours_confirmed: 8, created_at: "2026-10-18T00:00:00Z",
};
const MEMBERS = [
  { id: "m1", display_name: "Tess Temp", email: "tess@example.com" },
  { id: "m2", display_name: "Uma Temp", email: "uma@example.com" },
];
const RANGE = { start: "2026-10-14", end: "2026-10-24" };

test("Rate comes from the assignment's pay_rate_cents; NULL falls back to the agency default (046)", () => {
  assert.deepEqual(rateCentsForAssignment({ pay_rate_cents: 1850 }, CONFIG), { cents: 1850, source: "assignment" });
  assert.deepEqual(rateCentsForAssignment({ pay_rate_cents: null }, CONFIG), { cents: 2000, source: "agency default" });
  assert.deepEqual(rateCentsForAssignment({ pay_rate_cents: null }, null), { cents: null, source: "none" });
});

test("Cents math is integer end-to-end (hours carried as hundredths)", () => {
  assert.equal(hoursToHundredths(8), 800);
  assert.equal(hoursToHundredths(7.25), 725);
  assert.equal(hoursToHundredths(null), null);
  assert.equal(owedCents(2000, 800), 16000); // $20.00/hr x 8h = $160.00
  assert.equal(owedCents(1850, 725), 13413); // $18.50/hr x 7.25h = $134.125 -> 13413c
  assert.equal(owedCents(null, 800), null);
});

test("Only accepted assignments on completed jobs with client-confirmed hours are payable", () => {
  assert.equal(classifyAssignment({ status: "accepted" }, REQ_DONE).kind, "payable");
  assert.equal(classifyAssignment({ status: "completed" }, REQ_DONE).kind, "payable");
  assert.equal(classifyAssignment({ status: "offered" }, REQ_DONE).kind, "awaiting");
  assert.equal(classifyAssignment({ status: "accepted" }, { ...REQ_DONE, status: "assigned" }).kind, "awaiting");
  assert.equal(classifyAssignment({ status: "accepted" }, { ...REQ_DONE, hours_confirmed: null }).kind, "awaiting");
  assert.equal(classifyAssignment({ status: "declined" }, REQ_DONE).kind, "excluded");
  assert.equal(classifyAssignment({ status: "no_show" }, REQ_DONE).kind, "excluded");
});

test("Report: per-temp totals owed, awaiting rows carry NO amount, requested hours never become pay", () => {
  const report = buildTempPayOwed({
    config: CONFIG,
    members: MEMBERS,
    requests: [
      REQ_DONE,
      { ...REQ_DONE, id: "r2", job_date: "2026-10-21", hours_confirmed: null }, // done, unconfirmed
      { ...REQ_DONE, id: "r3", job_date: "2026-10-22", status: "assigned" },     // not completed
    ],
    assignments: [
      { id: "a1", job_request_id: "r1", member_id: "m1", status: "accepted", pay_rate_cents: 1850 },
      { id: "a2", job_request_id: "r1", member_id: "m2", status: "accepted", pay_rate_cents: null }, // default rate
      { id: "a3", job_request_id: "r1", member_id: "m1", status: "no_show", pay_rate_cents: 1850 },
      { id: "a4", job_request_id: "r2", member_id: "m1", status: "accepted", pay_rate_cents: 1850 },
      { id: "a5", job_request_id: "r3", member_id: "m2", status: "accepted", pay_rate_cents: 2200 },
      { id: "a6", job_request_id: "r1", member_id: "m2", status: "offered", pay_rate_cents: 2200 },
    ],
    ...RANGE,
  });
  // m1: 8h x $18.50 = $148.00. m2: 8h x $20.00 default = $160.00.
  assert.equal(report.grandTotalCents, 14800 + 16000);
  const m1 = report.perTemp.find((t) => t.memberId === "m1");
  const m2 = report.perTemp.find((t) => t.memberId === "m2");
  assert.equal(m1.totalCents, 14800);
  assert.equal(m2.totalCents, 16000);
  assert.equal(m2.details[0].rateSource, "agency default");
  // a4 (unconfirmed) + a5 (job not completed) + a6 (not accepted): awaiting, no money.
  assert.equal(report.awaiting.length, 3);
  for (const row of report.awaiting) assert.equal(row.owedCents, null);
  // a3 no-show: excluded, not awaiting, not paid.
  assert.equal(report.excludedCount, 1);
});

test("Report: date range follows the job date, like the payroll report follows clock-in", () => {
  const report = buildTempPayOwed({
    config: CONFIG, members: MEMBERS, requests: [REQ_DONE],
    assignments: [{ id: "a1", job_request_id: "r1", member_id: "m1", status: "accepted", pay_rate_cents: 2000 }],
    start: "2026-10-21", end: "2026-10-24", // job was 2026-10-20: outside
  });
  assert.equal(report.perTemp.length, 0);
  assert.equal(report.grandTotalCents, 0);
});

test("Page is owner/manager-gated and loads nothing for anyone else", () => {
  const page = read("app/app/[companyId]/temp-pay/page.js");
  assert.ok(page.includes("isManagerRole"), "page must gate on the shared manager role check");
  assert.ok(
    page.includes("if (!loading && company && member && isManager) load();"),
    "data loads only when the signed-in member is a manager"
  );
  assert.ok(page.includes("owners and managers only"), "non-managers get an explicit managers-only message");
  assert.ok(page.includes("buildTempPayOwed"), "page must compute through lib/temp-pay-owed, not inline math");
  assert.ok(page.includes("temp_assignments"), "page reads the assignments table");
  assert.ok(page.includes("pay_rate_cents"), "page selects the per-assignment rate");
  // Read-only: the page must never write.
  for (const write of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert.ok(!page.includes(write), `temp-pay page must not write (${write})`);
  }
});

test("Lib never treats requested hours as worked hours", () => {
  assert.ok(!/owedCents\([^)]*hours_requested/.test(libSource), "owed must not be computed from hours_requested");
  assert.ok(libSource.includes("hours_confirmed"), "lib must key payability on client-confirmed hours");
});

test("Temp pay-owed guard runs in prebuild", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.scripts.prebuild.includes("check-temp-pay-owed.mjs"));
});
