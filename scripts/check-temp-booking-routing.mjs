import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// The public temp booking/application flow must land on ONE explicit
// company. The defect this pins: resolving the agency with
// .eq("enabled", true).limit(1) ("first enabled row wins"), which routes
// bookings and their Stripe payments to the wrong company as soon as a
// second agency enables temp staffing.

const ROUTES = [
  "app/api/temp/book/route.js",
  "app/api/temp/config/route.js",
  "app/api/temp/apply/route.js",
];

test("Public temp routes resolve their agency through lib/temp-agency, never by first enabled row", () => {
  for (const p of ROUTES) {
    const src = read(p);
    assert.ok(src.includes("resolveTempAgencyCompanyId"), `${p} must resolve via lib/temp-agency`);
    assert.ok(src.includes("lib/temp-agency"), `${p} must import the shared resolver`);
    assert.ok(
      !src.includes('.eq("enabled", true)'),
      `${p} must not filter temp_agency_config by enabled directly (first-enabled-row routing)`
    );
    assert.ok(
      !/temp_agency_config[\s\S]{0,200}?\.limit\(1\)/.test(src),
      `${p} must not take .limit(1) of temp_agency_config`
    );
  }
  const lib = read("lib/temp-agency.js");
  assert.ok(lib.includes("rows.length > 1"), "resolver must fail closed when more than one agency is enabled and no agency is named");
  assert.ok(lib.includes('"ambiguous"'), "resolver must report the ambiguous case explicitly");
  assert.ok(lib.includes('.eq("company_id", wanted)'), "resolver must look a named agency up by company_id");
});

test("Booking pins the company end-to-end: page -> POST -> checkout metadata -> verified webhook", () => {
  const book = read("app/api/temp/book/route.js");
  assert.ok(book.includes("company_id: companyId"), "booking row must be written for the resolved company");
  assert.ok(
    book.includes("metadata: { temp_job_request_id: job.id, company_id: companyId }"),
    "checkout session must carry the resolved company in metadata"
  );
  const bookPage = read("app/temp/book/page.js");
  assert.ok(bookPage.includes("companyId: agencyId"), "booking page must send the resolved agencyId with the POST");
  assert.ok(bookPage.includes('get("agency")'), "booking page must read its agency from the link");

  const hook = read("app/api/stripe/webhook/route.js");
  assert.ok(
    hook.includes("session.metadata.company_id !== job.company_id"),
    "webhook must refuse to credit when the session's company is not the booking's company"
  );
  assert.ok(
    hook.includes("job.stripe_checkout_session_id !== session.id"),
    "webhook must refuse to credit a session that is not the one recorded on the booking"
  );
  assert.ok(
    hook.includes("session.amount_total !== job.quoted_cents"),
    "webhook must refuse to credit when the amount paid differs from the quoted cents"
  );
  assert.ok(hook.includes("NOT marked paid"), "webhook must log verification failures loudly");
});

test("Temp booking routing guard runs in prebuild", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.scripts.prebuild.includes("check-temp-booking-routing.mjs"));
});

// ---- Scripted two-config scenario against the real resolver ----
// lib/temp-agency.js is dependency-free ESM; import it from its source so
// this scenario exercises the exact code the routes run.
const libSource = read("lib/temp-agency.js");
const { resolveTempAgencyCompanyId } = await import(
  "data:text/javascript," + encodeURIComponent(libSource)
);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C_DISABLED = "33333333-3333-4333-8333-333333333333";
const UNKNOWN = "99999999-9999-4999-8999-999999999999";

// Minimal supabase-js-shaped stub: from().select().eq()... with
// maybeSingle() and thenable list results, over an in-memory config set.
function stubDb(rows) {
  return {
    from() {
      const filters = [];
      const q = {
        select() { return q; },
        eq(k, v) { filters.push([k, v]); return q; },
        maybeSingle() {
          const m = rows.filter((r) => filters.every(([k, v]) => r[k] === v));
          return Promise.resolve({ data: m[0] ?? null, error: null });
        },
        then(res, rej) {
          const m = rows.filter((r) => filters.every(([k, v]) => r[k] === v));
          return Promise.resolve({ data: m, error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}

const twoEnabled = stubDb([
  { company_id: A, enabled: true },
  { company_id: B, enabled: true },
  { company_id: C_DISABLED, enabled: false },
]);

test("Two enabled agencies: each named booking resolves its OWN company", async () => {
  const ra = await resolveTempAgencyCompanyId(twoEnabled, A);
  assert.equal(ra.ok, true); assert.equal(ra.companyId, A); assert.equal(ra.pinned, true);
  const rb = await resolveTempAgencyCompanyId(twoEnabled, B);
  assert.equal(rb.ok, true); assert.equal(rb.companyId, B); assert.equal(rb.pinned, true);
});

test("Two enabled agencies: an unnamed booking fails closed instead of guessing", async () => {
  const r = await resolveTempAgencyCompanyId(twoEnabled, undefined);
  assert.equal(r.ok, false);
  assert.equal(r.code, "ambiguous");
});

test("Unknown, disabled, or malformed agency ids fail closed", async () => {
  const unknown = await resolveTempAgencyCompanyId(twoEnabled, UNKNOWN);
  assert.equal(unknown.ok, false); assert.equal(unknown.code, "agency_inactive");
  const disabled = await resolveTempAgencyCompanyId(twoEnabled, C_DISABLED);
  assert.equal(disabled.ok, false); assert.equal(disabled.code, "agency_inactive");
  const malformed = await resolveTempAgencyCompanyId(twoEnabled, "not-a-company");
  assert.equal(malformed.ok, false); assert.equal(malformed.status, 400);
});

test("Single enabled agency: unnamed legacy links resolve to it, exactly as before", async () => {
  const oneEnabled = stubDb([
    { company_id: A, enabled: true },
    { company_id: C_DISABLED, enabled: false },
  ]);
  const r = await resolveTempAgencyCompanyId(oneEnabled, null);
  assert.equal(r.ok, true); assert.equal(r.companyId, A); assert.equal(r.pinned, false);
  const none = await resolveTempAgencyCompanyId(stubDb([]), null);
  assert.equal(none.ok, false); assert.equal(none.code, "unavailable");
});
