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
  applyTempPayments,
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
});

test("Page writes ONLY to the payments ledger (081) — the owed side stays read-only", () => {
  const page = read("app/app/[companyId]/temp-pay/page.js");
  // Page 4 superseded PR #62's "page never writes" invariant for exactly
  // one table: temp_payments. Recording a payment is the feature; the
  // owed side (assignments, job requests, rates, hours) must stay
  // untouched, and payments are never deleted or upserted — void only.
  assert.ok(page.includes('from("temp_payments")'), "payments load from the 081 ledger");
  assert.ok(!page.includes(".delete("), "payments are never deleted — void with a reason instead");
  assert.ok(!page.includes(".upsert("), "no upserts anywhere on this page");
  const writes = page.match(/\.(insert|update)\(/g) || [];
  assert.equal(writes.length, 2, "exactly one payment insert and one void update");
  assert.ok(
    page.includes('.from("temp_payments")') && page.includes(".insert({"),
    "the insert targets temp_payments"
  );
  assert.ok(
    page.includes("voided_at") && page.includes("void_reason"),
    "the update is the void-with-reason write"
  );
  // The owed-side tables are only ever selected from.
  for (const tbl of ["temp_assignments", "temp_job_requests"]) {
    const chain = page.slice(page.indexOf(`from("${tbl}")`), page.indexOf(`from("${tbl}")`) + 600);
    assert.ok(!/\.(insert|update|delete|upsert)\(/.test(chain), `${tbl} chain must stay read-only`);
  }
});

test("Payments merge: full payment clears the balance; paid figures are the recorded amounts", () => {
  const report = buildTempPayOwed({
    config: CONFIG, members: MEMBERS, requests: [REQ_DONE],
    assignments: [
      { id: "a1", job_request_id: "r1", member_id: "m1", status: "accepted", pay_rate_cents: 1850 },
      { id: "a2", job_request_id: "r1", member_id: "m2", status: "accepted", pay_rate_cents: null },
    ],
    ...RANGE,
  });
  // m1 owed 14800, m2 owed 16000.
  const merged = applyTempPayments(report, [
    { id: "p1", assignment_id: "a1", member_id: "m1", amount_cents: 14800, payment_date: "2026-10-22", voided_at: null },
  ]);
  const m1 = merged.perTemp.find((t) => t.memberId === "m1");
  const m2 = merged.perTemp.find((t) => t.memberId === "m2");
  assert.equal(m1.paidCents, 14800);
  assert.equal(m1.balanceCents, 0);
  assert.equal(m1.details[0].paidInFull, true);
  assert.equal(m2.paidCents, 0);
  assert.equal(m2.balanceCents, 16000);
  assert.equal(merged.grandPaidCents, 14800);
  assert.equal(merged.grandBalanceCents, 16000);
  // Owed side unchanged: merging payments never rewrites what was owed.
  assert.equal(merged.grandTotalCents, 30800);
  assert.equal(m1.totalCents, 14800);
});

test("Payments merge: partial payments reduce the balance; voided payments count toward nothing but stay in history", () => {
  const report = buildTempPayOwed({
    config: CONFIG, members: MEMBERS, requests: [REQ_DONE],
    assignments: [{ id: "a1", job_request_id: "r1", member_id: "m1", status: "accepted", pay_rate_cents: 1850 }],
    ...RANGE,
  });
  const merged = applyTempPayments(report, [
    { id: "p1", assignment_id: "a1", member_id: "m1", amount_cents: 5000, payment_date: "2026-10-21", voided_at: null },
    { id: "p2", assignment_id: "a1", member_id: "m1", amount_cents: 4800, payment_date: "2026-10-22", voided_at: null },
    { id: "p3", assignment_id: "a1", member_id: "m1", amount_cents: 9999, payment_date: "2026-10-23", voided_at: "2026-10-24T00:00:00Z", void_reason: "Wrong amount recorded" },
  ]);
  const d = merged.perTemp[0].details[0];
  assert.equal(d.paidCents, 9800);
  assert.equal(d.balanceCents, 14800 - 9800);
  assert.equal(d.paidInFull, false);
  assert.equal(d.payments.length, 3, "voided payments stay visible in the history");
  assert.equal(merged.grandBalanceCents, 5000);
});

test("Payments merge: awaiting rows are never given amounts or payments; overpayment shows as a negative balance, not a rewritten paid figure", () => {
  const report = buildTempPayOwed({
    config: CONFIG, members: MEMBERS,
    requests: [REQ_DONE, { ...REQ_DONE, id: "r2", job_date: "2026-10-21", hours_confirmed: null }],
    assignments: [
      { id: "a1", job_request_id: "r1", member_id: "m1", status: "accepted", pay_rate_cents: 1850 },
      { id: "a4", job_request_id: "r2", member_id: "m1", status: "accepted", pay_rate_cents: 1850 },
    ],
    ...RANGE,
  });
  const merged = applyTempPayments(report, [
    // More than the current owed figure (e.g. hours were corrected down
    // after payment): the recorded paid amount stands; balance goes
    // negative so the page can say so honestly.
    { id: "p1", assignment_id: "a1", member_id: "m1", amount_cents: 20000, payment_date: "2026-10-22", voided_at: null },
    { id: "p9", assignment_id: "a4", member_id: "m1", amount_cents: 100, payment_date: "2026-10-22", voided_at: null },
  ]);
  const d = merged.perTemp[0].details[0];
  assert.equal(d.paidCents, 20000);
  assert.equal(d.balanceCents, 14800 - 20000);
  assert.equal(merged.awaiting.length, 1);
  assert.equal(merged.awaiting[0].owedCents, null);
  assert.equal(merged.awaiting[0].payments, undefined, "awaiting rows carry no payment state");
});

test("Migration 081: payments ledger carries the house guard + grants", () => {
  const sql = read("supabase/081_temp_payments.sql");
  assert.ok(sql.includes("create table if not exists public.temp_payments"));
  assert.ok(sql.includes("workteams_guard_temp_payment"), "immutable-ledger guard trigger present");
  assert.ok(sql.includes("Temp payments cannot be deleted"), "deletes are rejected in SQL, not just hidden in UI");
  assert.ok(sql.includes("grant select, insert, update, delete on public.temp_payments to authenticated"));
  assert.ok(sql.includes("grant all on public.temp_payments to service_role"));
  assert.ok(sql.includes("is_company_manager"), "RLS follows the temp module's manager shape");
});

test("Lib never treats requested hours as worked hours", () => {
  assert.ok(!/owedCents\([^)]*hours_requested/.test(libSource), "owed must not be computed from hours_requested");
  assert.ok(libSource.includes("hours_confirmed"), "lib must key payability on client-confirmed hours");
});

test("Temp pay-owed guard runs in prebuild", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.scripts.prebuild.includes("check-temp-pay-owed.mjs"));
});
