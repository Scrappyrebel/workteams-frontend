import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Profitability manual entries (migration 066) invariants. Manual revenue
// and expense entries are owner/admin money: they must be correctable
// (edit), removable only by void-with-reason (never hard delete), and
// every change must land in the append-only history table. Location-less
// money must never silently drop out of the Profitability totals.

const sql = read("supabase/066_profitability_entry_corrections.sql");
const sqlLower = sql.toLowerCase();
const page = read("app/app/[companyId]/profitability/page.js");

test("Migration 066 adds actor/void columns to both entry tables", () => {
  for (const t of ["revenue_entries", "expense_entries"]) {
    assert.ok(sqlLower.includes(`alter table public.${t}`), `migration must alter public.${t}`);
  }
  for (const col of ["created_by", "voided_at", "voided_by", "void_reason", "updated_at", "updated_by"]) {
    assert.ok(sqlLower.includes(`add column if not exists ${col}`), `migration must add ${col}`);
  }
});

test("Migration 066 creates the append-only history table, read-only for clients", () => {
  assert.ok(sqlLower.includes("create table if not exists public.profitability_entry_history"));
  assert.ok(sqlLower.includes("alter table public.profitability_entry_history enable row level security"));
  assert.ok(sqlLower.includes("grant select on public.profitability_entry_history to authenticated"));
  assert.ok(sqlLower.includes("grant all on public.profitability_entry_history to service_role"));
  assert.ok(sqlLower.includes("revoke insert, update, delete on public.profitability_entry_history from authenticated, anon"));
});

test("Migration 066 guard rejects deletes and unrecorded voids", () => {
  assert.ok(sql.includes("Profitability entries cannot be deleted. Void with a recorded reason."));
  assert.ok(sql.includes("Voided entries cannot be changed"));
  assert.ok(sql.includes("workteams_guard_profitability_entry"));
  assert.ok(sql.includes("workteams_capture_profitability_entry_history"));
  for (const fn of ["workteams_guard_profitability_entry", "workteams_capture_profitability_entry_history"]) {
    assert.ok(
      sqlLower.includes(`revoke all on function public.${fn}() from public, anon, authenticated`),
      `${fn} must not be callable by clients`
    );
  }
});

test("Profitability page lists entries, edits, voids, and excludes voided from totals", () => {
  assert.ok(page.includes("EntriesList"), "page must list manual entries");
  assert.ok(page.includes("async function saveEdit()"), "page must support correcting an entry");
  assert.ok(page.includes("async function voidEntry(entry)"), "page must support void-with-reason");
  assert.ok(page.includes("if (r.voided_at) continue;"), "voided revenue must be excluded from totals");
  assert.ok(page.includes("if (e.voided_at) continue;"), "voided expenses must be excluded from totals");
  assert.ok(!page.includes('.from("revenue_entries").delete'), "page must never hard-delete revenue entries");
  assert.ok(!page.includes('.from("expense_entries").delete'), "page must never hard-delete expense entries");
});

test("Profitability page never drops location-less money", () => {
  assert.ok(page.includes('"__unallocated"'), "page must render a No location bucket row");
  assert.ok(page.includes("unallocatedParts"), "bucket must show visible counts");
});
