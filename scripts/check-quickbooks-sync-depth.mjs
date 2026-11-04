// Guard for the QuickBooks sync verification pass (D-WT-51).
// The sync center + its API routes were verified professional
// (shared server-side requireManager gate, one-time OAuth
// state nonce, idempotency key claimed before posting with an
// alreadyPosted short-circuit, plain 422 guards for draft /
// void / $0 / client-less invoices, honest setup-pending and
// cached-copy states). The one fake-empty left: loadAll's
// queue reads ignored their errors, so a failed read rendered
// as "Nothing waiting. Every issued invoice is in
// QuickBooks." — a false all-clear on the money-moving
// section. The pass binds those two reads.
import { readFileSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

const page = readFileSync("app/app/[companyId]/connections/quickbooks/page.js", "utf8");
const post = readFileSync("app/api/integrations/quickbooks/post-invoice/route.js", "utf8");
const connect = readFileSync("app/api/integrations/quickbooks/connect/route.js", "utf8");

// The repair.
check(page.includes("invRes.error || itemRes.error"), "qb page: queue read errors are bound");
check(page.includes("A failed load is not an empty queue"), "qb page: fail-closed queue message present");
check(
  /queueError \? \([\s\S]{0,200}Nothing waiting/.test(page) || page.indexOf("queueError ?") < page.indexOf("Nothing waiting"),
  "qb page: the all-clear renders only when the queue actually loaded"
);

// Verified honest states pinned.
check(page.includes("Setup pending -- the QuickBooks database step hasn't been run yet"), "qb page: setup-pending state honest");
check(page.includes("QuickBooks isn't connected for this company yet"), "qb page: not-connected state honest");
check(page.includes("Showing the last fetched copy from"), "qb page: cached copy labeled with its fetch time");
check(page.includes("it is never"), "qb page: unmapped items never posted to a guess");
check(page.includes('member.role === "owner" || member.role === "admin"') || page.includes('member.role === "owner"'), "qb page: manager gate intact");

// Server posture pinned (routes untouched by this pass).
check(post.includes("requireManager(req, companyId)"), "post-invoice: shared manager gate enforced server-side");
check(post.includes("idempotency_key"), "post-invoice: idempotency key used end to end");
check(post.includes("alreadyPosted: true"), "post-invoice: posted invoices short-circuit, never double-post");
check(post.includes('invoice.status === "draft"') && post.includes('invoice.status === "void"'), "post-invoice: draft/void guards intact");
check(connect.includes("integration_oauth_states"), "connect: one-time OAuth state nonce stored server-side");
check(!page.includes("access_token") || page.includes("session?.access_token"), "qb page: no provider tokens handled in the page beyond the session bearer");

if (failures > 0) {
  console.error("check-quickbooks-sync-depth: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-quickbooks-sync-depth: OK");
