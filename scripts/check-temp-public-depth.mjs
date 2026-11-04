// Guard for the public temp pages verification pass (D-WT-56:
// /temp/apply, /temp/book, and /temp/book/success — the
// success page is covered explicitly per the queue row).
// Verified: both forms pin the agency from the link (rates
// shown = agency that receives the submission), the apply
// form gates on background-check consent + drug-policy
// acknowledgment and records when the disclosure was shown,
// and it closes with the no-SSN/banking honesty line. The
// success page's two factual claims are pinned AS FOUND —
// they are flagged as decisions D1/D2 in the PR (the page
// cannot verify a payment, and "background-checked" reaches
// back to the D-WT-54 D1 screening fact); customer-facing
// claim wording is Wendy's to change, never this pass's.
import { readFileSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

const apply = readFileSync("app/temp/apply/page.js", "utf8");
const book = readFileSync("app/temp/book/page.js", "utf8");
const success = readFileSync("app/temp/book/success/page.js", "utf8");

// Apply: consent gates + disclosure record + honesty line.
check(apply.includes("You must authorize the background check to apply."), "apply: bg consent gates submission");
check(apply.includes("Please acknowledge the drug-testing policy."), "apply: drug-policy ack gates submission");
check(apply.includes("bgDisclosureShownAt: disclosureShownAt"), "apply: disclosure-shown time is recorded with the application");
check(apply.includes("We never ask for your Social Security number"), "apply: no-SSN/banking honesty line present");
check(apply.includes("record does not automatically disqualify you"), "apply: disclosure states individual review");
check(apply.includes("companyId: agencyId || undefined"), "apply: submission pinned to the linked agency");
check(apply.includes("check your"), "apply: done state sets the spam-folder expectation (added by this pass)");

// Book: agency pinning + estimate honesty.
check(book.includes("companyId: agencyId || undefined"), "book: booking pinned to the linked agency");
check(book.includes("Final total confirmed at checkout."), "book: estimate labeled as estimate, final at checkout");
check(book.includes("We can't open that booking link"), "book: bad agency link gets its own honest state");

// Success: the two claims pinned AS FOUND (decisions D1/D2),
// plus this pass's claim-free contact line.
check(success.includes("Payment received."), "success: payment claim AS FOUND — see decision D1");
check(success.includes("background-checked cleaners"), "success: screening claim AS FOUND — see decision D2 + D-WT-54 D1");
check(success.includes("Reply to your confirmation email"), "success: contact path present (added by this pass)");

if (failures > 0) {
  console.error("check-temp-public-depth: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-temp-public-depth: OK");
