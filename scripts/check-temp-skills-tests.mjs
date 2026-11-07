// Guard for the temp-service skills tests (test-to-place).
// Pins the honesty rules that make the records safe to show a
// client: the factory safety gate is universal, and a forklift
// record is a two-state record — an agency instruction pass is a
// pre-screen and must never read as a certification until the
// host's workplace evaluation is also on file.
import { readFileSync, existsSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

check(existsSync("lib/temp-tests.js"), "tests: library exists");
const lib = readFileSync("lib/temp-tests.js", "utf8");

// The factory safety gate: all three, required for manufacturing.
for (const key of ["factory-osha", "factory-hazcom", "factory-loto"]) {
  check(lib.includes(`key: "${key}"`), `tests: safety test present — ${key}`);
}
check(
  (lib.match(/safetyGate: true/g) || []).length >= 3,
  "tests: the three factory safety tests are flagged as the safety gate"
);
check(
  lib.includes('requiredIn: ["manufacturing"]'),
  "tests: safety gate is required for the manufacturing lane"
);

// Office gate + cleaning screening.
check(lib.includes('key: "office-excel"') && lib.includes('key: "office-word"'), "tests: office proficiency pair present");
check(lib.includes('key: "cleaning-screening"'), "tests: cleaning screening record present");

// Forklift two-state honesty.
check(lib.includes('key: "forklift-instruction"') && lib.includes('key: "forklift-host-eval"'), "tests: forklift has both states");
check(lib.includes("pre-screen only, NOT certified"), "tests: instruction-only state is labeled NOT certified");
check(
  lib.includes('instruction && hostEval') || lib.includes("records[\"forklift-instruction\"]"),
  "tests: certified requires both states"
);
check(lib.includes("clientTestSummary"), "tests: client-visible summary helper exists");

const page = readFileSync("app/app/[companyId]/temp/page.js", "utf8");
check(page.includes("laneGateStatus"), "tests: assignment path consults the lane gate");
check(page.includes("missing required tests"), "tests: a blocked assignment says which tests are missing");
check(page.includes('from "./SkillsTests"'), "tests: dashboard imports the panel");

check(existsSync("app/app/[companyId]/temp/SkillsTests.js"), "tests: panel exists");
const panel = readFileSync("app/app/[companyId]/temp/SkillsTests.js", "utf8");
check(panel.includes("What the client sees"), "tests: client-visible summary is shown for what it is");

// Table wiring (migration 096): temp_test_records is the system of
// record. The panel writes ONLY there; legacy tag-encoded results in
// temp_member_skills are still read and merged (latest wins), and the
// assignment gate evaluates the merged records.
check(lib.includes("testRecordsFromTableRows"), "tests: table-records parser exists");
check(lib.includes("mergeTestRecords"), "tests: cross-source merge exists");
check(
  panel.includes('.from("temp_test_records")') && panel.includes(".insert("),
  "tests: panel writes new results to temp_test_records"
);
check(
  !panel.includes('.from("temp_member_skills")'),
  "tests: panel no longer writes the legacy tag storage"
);
check(page.includes("testRecordsFromTableRows"), "tests: dashboard reads table records for the gate");
check(page.includes("testRecordsFor(app.member_id)"), "tests: assignment gate evaluates merged records");

if (failures > 0) {
  console.error("check-temp-skills-tests: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-temp-skills-tests: OK");
