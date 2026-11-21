// In-app billing (Wendy, 2026-11-06): customers change plans AND
// payment information inside the app's own billing section — never
// sent off-site to Stripe or anywhere else to manage billing. Her
// reasoning: she drops companies that make her chase down where to
// pay. Stripe still processes behind the scenes; the customer never
// leaves the app.
//
// The build pinned here:
//   * GET  /api/stripe/billing          — owner-only summary: status,
//     card on file, next charge.
//   * POST /api/stripe/change-plan      — owner-only subscription
//     price switch with prorations, tier written back to companies.
//   * POST /api/stripe/setup-intent     — owner-only SetupIntent.
//   * POST /api/stripe/set-payment-method — owner-only default card.
//   * The Plans page carries the billing section + switch buttons +
//     the embedded Elements card form, and NO LONGER routes anyone
//     to the Stripe portal. (First purchase still uses hosted
//     checkout from this page — that is buying, not managing.)
//   * Card numbers never touch our server: the form is Stripe
//     Elements (components/BillingCardForm.js), confirmed in the
//     browser with the SetupIntent secret.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const exists = (p) => existsSync(new URL(`../${p}`, import.meta.url));

const OWNER_GATE = 'member.role !== "owner"';

test("billing routes exist and are owner-gated", () => {
  for (const route of ["billing", "change-plan", "setup-intent", "set-payment-method"]) {
    const p = `app/api/stripe/${route}/route.js`;
    assert.ok(exists(p), `${p} exists`);
    const src = read(p);
    assert.ok(src.includes(OWNER_GATE), `${route}: owner gate`);
    assert.ok(src.includes("stripe_customer_id"), `${route}: reads the Stripe ids server-side`);
    assert.ok(src.includes("STRIPE_SECRET_KEY"), `${route}: secret key stays server-side`);
  }
});

test("billing summary reads the subscription, its card and next charge", () => {
  const src = read("app/api/stripe/billing/route.js");
  for (const needle of [
    "stripe.subscriptions.retrieve",
    'expand: ["default_payment_method"]',
    "invoice_settings?.default_payment_method",
    "nextCharge",
    "cardSummary(pm)",
  ]) {
    assert.ok(src.includes(needle), `billing keeps: ${needle}`);
  }
});

test("change-plan switches the price with prorations and writes the tier back", () => {
  const src = read("app/api/stripe/change-plan/route.js");
  for (const needle of [
    'from("product_tiers")',
    "stripe.subscriptions.update",
    'proration_behavior: "create_prorations"',
    '.update({ tier })',
    "alreadyOnPlan",
  ]) {
    assert.ok(src.includes(needle), `change-plan keeps: ${needle}`);
  }
});

test("card update is a SetupIntent confirmed in the browser, then set as default", () => {
  const setup = read("app/api/stripe/setup-intent/route.js");
  assert.ok(setup.includes("stripe.setupIntents.create"), "setup-intent creates a SetupIntent");
  assert.ok(setup.includes('usage: "off_session"'), "setup-intent is for subscription charges");
  const set = read("app/api/stripe/set-payment-method/route.js");
  for (const needle of [
    "stripe.paymentMethods.attach",
    "invoice_settings: { default_payment_method: paymentMethodId }",
    "default_payment_method: paymentMethodId",
  ]) {
    assert.ok(set.includes(needle), `set-payment-method keeps: ${needle}`);
  }
  const form = read("components/BillingCardForm.js");
  for (const needle of [
    "loadStripe",
    'elements.create("card"',
    "confirmCardSetup",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "/api/stripe/setup-intent",
    "/api/stripe/set-payment-method",
  ]) {
    assert.ok(form.includes(needle), `card form keeps: ${needle}`);
  }
  // The publishable key is the only Stripe key a browser file may name.
  assert.ok(!form.includes("STRIPE_SECRET_KEY"), "no secret key in the browser form");
});

test("plans page manages billing in-app and never routes to the portal", () => {
  const page = read("app/app/[companyId]/plans/page.js");
  for (const needle of [
    "BillingCardForm",
    "/api/stripe/billing?companyId=",
    "/api/stripe/change-plan",
    "Switch to ${t.name}",
    "Tap again to confirm switch",
    "Card on file",
    "Update card",
    "managed right here on this page",
  ]) {
    assert.ok(page.includes(needle), `plans page keeps: ${needle}`);
  }
  assert.ok(!page.includes("/api/stripe/portal"), "plans page never calls the portal route");
  assert.ok(!page.includes("Manage billing"), "no off-site Manage billing button remains");
});
