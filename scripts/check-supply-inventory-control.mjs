import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Supply inventory control (migration 078) invariants:
// * Supplies (003) were a single silently-editable list. Migration 078
//   adds the WorkTeams-scale inventory system on the SAME surface:
//   an append-only movement log, check-outs (who has what), a condition
//   state with an append-only event history (replacement is its own
//   event, never an overwrite), and restock requests any member can
//   file and managers can close.
// * Security mirrors the supplies table itself (024): every new table is
//   company-scoped with the same 'pro' tier gate supplies carries;
//   reads are member-wide (who can already read supplies); condition
//   events and check-outs are owner/admin writes; a movement's actor is
//   pinned to the caller's OWN company_members row (the 073 own-row
//   pattern), and a restock request can only be filed for oneself.
// * No DELETE grant or policy exists on any new table: logs, custody
//   history and requests are kept, never erased through the app.
// * No new table carries a cost column: who can see costs (managers, in
//   the UI) is not widened. The member view loads supplies WITHOUT the
//   cost column and never renders one.
// * Everything is fail-soft: until 078 runs, the page's probes fail
//   quietly, invReady stays false, and the page behaves exactly as the
//   plain supplies list always has.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in any changed file.

const SQL_PATH = "supabase/078_supply_inventory_control.sql";
const PAGE = "app/app/[companyId]/supplies/page.js";
const SHELL = "components/AppShell.js";

test("migration 078 adds the condition column and the four inventory tables", () => {
  assert.ok(existsSync(SQL_PATH), "migration 078 exists");
  const sql = read(SQL_PATH);
  for (const needle of [
    "BEGIN;",
    "COMMIT;",
    "add column if not exists condition text not null default 'good'",
    "'good', 'needs_repair', 'broken', 'replaced'",
    "create table if not exists public.supply_movements",
    "create table if not exists public.supply_assignments",
    "create table if not exists public.supply_condition_events",
    "create table if not exists public.supply_restock_requests",
    "movement_type in ('in', 'out', 'adjustment')",
    "event_type in ('condition_change', 'replacement')",
    "status in ('open', 'handled', 'dismissed')",
    "replacement_supply_id uuid references public.supplies(id) on delete set null",
    "supply_id uuid references public.supplies(id) on delete set null",
    "assigned_to_name text",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
});

test("migration 078 grants are in-block, RLS is company-scoped, nothing is deletable", () => {
  const sql = read(SQL_PATH);
  for (const needle of [
    "grant select, insert on public.supply_movements to authenticated",
    "grant select, insert on public.supply_condition_events to authenticated",
    "grant select, insert, update on public.supply_assignments to authenticated",
    "grant select, insert, update on public.supply_restock_requests to authenticated",
    "grant all on public.supply_movements to service_role",
    "grant all on public.supply_assignments to service_role",
    "grant all on public.supply_condition_events to service_role",
    "grant all on public.supply_restock_requests to service_role",
    "enable row level security",
    '"supply movements insert own"',
    "m.id = supply_movements.member_id",
    '"supply restock requests insert own"',
    "m.id = supply_restock_requests.requested_by_member_id",
    '"supply assignments insert if owner/admin"',
    '"supply condition events insert own admin"',
    "public.company_tier_meets(supply_movements.company_id, 'pro')",
    "public.company_tier_meets(supply_assignments.company_id, 'pro')",
    "public.company_tier_meets(supply_condition_events.company_id, 'pro')",
    "public.company_tier_meets(supply_restock_requests.company_id, 'pro')",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  assert.ok(
    !/grant[^;]*\bdelete\b/i.test(sql) && !/for delete/i.test(sql),
    "no delete grant or delete policy on any new table"
  );
  for (const table of ["supply_movements", "supply_assignments", "supply_condition_events", "supply_restock_requests"])
    assert.ok(!new RegExp(`create table[^;]*${table}[^;]*cost`, "i").test(sql), `${table} carries no cost column`);
  for (const banned of ["shift_videos", "communication_book", "time_entries"])
    assert.ok(!sql.includes(banned), `migration stays out of: ${banned}`);
});

test("supplies page records movements and wires all four pieces, fail-soft", () => {
  const page = read(PAGE);
  for (const needle of [
    "recordMovement",
    '.from("supply_movements")',
    '.from("supply_assignments")',
    '.from("supply_condition_events")',
    '.from("supply_restock_requests")',
    '.from("team_directory")',
    "invReady",
    "assigned_to_name",
    "replacement_supply_id",
    "return_condition",
    "Checked out to you",
  ]) assert.ok(page.includes(needle), `page contains: ${needle}`);
  // The existing manager behavior is intact: same gate, same form
  // fields, same adjust/delete actions.
  for (const needle of [
    'canUseWithRole(company?.effectiveTier || company?.tier, "supplies", member?.role)',
    'requireClockedIn(clockedIn, "adjust inventory")',
    'requireClockedIn(clockedIn, "remove a supply item")',
    "cost_per_unit",
  ]) assert.ok(page.includes(needle), `page keeps: ${needle}`);
  // The member view never renders a cost.
  const memberView = page.slice(
    page.indexOf("// ---- Member view"),
    page.indexOf("// ---- Manager view")
  );
  assert.ok(memberView.length > 0, "member view exists");
  assert.ok(!memberView.includes("cost_per_unit"), "member view renders no cost");
  for (const banned of ["shift_videos", "communication_book", "time_entries"])
    assert.ok(!page.includes(banned), `page stays out of: ${banned}`);
});

test("supplies nav is reachable by members (the page still gates by tier and role)", () => {
  const shell = read(SHELL);
  assert.ok(
    shell.includes('{ key: "supplies", label: "Supplies", href: (c) => `/app/${c}/supplies`, minRole: null }'),
    "supplies nav entry is member-visible"
  );
});
