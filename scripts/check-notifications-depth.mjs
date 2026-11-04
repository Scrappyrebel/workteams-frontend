// Guard for the Notifications verification pass (D-WT-52).
// The page was verified professional: per-category choices
// with honest per-category enforcement notes (Pay's choice is
// saved but does not send yet — stated on the category
// itself), migration-missing states that are honest and
// panel-scoped (the category probe and the quiet-hours probe
// are separate, so one missing migration never takes the
// other panel down), a toggle that ROLLS BACK on a failed
// save ("never show a choice that didn't save"), quiet-hours
// validation (both times or neither; equal = off), and
// emergency/help alerts categorically excluded from muting.
// The pass adds one derived combined-state summary line and
// pins the verified behavior.
import { readFileSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

const page = readFileSync("app/app/[companyId]/notifications/page.js", "utf8");

// Verified honesty + safety behavior pinned.
check(page.includes("never show a choice that didn't save"), "notifications: failed toggle rolls back (comment contract)");
check(page.includes("setPrefs(prefs); // put it back"), "notifications: rollback implemented on save error");
check(page.includes("These don't send phone notifications yet"), "notifications: Pay category states its not-yet-sending status");
check(page.includes("Emergency and help alerts are not in this list"), "notifications: emergency exclusion stated at the list");
check(page.includes("Emergency and help alerts always come through, quiet hours or not."), "notifications: emergency exclusion stated at quiet hours");
check(page.includes("Per-type choices turn on with the latest WorkTeams update."), "notifications: prefs setup state honest");
check(page.includes("Quiet hours turn on with the latest WorkTeams update."), "notifications: quiet-hours setup state honest and separate");
check(page.includes("Set both a start and an end time for quiet hours"), "notifications: quiet-hours both-or-neither validation");
check(page.includes("BLOCKED BY DEVICE"), "notifications: blocked-by-device state has its own label + instructions");
check(page.includes("Each phone, tablet, or computer must be enabled separately."), "notifications: per-device honesty");

// The summary line added by this pass.
check(page.includes("Right now: {PREF_CATEGORIES.filter((c) => prefs[c.key]).length} of"), "notifications: combined-state summary renders from loaded prefs");
check(page.includes("no quiet hours set"), "notifications: summary states the no-quiet-hours case plainly");
check(page.includes("Emergency and help alerts always come through."), "notifications: summary repeats the emergency guarantee");

if (failures > 0) {
  console.error("check-notifications-depth: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-notifications-depth: OK");
