import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Dashboard operational counts (Depth D-WT-11) invariants:
// * The company home used to show Quick Access cards, today's
//   no-clock-in alerts, and manager proof settings — but no
//   operational counts at all. A manager could not see the day's
//   numbers at a glance.
// * Every count added is display-only and comes straight from
//   stored records, with the app's existing definitions:
//   - Shifts today = shifts rows for today in the company timezone.
//   - Clocked in now = distinct people with an open time entry
//     (clock_out is null — the clock-in gate's own definition).
//   - Hours completed today = clocked-out entries that started
//     today, summed as stored clock-out minus stored clock-in,
//     exactly as the Hour report sums them. An entry still on the
//     clock has no end, so it is NEVER estimated into hours.
//   - Pending requests = schedule_requests with status 'pending'.
//   - Open work orders = work orders in 'open' or 'in_progress'.
// * Managers see company-wide figures; everyone else sees their
//   own (the Today's Alerts scoping). Failed requests/work-order
//   reads show "—", never a made-up zero.
// * No pay rate is read and no pay is computed on this page.
// * Everything that was already on the page stays: Quick Access,
//   Today's Alerts, the proof settings and the feature toggles.

const page = readFileSync("app/app/[companyId]/page.js", "utf8");

assert.ok(
  page.includes("TODAY AT A GLANCE") && page.includes("YOUR DAY AT A GLANCE"),
  "the counts section must render for managers and for employees"
);
assert.ok(
  page.includes('.eq("shift_date", today)') && page.includes("counts.shiftsToday"),
  "shifts today must count today's stored shifts"
);
assert.ok(
  page.includes('.is("clock_out", null)') && page.includes("counts.clockedInNow"),
  "clocked in now must count people with an open time entry"
);
assert.ok(
  page.includes("(new Date(e.clock_out) - new Date(e.clock_in)) / 3600000") &&
    page.includes("if (e.clock_out)"),
  "completed hours must sum only clocked-out entries, as the Hour report does"
);
assert.ok(
  page.includes("Shifts still on the clock are not counted in hours until they clock out"),
  "the page must say plainly that open shifts are not counted in hours"
);
assert.ok(
  page.includes('.eq("status", "pending")') && page.includes("counts.pendingRequests"),
  "pending requests must count schedule_requests waiting for a decision"
);
assert.ok(
  page.includes('.in("status", ["open", "in_progress"])') && page.includes("counts.openWorkOrders"),
  "open work orders must count work orders not yet completed or cancelled"
);
assert.ok(
  page.includes('pendingRequests === null ? "—"') && page.includes('openWorkOrders === null ? "—"'),
  "a failed read must show a dash, never a made-up zero"
);
assert.ok(
  !/pay_rate|estPay|hourly_rate|payRate/i.test(page),
  "no pay or rate calculation may appear on the Dashboard"
);
assert.ok(
  !/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(page),
  "the Dashboard counts section is read-only: it must never write"
);
// Everything already on the page stays, in place.
for (const kept of [
  "Quick Access · Shift Essentials",
  "TODAY'S ALERTS",
  "CompanyShiftProofSettings",
  "CompanyFeatureToggles",
  "EmergencyButton",
]) {
  assert.ok(page.includes(kept), `existing dashboard element must stay: ${kept}`);
}

console.log("Dashboard operational counts guards passed.");
