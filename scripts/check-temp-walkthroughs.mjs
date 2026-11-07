// Guard for the temp-service field-sales walkthroughs.
// The templates are the sales team's tap-through at a client site;
// the factory template's safety section doubles as the agency's
// OSHA inquire-and-verify record, so those items are pinned here —
// dropping one is a compliance event, not a copy edit.
import { readFileSync, existsSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

check(existsSync("lib/temp-walkthroughs.js"), "walkthroughs: template library exists");
const lib = readFileSync("lib/temp-walkthroughs.js", "utf8");
for (const lane of ["cleaning", "office", "manufacturing"]) {
  check(lib.includes(`lane: "${lane}"`), `walkthroughs: ${lane} template present`);
}
// The factory safety record, item by item.
for (const item of ["HazCom", "Lockout/tagout", "PPE", "Machine guarding", "Injury reporting"]) {
  check(lib.includes(item), `walkthroughs: factory safety item pinned — ${item}`);
}
check(lib.includes("safety: true"), "walkthroughs: safety section is flagged as the OSHA record");

const page = readFileSync("app/app/[companyId]/temp/page.js", "utf8");
check(page.includes('"Sales Walkthroughs"'), "walkthroughs: tab present on the temp dashboard");
check(page.includes('from "./Walkthroughs"'), "walkthroughs: dashboard imports the component");
check(existsSync("app/app/[companyId]/temp/Walkthroughs.js"), "walkthroughs: component exists");
const comp = readFileSync("app/app/[companyId]/temp/Walkthroughs.js", "utf8");
check(comp.includes("Quote worksheet"), "walkthroughs: on-the-spot quote worksheet present");
check(comp.includes("OSHA record"), "walkthroughs: safety section is labeled as the OSHA record in the UI");

// Persistence (migration 096): a completed walkthrough is a
// temp_walkthroughs row — the company record — and the tab lists
// saved walkthroughs from the table. A failed save must say so
// plainly and never claim the record exists.
check(
  comp.includes('.from("temp_walkthroughs")') && comp.includes(".insert("),
  "walkthroughs: completing a walkthrough saves a temp_walkthroughs row"
);
check(comp.includes("Saved walkthroughs"), "walkthroughs: saved records are listed from the table");
check(comp.includes("Not saved"), "walkthroughs: a failed save says so plainly");

if (failures > 0) {
  console.error("check-temp-walkthroughs: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-temp-walkthroughs: OK");
