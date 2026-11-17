// Guard for the Temp staffing verification pass (D-WT-54).
// The module's main dashboard was verified deep (agency gate
// via /api/temp/agency, manager/temp view split, lane-aware
// matching with cross-lane honesty, per-assignment pay with
// backfill preserving the replaced temp's rate, temp-to-hire
// clock on assignment, approve auto-creating the team invite,
// consent state displayed prominently). The fake-empty class
// reached this board too: loadAll's reads ignored errors.
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

const agencyCss = readFileSync("app/app/[companyId]/temp/agency.module.css", "utf8");
const teamPage = readFileSync("app/app/[companyId]/team/page.js", "utf8");
check(page.includes('className={styles.tabs}') && agencyCss.includes("overflow-x: auto") &&
  agencyCss.includes("max-inline-size: 100%") && agencyCss.includes("flex: 0 0 auto"),
  "temp: scrolling is constrained to the agency tab row");
check(page.includes('encodeURIComponent(company.id)') &&
  page.includes('#invite-team-member') && page.includes('#team-roster') &&
  teamPage.includes('id="invite-team-member"') && teamPage.includes('id="team-roster"'),
  "temp: application, employee invite and roster are accessible for this company");
check(page.includes('Company: {company.name}') &&
  page.includes('href="/app" onClick={clearLastPath}>Switch company'),
  "temp: identifies the active company and returns to the picker without reopening the saved workspace");
check(page.includes('pendingApps.filter(matchesWorker)') &&
  page.includes('approvedTemps.filter((worker) => matchesWorker(worker)'),
  "temp: lookup covers both pending and approved workers");
const approval = page.slice(page.indexOf('async function setAppStatus'), page.indexOf('async function saveCfg'));
check(approval.includes('if (error) throw error;') &&
  approval.includes('if (existing.error) throw existing.error;') &&
  approval.includes('existing.data.role !== "employee"') &&
  approval.includes('.eq("status", "applied")') &&
  !approval.includes('invite sent'),
  "temp: approval requires a worker account and handles errors");
// Pinned per Wendy's D1 ruling (2026-11-16 — "do not out the
// background check part"): the Approve action and its
// background-check "clear" travel together. Changing this
// coupling is a reviewed event that needs her fresh ruling.
check(
  approval.includes('if (status === "approved") patch.bg_check_status = "clear";'),
  "temp: Approve + bg-clear coupling stays — Wendy's D1 ruling 2026-11-16"
);
if (failures > 0) {
  console.error("check-temp-staffing-depth: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-temp-staffing-depth: OK");
