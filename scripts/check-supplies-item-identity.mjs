import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Supply item identity fields (migration 087) invariants:
// * The supplies item record (003 + 078) had name/category/quantity/
//   unit/reorder level/cost/notes/condition — no vendor, no SKU, no
//   location. Migration 087 adds exactly those three as additive
//   nullable columns on the SAME table: vendor and sku free text, and
//   location_id -> locations(id) on delete set null (the 003 pattern).
// * quantity_on_hand stays the item's ONE on-hand count: nothing here
//   builds per-location stock levels, and no movement / check-out /
//   condition / restock behaviour changes.
// * Writes are tolerant in both directions: before 087 runs the page
//   behaves exactly as today, and identity values a manager entered
//   are NEVER silently dropped — the save steps down to the original
//   payload only when nothing was entered, and otherwise says plainly
//   that the fields are not switched on yet.
// * Cost visibility is unchanged: the member view's select rungs never
//   include cost_per_unit and its card slice never renders a cost.
//   Vendor and SKU carry no money.
// * The delete flow is untouched (the existing native confirm stays).
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in any changed file.

const SQL_PATH = "supabase/087_supply_item_identity_fields.sql";
const PAGE = "app/app/[companyId]/supplies/page.js";
const LIB = "lib/supply-item-identity.js";

