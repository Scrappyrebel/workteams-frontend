// Guard for the Temp staffing verification pass (D-WT-54).
// The module's main dashboard was verified deep (agency gate
// via /api/temp/agency, manager/temp view split, lane-aware
// matching with cross-lane honesty, per-assignment pay with
// backfill preserving the replaced temp's rate, temp-to-hire
// clock on assignment, approve auto-creating the team invite,
// consent state displayed prominently). The fake-empty class
// reached this board too: loadAll's reads ignored errors.
// The pass binds them. One behavior is pinned AS-IS on
// purpose: Approve also records the background check as
// "clear" in the same click — flagged as decision D1 for
// Wendy (a screening-workflow change is hers to rule), and
// pinned here so any change to it is a reviewed event.
import { readFileSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

const page = readFileSync("app/app/[companyId]/temp/page.js", "utf8");

// The repair.
check(page.includes("error: rqErr") && page.includes("error: apErr"), "temp: board reads bind their errors");
check(page.includes("A failed load is not an empty board"), "temp: fail-closed board message present");
check(page.includes("!loadError && requests.length === 0"), "temp: 'No requests yet' only renders on a loaded board");
check(page.includes('role="alert"'), "temp: load failure is announced");

// Verified behavior pinned.
check(page.includes("/api/temp/agency?companyId="), "temp: agency gate comes from the server route");
check(page.includes("if (!isManager)"), "temp: non-managers get only their offers view");
check(page.includes("return <TempOffersView"), "temp: temp-facing view is the offers view");
check(page.includes('(NO CONSENT)') || page.includes("(NO CONSENT)"), "temp: missing bg consent is displayed, never hidden");
check(page.includes("hire_eligible_date"), "temp: temp-to-hire eligibility date set at assignment");
check(page.includes("ns?.pay_rate_cents ?? null"), "temp: backfill preserves the replaced temp's rate");
check(page.includes("Temp needs an approved team invite first."), "temp: assignment requires an approved invite");
check(page.includes("they carry your company, so bookings and applications can't land on another agency"), "temp: public links carry the company id, stated plainly");

// Pinned as-is pending decision D1 (see PR body): the Approve
// action and its background-check argument travel together.
check(
  page.includes('onClick={() => setAppStatus(a.id, "approved", "clear")}'),
  "temp: Approve + bg-clear coupling is AS FOUND — changing it requires Wendy's D1 ruling"
);

if (failures > 0) {
  console.error("check-temp-staffing-depth: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-temp-staffing-depth: OK");
