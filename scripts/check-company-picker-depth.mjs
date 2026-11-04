// Guard for the company picker depth pass (D-WT-10, app/app/page.js).
// The picker was verified sound in structure (membership-scoped
// read, invite-claim banner, wrong-company "Shift today" badge
// that can never fail the picker) but its memberships read
// IGNORED its error: a failed read looked exactly like "You're
// not on any team yet" and the create form invited a duplicate
// company. The pass binds the error (fail-closed, form hidden),
// and shows each company's subscription standing on its card
// using columns already inside the browser column grants.
import { readFileSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

const page = readFileSync("app/app/page.js", "utf8");

// The repaired read.
check(page.includes("error: membersErr"), "picker: memberships read binds its error");
check(page.includes("A failed load is not an empty list"), "picker: fail-closed load message present");
check(page.includes("setLoadError("), "picker: load error state is set");
check(
  /!loadError && memberships\.length === 0/.test(page),
  "picker: empty-state copy is suppressed on a failed load"
);
check(
  page.includes("{!loadError && (") && page.includes("<form onSubmit={createCompany}>"),
  "picker: create form is hidden on a failed load (no duplicate-company trap)"
);

// Standing visibility (columns inside the existing grants).
check(
  page.includes("companies(id, name, tier, subscription_status, is_complimentary)"),
  "picker: membership read selects the granted standing columns"
);
check(
  page.includes('subscription_status !== "active"'),
  "picker: non-active subscription warning renders conditionally"
);
check(page.includes("Complimentary company"), "picker: complimentary marker renders");

// Verified behavior pinned unchanged.
check(page.includes('.eq("user_id", u.id)'), "picker: read stays scoped to the signed-in user");
check(page.includes("linkMemberOnSignIn"), "picker: invite-claim on sign-in intact");
check(page.includes("Shift today"), "picker: wrong-company shift-today badge intact");
check(page.includes('tier: "starter"'), "picker: new companies still start on Starter");
check(page.includes('role: "owner"'), "picker: creator still becomes owner");

if (failures > 0) {
  console.error("check-company-picker-depth: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-company-picker-depth: OK");
