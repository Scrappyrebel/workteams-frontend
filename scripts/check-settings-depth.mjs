// Guard for the Settings depth pass (D-WT-40).
// The catalog calls this page BLOCKER-thin (name, timezone,
// state — nothing else). The pass repairs a real defect in
// the tolerant state probe (a company whose state was never
// set could never set it: the probe required a non-null value
// before marking the column present, so save omitted the
// field forever) and adds a read-only at-a-glance panel from
// the company record the layout already loads. The save
// payload itself is pinned unchanged.
import { readFileSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

const page = readFileSync("app/app/[companyId]/settings/page.js", "utf8");
const lib = readFileSync("lib/settings-summary.js", "utf8");

// The probe repair.
check(page.includes("if (!error && data) {"), "settings: probe marks the column present on an error-free row");
check(
  page.includes("if (data.state != null) setState(String(data.state));"),
  "settings: stored state still loads when present"
);
check(
  !page.includes("if (!error && data && data.state != null) {"),
  "settings: the first-set-blocking probe condition is gone"
);

// Save behavior pinned unchanged.
check(page.includes("const payload = { name: name.trim(), timezone };"), "settings: save payload base unchanged");
check(page.includes("if (hasStateColumn) payload.state = state || null;"), "settings: state still sent only when the column exists");
check(page.includes('member.role !== "owner"'), "settings: owner-only gate intact");

// The at-a-glance depth.
check(page.includes("Your company at a glance"), "settings: at-a-glance panel renders");
check(page.includes("planStanding(company)"), "settings: panel reads the loaded company record");
check(page.includes("settingsCompleteness({"), "settings: completeness helper used");
check(
  page.includes("Plan changes and billing live on the Plans page"),
  "settings: honest billing pointer (nothing about billing changes here)"
);
check(page.includes("State saving is not active in this workspace yet"), "settings: state-unavailable honesty line");
check(page.includes('from("company_members")'), "settings: tolerant member-count probe present");

// Lib honesty rules.
check(lib.includes("export function planStanding"), "lib: planStanding exported");
check(lib.includes("export function settingsCompleteness"), "lib: settingsCompleteness exported");
check(lib.includes("stateUnavailable: !hasStateColumn"), "lib: unavailable state is not counted as missing or set");
check(!/insert|update|delete|upsert/.test(lib), "lib: summary lib performs no writes");

if (failures > 0) {
  console.error("check-settings-depth: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-settings-depth: OK");
