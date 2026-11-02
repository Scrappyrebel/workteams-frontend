// QuickBooks data-list disclosure invariant (parity sibling of WF D-WFF-14).
// The QuickBooks sync page's data lists are fetched with a hard cap
// (app/api/integrations/quickbooks/data/route.js: maxresults 50 per type).
// The page must SAY SO — a bookkeeper must never read a capped list as the
// whole set of books. If the cap changes in the route, this guard fails
// until the on-page disclosure is updated to match.
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("app/app/[companyId]/connections/quickbooks/page.js", "utf8");
const route = fs.readFileSync("app/api/integrations/quickbooks/data/route.js", "utf8");

assert.ok(
  route.includes("maxresults 50"),
  "the QuickBooks data route must keep the 50-record fetch cap this disclosure describes"
);
assert.ok(
  page.includes("Each list shows the 50 most recent records from QuickBooks."),
  "the QuickBooks data section must disclose that each list shows the 50 most recent records"
);

console.log("PASS: QuickBooks data lists disclose their 50-record window, pinned to the route cap.");
