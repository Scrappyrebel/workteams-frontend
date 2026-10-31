import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Per-location money rollup (migration 077, audit item A9) invariants:
// * WorkTeams' billing truth was split across two surfaces: the
//   Profitability page (accepted bids + manual entries per location)
//   and the Invoices list (per-invoice balances). No single view
//   combined estimated / invoiced / credited / paid / balance due per
//   location the way Workforce's Dept 5 rollup (its migration 262)
//   does per client. In WorkTeams, locations ARE the clients.
// * 077 adds ONE read-only security-definer function and nothing
//   else: no new tables, no writes to any existing table.
// * Definitions reuse the app's existing math, never parallel math:
//   Estimated = accepted bids valued exactly as Profitability values
//   them (pricing-mode aware, file 004); Invoiced = issued invoices
//   only (status issued/paid; drafts unbilled, voids excluded);
//   Paid = invoices.amount_paid, which 061 derives by trigger from
//   the active invoice_payments rows; Balance = invoiced - credits
//   - paid per row.
// * Credits is a defined 0: WorkTeams has no credit-note mechanism
//   (issued invoices are corrected by void + re-issue). The column
//   exists so the identity reads as in the sister app; nothing is
//   invented to fill it.
// * Money with no location returns as ONE location_id-null row --
//   the Profitability page's "No location" bucket -- never spread
//   across real locations, and the page totals are the plain sum of
//   the displayed rows so the total reconciles by construction.
// * Owner/admin only, enforced INSIDE the function (061 posture),
//   not just hidden in the UI. Fail-soft page: until 077 runs, the
//   page shows its setup-pending state and nothing else changes.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in any changed file.

const SQL_PATH = "supabase/077_location_money_rollup.sql";
const PAGE = "app/app/[companyId]/location-money/page.js";
const SHELL = "components/AppShell.js";

test("migration 077 is a single read function, owner/admin enforced inside", () => {
  assert.ok(existsSync(SQL_PATH), "migration 077 exists");
  const sql = read(SQL_PATH);
  for (const needle of [
    "BEGIN;",
    "COMMIT;",
    "create or replace function public.workteams_location_money_rollup(p_company_id uuid)",
    "security definer",
    "m.role in ('owner', 'admin')",
    "raise exception 'Owner or admin access required'",
    "grant execute on function public.workteams_location_money_rollup(uuid)",
    "b.status = 'accepted'",
    "i.status in ('issued', 'paid')",
    "sum(i.amount_paid)",
    "sum(i.total - i.amount_paid)",
  ]) {
    assert.ok(sql.includes(needle), `077 contains: ${needle}`);
  }
  // Read-only: the migration creates no table and writes to nothing.
  assert.ok(!/create table/i.test(sql), "077 creates no table");
  assert.ok(!/insert into/i.test(sql), "077 inserts nothing");
  assert.ok(!/update public\./i.test(sql), "077 updates no table");
  assert.ok(!/delete from/i.test(sql), "077 deletes nothing");
});

test("estimated is priced exactly as the Profitability page prices accepted bids", () => {
  const sql = read(SQL_PATH);
  for (const needle of [
    "b.pricing_mode = 'hourly'",
    "coalesce(b.hours, 0) * coalesce(b.hourly_rate, 0)",
    "b.pricing_mode = 'sqft'",
    "coalesce(b.square_footage, 0) * coalesce(b.rate_per_sqft, 0)",
    "sum(bi.quantity * bi.unit_price)",
  ]) {
    assert.ok(sql.includes(needle), `077 pricing contains: ${needle}`);
  }
  // Credits is a defined zero with its reason on the record, not a
  // silent omission.
  assert.ok(sql.includes("0::numeric"), "credits is an explicit 0");
  assert.ok(sql.includes("NO credit-note mechanism"), "credits reason documented");
});

test("the page reads only through the function and degrades honestly", () => {
  const page = read(PAGE);
  assert.ok(page.includes('rpc("workteams_location_money_rollup"'), "page calls the rollup function");
  assert.ok(page.includes("turns on with the latest WorkTeams update"), "setup-pending copy names the feature state in plain user words (no migration number)");
  assert.ok(page.includes('"No location"'), "no-location bucket is labeled");
  assert.ok(page.includes("unallocated"), "no-location row is flagged for its note");
  // Read-only page: no writes of any kind.
  for (const banned of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert.ok(!page.includes(banned), `page performs no writes (${banned})`);
  }
  // The page asks the database for no table directly: the function is
  // the only door, so the owner/admin check inside it cannot be
  // bypassed by a crafted page-level query.
  assert.ok(!page.includes('.from("invoices")'), "page does not read invoices directly");
  assert.ok(!page.includes('.from("bids")'), "page does not read bids directly");
});

test("nav gains the page for managers and up, nothing else moves", () => {
  const shell = read(SHELL);
  assert.ok(
    shell.includes('{ key: "locationmoney", label: "Money by Location"'),
    "AppShell nav has the Money by Location entry"
  );
  assert.ok(shell.includes("`/app/${c}/location-money`"), "nav href points at the new page");
  assert.ok(shell.includes('{ key: "invoices", label: "Invoices"'), "existing Invoices entry untouched");
  assert.ok(shell.includes('{ key: "profitability", label: "Profitability"'), "existing Profitability entry untouched");
});

test("protected areas are untouched by this build", () => {
  for (const p of [SQL_PATH, PAGE]) {
    const src = read(p);
    for (const banned of ["time_entries", "shift-videos", "comm-book", "Communication Book"]) {
      assert.ok(!src.includes(banned), `${p} does not touch ${banned}`);
    }
  }
});
