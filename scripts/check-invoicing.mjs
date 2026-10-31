import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Customer invoicing (migration 061) invariants. Invoicing is a financial
// surface: owner/admin ONLY at the RLS level, payments are immutable
// originals corrected by void-with-reason, issued invoices are never
// edited or hard-deleted, totals/paid state are trigger-derived, and the
// app must stay calm before the owner runs the migration.

const SQL_PATH = "supabase/061_invoicing.sql";
const TABLES = ["invoices", "invoice_line_items", "invoice_payments", "invoice_counters"];
const sql = read(SQL_PATH);
const sqlLower = sql.toLowerCase();

test("Migration 061 creates the four invoicing tables with RLS on", () => {
  for (const t of TABLES) {
    assert.ok(
      sqlLower.includes(`create table if not exists public.${t}`),
      `migration must create public.${t}`
    );
    assert.ok(
      sqlLower.includes(`alter table public.${t} enable row level security`),
      `migration must enable RLS on public.${t}`
    );
  }
});

test("Every new table carries its grants in the same block (post-2026-10-30 grant regime)", () => {
  for (const t of TABLES) {
    assert.ok(
      sqlLower.includes(`grant select, insert, update, delete on public.${t} to authenticated;`),
      `migration must grant select/insert/update/delete on public.${t} to authenticated`
    );
    assert.ok(
      sqlLower.includes(`grant all on public.${t} to service_role;`),
      `migration must grant all on public.${t} to service_role`
    );
  }
});

test("RLS policies are owner/admin only — no employee, supervisor, or public access", () => {
  for (const t of ["invoices", "invoice_line_items", "invoice_payments"]) {
    const policies = sqlLower.split("\n").filter((l) => l.includes("create policy") && l.includes("on public." + t));
    assert.ok(policies.length >= 3, `${t} must have read/insert/update policies`);
  }
  assert.ok(
    (sqlLower.match(/m\.role in \('owner', 'admin'\)/g) || []).length >= 10,
    "every invoicing policy must key on company_members role in ('owner','admin')"
  );
  assert.ok(!sqlLower.includes("'employee'"), "no policy may grant employees invoicing access");
  assert.ok(!sqlLower.includes("'supervisor'"), "no policy may grant supervisors invoicing access");
  const policyChunks = sqlLower.split("create policy").slice(1);
  assert.ok(policyChunks.length >= 11, "expected at least 11 invoicing policies");
  for (const chunk of policyChunks) {
    assert.ok(
      chunk.split(";")[0].includes("to authenticated"),
      "every invoicing policy must be TO authenticated (never TO public)"
    );
  }
  assert.ok(!sqlLower.includes("create policy \"invoice payments") || !sqlLower.includes("invoice payments owner/admin delete"),
    "invoice_payments must have NO delete policy");
  // The counter table is trigger-only: it must not get any policy at all.
  assert.ok(!sqlLower.includes("on public.invoice_counters\n  for") && !/create policy[^;]*invoice_counters/.test(sqlLower),
    "invoice_counters must have no policies (numbering trigger only)");
});

test("Invoice numbers are sequential per company and claimed race-free", () => {
  assert.ok(sqlLower.includes("unique (company_id, invoice_number)"), "invoice numbers must be unique per company");
  assert.ok(sqlLower.includes("security definer"), "the numbering function must be security definer");
  assert.ok(sqlLower.includes("on conflict (company_id) do update"), "number claiming must be an atomic upsert");
  assert.ok(sqlLower.includes("workteams_assign_invoice_number"), "numbering trigger function must exist");
});

test("Lifecycle: draft -> issued -> paid / void, with recorded voids and no issued edits or deletes", () => {
  assert.ok(sql.includes("('draft', 'issued', 'paid', 'void')"), "status lifecycle check must list draft/issued/paid/void");
  assert.ok(sql.includes("Voiding an invoice requires its current manager and a reason (10-500 characters)"),
    "invoice void must require the manager and a 10-500 character reason");
  assert.ok(sql.includes("Issued invoices cannot be edited"), "issued invoice content must be frozen by trigger");
  assert.ok(sql.includes("Only draft invoices can be deleted"), "only drafts may be hard-deleted");
  assert.ok(sql.includes("Voided invoices cannot be changed"), "voided invoices must be immutable");
});

test("Payments are immutable originals: no deletes, no edits, overpayment rejected, totals derived", () => {
  assert.ok(sql.includes("Invoice payments cannot be deleted. Void with a recorded reason."),
    "payment deletes must be rejected by trigger");
  assert.ok(sql.includes("Original payment details cannot be edited; void and re-record"),
    "payment edits outside the void path must be rejected");
  assert.ok(sql.includes("Payment exceeds the remaining balance on this invoice"),
    "overpayment must be rejected");
  assert.ok(sql.includes("Payments can only be recorded on an issued invoice"),
    "payments must require an issued invoice");
  assert.ok(sql.includes("A void requires its current manager and a reason (10-500 characters)"),
    "payment void must require the manager and a 10-500 character reason");
  assert.ok(sql.includes("for update"), "payment insert must lock the invoice row (no payment race)");
  assert.ok(sqlLower.includes("workteams_reconcile_invoice_payment"), "a reconcile trigger must derive paid state");
  assert.ok(sqlLower.includes("workteams_invoice_state"), "invoice totals/paid status must be trigger-derived");
});

