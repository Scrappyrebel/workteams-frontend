// Guard for the Sales dashboard verification pass (D-WT-44).
// The page + /api/admin/sales route were verified professional
// (server-side product-owner gate with no hard-coded fallback,
// rate limit, honest 503 when Stripe is unconfigured, MRR math
// quantity- and interval-aware, and NO customer identities
// ever leaving the route). The gap was silent partial totals:
// the subscriptions read is one page of 100, so past 100
// actives the "exact" totals quietly undercounted, unmapped
// prices were invisible in the tier rows, and the figures
// carried no as-of time. The pass discloses all three.
import { readFileSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

const route = readFileSync("app/api/admin/sales/route.js", "utf8");
const page = readFileSync("app/app/[companyId]/sales/page.js", "utf8");

// Verified gate + privacy posture pinned.
check(route.includes("PRODUCT_OWNER_EMAIL is not configured"), "sales API: owner email has no hard-coded fallback");
check(route.includes("auth.getUser()"), "sales API: caller verified server-side from the bearer token");
check(route.includes('status: 403'), "sales API: non-owner gets 403");
check(route.includes("checkRateLimit"), "sales API: rate limit intact");
check(route.includes("Stripe is not connected yet."), "sales API: honest 503 when Stripe is unconfigured");
check(route.includes("No customer names or emails ever leave this route."), "sales API: no-PII contract stated");
check(!route.includes("customer_email") && !route.includes("customer_name"), "sales API: no customer identity fields are read");

// The honesty markers added by this pass.
check(route.includes("capped: subs.has_more === true"), "sales API: cap marker comes from Stripe has_more");
check(route.includes("generatedAt: new Date().toISOString()"), "sales API: as-of timestamp returned");
check(page.includes("Figures as of"), "sales page: as-of line renders");
check(page.includes("are a floor, not the full"), "sales page: capped totals disclosed as a floor");
check(page.includes("data.byTier?.unknown?.count > 0"), "sales page: unmapped-price items are disclosed");
check(page.includes("counted in the"), "sales page: unmapped items stated as counted in totals");

// MRR math pins (unchanged by this pass).
check(route.includes('price.recurring?.interval === "year" ? 1 / 12 : 1'), "sales API: yearly prices still normalized to monthly");
check(page.includes("isProductOwner()"), "sales page: client owner check intact (API remains the real gate)");

if (failures > 0) {
  console.error("check-sales-depth: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-sales-depth: OK");