test("migration 087 adds vendor, sku and location_id to supplies, additively", () => {
  assert.ok(existsSync(SQL_PATH), "migration 087 exists");
  const sql = read(SQL_PATH);
  for (const needle of [
    "BEGIN;",
    "COMMIT;",
    "alter table public.supplies",
    "add column if not exists vendor text",
    "add column if not exists sku text",
    "add column if not exists location_id uuid references public.locations(id) on delete set null",
    "supplies.quantity_on_hand stays the item's single on-hand",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  // Additive only: no existing column, row or table is changed or removed.
  for (const banned of [
    "drop column",
    "drop table",
    "delete from",
    "update public.supplies",
    "alter column",
    "shift_videos",
    "communication_book",
    "time_entries",
  ]) assert.ok(!sql.toLowerCase().includes(banned), `migration stays out of: ${banned}`);
});

test("identity helpers behave on hand fixtures", async () => {
  const lib = await import("../lib/supply-item-identity.js");
  // Payload building: blanks become null, values are trimmed.
  assert.deepEqual(
    lib.buildIdentityPayload({ vendor: "  Acme Janitorial Supply ", sku: " GL-114 ", location_id: "loc-1" }),
    { vendor: "Acme Janitorial Supply", sku: "GL-114", location_id: "loc-1" }
  );
  assert.deepEqual(
    lib.buildIdentityPayload({ vendor: "", sku: "  ", location_id: "" }),
    { vendor: null, sku: null, location_id: null }
  );
  assert.equal(lib.identityValuesEntered({ vendor: "", sku: "", location_id: "" }), false);
  assert.equal(lib.identityValuesEntered({ vendor: "", sku: "X-1", location_id: "" }), true);
  assert.equal(lib.identityValuesEntered({ vendor: "", sku: "", location_id: "loc-9" }), true);
  // Missing-column detection: only the not-there-yet shapes step down.
  assert.equal(lib.isMissingIdentityColumnError({ code: "42703", message: "column supplies.vendor does not exist" }), true);
  assert.equal(lib.isMissingIdentityColumnError({ code: "PGRST204", message: "'vendor' column not found in the schema cache" }), true);
  assert.equal(lib.isMissingIdentityColumnError({ code: "23505", message: "duplicate key value" }), false);
  assert.equal(lib.isMissingIdentityColumnError({ message: "network request failed" }), false);
  assert.equal(lib.isMissingIdentityColumnError(null), false);
  // Card line: parts appear only when stored; a pre-087 item yields none.
  assert.deepEqual(
    lib.identityLineParts({ sku: "GL-114", vendor: "Acme", location_id: "loc-1" }, "Main Street site"),
    ["SKU GL-114", "Vendor: Acme", "📍 Stocked at: Main Street site"]
  );
  assert.deepEqual(lib.identityLineParts({ name: "Glass cleaner" }, null), []);
  assert.deepEqual(lib.identityLineParts({ location_id: "loc-1" }, null), []);
  // Search: empty query keeps the whole list; words can span fields.
  const item = { name: "Glass cleaner", category: "Chemicals", vendor: "Acme", sku: "GL-114", notes: "Streak-free" };
  assert.equal(lib.supplyItemMatchesSearch(item, "Main Street site", ""), true);
  assert.equal(lib.supplyItemMatchesSearch(item, "Main Street site", "acme gl-114"), true);
  assert.equal(lib.supplyItemMatchesSearch(item, "Main Street site", "main street"), true);
  assert.equal(lib.supplyItemMatchesSearch(item, "Main Street site", "bleach"), false);
});

test("supplies page wires the identity fields tolerantly, form and both card views", () => {
  const page = read(PAGE);
  for (const needle of [
    'import { buildIdentityPayload, identityValuesEntered, isMissingIdentityColumnError, identityLineParts, supplyItemMatchesSearch } from "../../../../lib/supply-item-identity";',
    'vendor: item.vendor || "",',
    'placeholder="Vendor (optional)"',
    'placeholder="SKU / item code (optional)"',
    "Stocked at (optional)",
    "identityReady",
    "Vendor, SKU and stocked-at turn on with the latest WorkTeams update.",
    "could not be saved yet: the vendor, SKU and stocked-at fields turn on with the latest WorkTeams update",
    ".select(\"id, name\")",
    "identityLineParts(i, locationNameOf(i))",
    "supplyItemMatchesSearch(i, locationNameOf(i), search)",
    "No supplies match",
  ]) assert.ok(page.includes(needle), `page contains: ${needle}`);
  // The save ladder: extended payload first, original payload only as
  // the no-values-entered step-down.
  assert.ok(page.includes("const fullPayload = { ...payload, ...identity };"), "save builds the extended payload");
  assert.ok(page.includes("if (writeRes.error && isMissingIdentityColumnError(writeRes.error))"), "save detects the missing-column shape");
  assert.ok(page.includes("writeRes = await writeItem(payload);"), "save steps down to the original payload only on that shape with nothing entered");
  // Existing behaviour pinned: same gates, same quantity writes, same
  // delete confirm, same movement recording.
  for (const needle of [
    'canUseWithRole(company?.effectiveTier || company?.tier, "supplies", member?.role)',
    'if (!confirm(`Delete "${name}" from inventory?`)) return;',
    '.update({ quantity_on_hand: next })',
    "recordMovement",
    '.from("supply_movements")',
    '.from("supply_assignments")',
    '.from("supply_restock_requests")',
  ]) assert.ok(page.includes(needle), `page keeps: ${needle}`);
  for (const banned of ["shift_videos", "communication_book", "time_entries"])
    assert.ok(!page.includes(banned), `page stays out of: ${banned}`);
});

test("member view never loads or renders a cost, before or after 087", () => {
  const page = read(PAGE);
  const memberLoad = page.slice(page.indexOf("async function loadMemberItems"), page.indexOf("// Probes + loads"));
  assert.ok(memberLoad.length > 0, "member load exists");
  assert.ok(memberLoad.includes("vendor, sku, location_id"), "member load's top rung carries the identity columns");
  assert.ok(!memberLoad.includes("cost_per_unit"), "no member select rung ever names the cost column");
  const memberView = page.slice(page.indexOf("// ---- Member view"), page.indexOf("// ---- Manager view"));
  assert.ok(memberView.length > 0, "member view exists");
  assert.ok(!memberView.includes("cost_per_unit"), "member view renders no cost");
  assert.ok(memberView.includes("identityLineParts(i, locationNameOf(i))"), "member cards show the identity line");
});