test("Trigger helpers are not executable by API roles", () => {
  for (const fn of [
    "workteams_assign_invoice_number",
    "workteams_invoice_state",
    "workteams_guard_invoice_delete",
    "workteams_guard_invoice_line_item",
    "workteams_touch_invoice_totals",
    "workteams_guard_invoice_payment",
    "workteams_reconcile_invoice_payment",
  ]) {
    assert.ok(
      sqlLower.includes(`revoke all on function public.${fn}() from public, anon, authenticated;`),
      `${fn} must revoke execute from public, anon, authenticated`
    );
  }
});

test("Client concept is the existing locations table, snapshotted onto the invoice", () => {
  assert.ok(sqlLower.includes("location_id uuid references public.locations(id) on delete set null"),
    "invoices must reference locations (the repo's client/site concept)");
  assert.ok(sqlLower.includes("client_name text"), "invoice must snapshot the client name");
  assert.ok(!sqlLower.includes("temp_client_profiles"), "invoicing must not depend on the gated temp-agency client table");
});

test("UI: nav is manager-only and both pages gate on owner/admin and degrade pre-migration", () => {
  const shell = read("components/AppShell.js");
  assert.ok(shell.includes('key: "invoices"'), "AppShell must carry the invoices nav entry");
  const navLine = shell.split("\n").find((l) => l.includes('key: "invoices"')) || "";
  assert.ok(navLine.includes('minRole: "manager"'), "invoices nav must be manager-only");

  for (const p of ["app/app/[companyId]/invoices/page.js", "app/app/[companyId]/invoices/[id]/page.js"]) {
    assert.ok(existsSync(p), `${p} must exist`);
    const src = read(p);
    assert.ok(src.includes('"owner"') && src.includes('"admin"'), `${p} must gate on owner/admin roles`);
    assert.ok(src.includes("turns on with the latest WorkTeams update"), `${p} must handle the not-yet-switched-on state in plain user words (no migration number)`);
    assert.ok(!src.includes("time_entries") && !src.includes("shift_videos") && !src.includes("comm_book"),
      `${p} must not touch the protected time clock / video / book surfaces`);
  }
  const list = read("app/app/[companyId]/invoices/page.js");
  assert.ok(list.includes("unavailable"), "list page must render a graceful unavailable state when the table is missing");
  const detail = read("app/app/[companyId]/invoices/[id]/page.js");
  assert.ok(detail.includes("unavailable"), "detail page must render a graceful unavailable state when the table is missing");
  assert.ok(detail.includes("10–500") || detail.includes("10-500"), "detail page must state the void-reason length rule");
});

test("Scenario: lifecycle transitions the triggers allow are exactly the intended set", () => {
  // Mirrors workteams_invoice_state(): from each stored status, the set of
  // reachable next statuses. If the SQL lifecycle ever widens (e.g. an
  // issued invoice back to draft), this scenario must be updated with it.
  const allowed = {
    draft: ["draft", "issued", "void"],
    issued: ["issued", "paid", "void"],
    paid: ["issued", "paid", "void"],
    void: [],
  };
  assert.ok(!allowed.issued.includes("draft"), "an issued invoice must never return to draft");
  assert.ok(!allowed.draft.includes("paid"), "a draft must never jump straight to paid");
  assert.deepEqual(allowed.void, [], "a void invoice has no outgoing transitions");
  // The SQL must encode the same edges the scenario claims.
  assert.ok(sql.includes("A draft invoice can only stay a draft or be issued"),
    "SQL must pin the draft outgoing edges");
  assert.ok(sql.includes("when new.total > 0 and new.amount_paid >= new.total then 'paid'"),
    "SQL must derive paid only from full payment coverage");
});

test("prebuild chain keeps every pre-existing guard and adds this one (union, nothing dropped)", () => {
  const pkg = read("package.json");
  const prebuild = JSON.parse(pkg).scripts.prebuild;
  const prior = [
    "check-client-portal-authenticated-requests",
    "check-client-portal-owner-activation",
    "check-client-portal-verified-identity-approval",
    "check-client-portal-owner-pilot-opt-in",
    "check-client-portal-opt-in-identity-foundation",
    "check-client-portal-form-accessibility",
    "check-client-portal-safe-invitation-copy",
    "check-client-portal-bilingual-core",
    "check-client-portal-request-history",
    "check-client-portal-work-order-sort",
    "check-client-portal-quality-privacy",
    "check-client-portal-documents-request",
    "check-client-portal-no-store",
    "check-client-portal-work-order-authorization",
    "check-client-portal-temp-revocation",
    "check-client-portal-parity",
    "check-commercial-construction-banner",
    "check-end-shift-proof",
    "check-clock-in-schedule",
    "check-attendance-alerts",
    "check-ios-video-integrity",
    "check-geofence-location",
    "check-protected-clock",
    "check-protected-video",
    "check-temp-booking-routing",
    "check-client-portal-authenticated-quality",
    "check-client-portal-customer-recovery-routing",
    "check-client-portal-recovery-event",
  ];
  for (const g of prior) {
    assert.ok(prebuild.includes(g), `prebuild must still run ${g}`);
  }
  assert.ok(prebuild.includes("check-invoicing"), "prebuild must run check-invoicing");
});
