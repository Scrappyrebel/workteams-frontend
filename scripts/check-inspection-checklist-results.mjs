import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Inspection per-item structured results (migration 076, audit item
// A8) invariants:
// * WorkTeams inspections are sectioned forms: a section (an
//   inspection_items row) carries a 1–5 score, notes, and a checklist
//   jsonb of the standard items ticked as passed (035/036). Until 076
//   that array was the only per-item record: an unticked item left no
//   trace, so fail / N/A / never-checked were indistinguishable and no
//   item could carry its own score or note. Workforce's Dept 1 (its
//   migration 258) records per-item pass/issue/N-A + 0–5 score + note
//   as structured rows; 076 is the WorkTeams-shaped parity piece.
// * One structured row per checklist item per section in
//   public.inspection_checklist_results, tied to both the inspection
//   and the section, with outcome pass/issue/na (or null), a 0–5
//   score, and a note — unique (inspection_item_id, item_label).
// * Expansion only: the ticked = passed checkboxes, the checklist
//   jsonb write, the section score and the overall average are
//   unchanged. Results are recorded when a section is ADDED (the live
//   run form and the detail page's manager add form, through the
//   shared InspectionChecklistDetails component); the section edit
//   form is untouched, so editing a section never rewrites its
//   recorded results. Old inspections have no rows and render exactly
//   as before; the detail view shows an "Item results" block only
//   where rows exist.
// * RLS mirrors the sections table's own posture (036): member read,
//   inspector (owner/admin/supervisor) insert/update, owner/admin
//   delete, company scope joined through the inspection.
// * Client reads/writes are fail-soft: until 076 runs the table is
//   not there, the save is swallowed, the load returns {}, and both
//   inspection pages behave exactly as today.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in any changed file.

const SQL_PATH = "supabase/076_inspection_checklist_results.sql";
const LIB = "lib/inspection-item-results.js";
const COMPONENT = "components/InspectionChecklistDetails.js";
const RUN_PAGE = "app/app/[companyId]/inspections/page.js";
const DETAIL_PAGE = "app/app/[companyId]/inspections/[id]/page.js";

test("migration 076 creates the per-item results table with 036-mirrored RLS", () => {
  assert.ok(existsSync(SQL_PATH), "migration 076 exists");
  const sql = read(SQL_PATH);
  for (const needle of [
    "BEGIN;",
    "COMMIT;",
    "create table if not exists public.inspection_checklist_results",
    "references public.inspections(id) on delete cascade",
    "references public.inspection_items(id) on delete cascade",
    "outcome in ('pass', 'issue', 'na')",
    "score >= 0 and score <= 5",
    "unique (inspection_item_id, item_label)",
    "enable row level security",
    "grant select, insert, update, delete on public.inspection_checklist_results to authenticated",
    "grant all on public.inspection_checklist_results to service_role",
    '"inspection_checklist_results select if member"',
    '"inspection_checklist_results insert if inspector"',
    '"inspection_checklist_results update if inspector"',
    '"inspection_checklist_results delete if owner/admin"',
    "m.role in ('owner', 'admin', 'supervisor')",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  for (const banned of ["shift_videos", "communication_book", "time_entries"])
    assert.ok(!sql.includes(banned), `migration stays out of: ${banned}`);
});

test("the lib helper builds rows sparsely and saves/loads fail-soft", () => {
  const lib = read(LIB);
  for (const needle of [
    "buildItemResultRows",
    "saveItemResults",
    "loadItemResultsBySection",
    'from("inspection_checklist_results")',
    "if (!outcome && score === null && !note) return;",
    "return {};",
  ]) assert.ok(lib.includes(needle), `lib contains: ${needle}`);
});

test("both add-section forms capture per-item details through the shared component", () => {
  const component = read(COMPONENT);
  for (const needle of [
    "InspectionChecklistDetails",
    "choosing \"Pass\"",
    "ITEM_OUTCOMES",
    "Per-item results are optional",
  ]) assert.ok(component.includes(needle), `component contains: ${needle}`);
  const run = read(RUN_PAGE);
  for (const needle of [
    "<InspectionChecklistDetails",
    "buildItemResultRows(activeId, item.id, orderedChecklist, newSection.itemDetails)",
    "await saveItemResults(sb,",
  ]) assert.ok(run.includes(needle), `run page contains: ${needle}`);
  const detail = read(DETAIL_PAGE);
  for (const needle of [
    "<InspectionChecklistDetails",
    "buildItemResultRows(inspectionId, item.id, CHECKLIST, newSecItemDetails)",
    "await saveItemResults(sb,",
  ]) assert.ok(detail.includes(needle), `detail page contains: ${needle}`);
});

test("existing inspection behavior is retained byte-for-byte in the load-bearing parts", () => {
  const run = read(RUN_PAGE);
  for (const needle of [
    "checklist: newSection.checks,",
    '.from("inspection_items").insert({',
    "One inspection per visit",
    "Checklist — tick what passed",
    "avg = Math.round(sections.reduce((s, x) => s + parseInt(x.score, 10), 0) / sections.length)",
  ]) assert.ok(run.includes(needle), `run page retains: ${needle}`);
  const detail = read(DETAIL_PAGE);
  for (const needle of [
    "checklist: newSecChecks,",
    "checklist: editingSec.checklist || [],",
    "✓ {c}",
    "Item results",
    "loadItemResultsBySection(sb, inspectionId)",
    "itemResults: resultsBySection[it.id] || []",
  ]) assert.ok(detail.includes(needle), `detail page retains/contains: ${needle}`);
  // The detail view renders the results block only when rows exist.
  assert.ok(
    detail.includes("Array.isArray(s.itemResults) && s.itemResults.length > 0"),
    "results block renders only where rows exist"
  );
  // Protected areas: the changed pages touch none of them.
  for (const page of [run, detail]) {
    for (const banned of ["shift_videos", "communication_book", "comm-book", "time_entries"])
      assert.ok(!page.includes(banned), `page stays out of: ${banned}`);
  }
});
