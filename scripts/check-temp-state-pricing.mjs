// Guard for the per-state temp pricing layer.
// The rule being pinned: a state is verified with researched
// figures, or it is not priced at all. Missouri's researched values
// are asserted exactly, all 49 other states must be present and
// unverified, and the estimator must refuse unverified states
// BEFORE any arithmetic — there is no fallback to Missouri.
import { readFileSync, existsSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

check(existsSync("lib/temp-state-pricing.js"), "state pricing: data layer exists");
const lib = readFileSync("lib/temp-state-pricing.js", "utf8");

// Missouri, exactly as researched 2026-11-07.
for (const token of [
  "minWage: 15.0",
  "uiNewEmployerRate: 2.376",
  "uiWageBase: 9000",
  "clerical: 0.2",
  "janitorial: 3.31",
  "machineShop: 5.09",
  'verifiedOn: "2026-11-07"',
]) {
  check(lib.includes(token), `state pricing: Missouri figure pinned — ${token}`);
}

// All 50 states present; exactly 49 ride the unverified factory.
const codes = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
for (const c of codes) {
  check(lib.includes(`"${c}"`), `state pricing: state present — ${c}`);
}
check(
  (lib.match(/unverified\("/g) || []).length === 49,
  "state pricing: exactly 49 states are unverified (Missouri is the only verified one)"
);
check(lib.includes("verified: false"), "state pricing: unverified states carry verified: false");

// Refusal happens before arithmetic.
const refuseAt = lib.indexOf('if (!st.verified)');
const mathAt = lib.indexOf("loadedPerHour =");
check(refuseAt !== -1 && mathAt !== -1 && refuseAt < mathAt, "state pricing: estimator refuses unverified states before computing");
check(lib.includes('reason: "below_min_wage"'), "state pricing: sub-minimum-wage pay is refused, not priced");

const page = readFileSync("app/app/[companyId]/temp/page.js", "utf8");
check(page.includes('from "./StatePricing"'), "state pricing: settings render the component");
check(existsSync("app/app/[companyId]/temp/StatePricing.js"), "state pricing: component exists");
const comp = readFileSync("app/app/[companyId]/temp/StatePricing.js", "utf8");
check(comp.includes("not verified yet"), "state pricing: unverified states say so plainly in the UI");
check(comp.includes("never"), "state pricing: UI states the no-borrowing rule");

if (failures > 0) {
  console.error("check-temp-state-pricing: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-temp-state-pricing: OK");
