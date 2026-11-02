import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Inspections list/create depth (D-WT-20) invariants:
// * The catalog defect: ONE hard-coded 8-item checklist served every
//   company, location and site type, and the 5 starters in
//   lib/inspection-starters.js only re-order/focus those same 8
//   items. The list also had no search, no filter and no summary.
// * Migration 084 adds company-owned checklist templates (a named,
//   ordered list of item labels, an optional site-type label in the
//   company's own words, an optional single location). Items are the
//   same label strings sections have always stored, so a template
//   needs no change to any existing table. An inspection uses a
//   template only when its inspector picks it at start; every other
//   path — blank, starter, copy — keeps the standard checklist
//   byte-identically, and recorded inspections never change.
// * Client access is fail-soft (the 068/073/075/076 pattern): until
//   084 runs, loads return unavailable, the page shows the honest
//   "turns on with the latest WorkTeams update" note, and the create
//   flow is exactly today's.
// * List depth is derived on the client from rows + stored per-item
//   results (076) the page already loads: search, location and score
//   filters, a by-site history panel, and a per-card count of items
//   marked Issue. Averages are over recorded scores only — an
//   unscored inspection is never counted as zero. No existing query,
//   wording, insert, section flow or score computation changes.
// * Protected areas stay untouched: inspection photo capture/storage
//   code is not modified, and no time clock, shift video or
//   Communication Book surface appears in any changed file.

const PAGE = "app/app/[companyId]/inspections/page.js";
const LIB = "lib/inspection-checklist-templates.js";
const SQL_PATH = "supabase/084_inspection_checklist_templates.sql";

test("migration 084 creates the templates table additively with 076-mirrored RLS", () => {
  assert.ok(existsSync(SQL_PATH), "migration 084 exists");
  const sql = read(SQL_PATH);
  for (const needle of [
    "BEGIN;",
    "COMMIT;",
    "create table if not exists public.inspection_checklist_templates",
    "references public.companies(id) on delete cascade",
    "references public.locations(id) on delete set null",
    "items jsonb not null default '[]'::jsonb",
    "enable row level security",
    "grant select, insert, update, delete on public.inspection_checklist_templates to authenticated",
    "grant all on public.inspection_checklist_templates to service_role",
    '"inspection_checklist_templates select if member"',
    '"inspection_checklist_templates insert if inspector"',
    '"inspection_checklist_templates update if inspector"',
    '"inspection_checklist_templates delete if owner/admin"',
    "m.role in ('owner', 'admin', 'supervisor')",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  for (const banned of ["shift_videos", "communication_book", "time_entries", "inspection_photos", "alter table public.inspections", "alter table public.inspection_items"])
    assert.ok(!sql.includes(banned), `migration stays out of: ${banned}`);
});

test("the template lib sanitizes items and fails soft", () => {
  const lib = read(LIB);
  for (const needle of [
    "sanitizeTemplateItems",
    "loadChecklistTemplates",
    "saveChecklistTemplate",
    "deleteChecklistTemplate",
    "loadInspectionResultCounts",
    'from("inspection_checklist_templates")',
    'from("inspection_checklist_results")',
    "return { templates: [], available: false };",
    "return {};",
    "MAX_TEMPLATE_ITEMS = 40",
  ]) assert.ok(lib.includes(needle), `lib contains: ${needle}`);
});

test("existing create flow, section flow and score computation are unchanged", () => {
  const page = read(PAGE);
  for (const needle of [
    "One inspection per visit — you'll add room-by-room sections inside it.",
    '.from("inspections").insert({',
    "checklist: newSection.checks,",
    "buildItemResultRows(activeId, item.id, orderedChecklist, newSection.itemDetails)",
    "await saveItemResults(sb,",
    "avg = Math.round(sections.reduce((s, x) => s + parseInt(x.score, 10), 0) / sections.length)",
    "Checklist — tick what passed",
    "No inspections yet.",
    'const CHECKLIST = [',
    '"High-touch areas disinfected — handles, switches"',
    "starterById(startFrom.slice(\"starter:\".length))",
    'from("inspection-photos")',
    "validatePhotoFile(file)",
  ]) assert.ok(page.includes(needle), `page keeps: ${needle}`);
});

test("a template applies only when picked, and the standard path is the default", () => {
  const page = read(PAGE);
  for (const needle of [
    "Standard checklist — the usual 8 items",
    "const baseChecklist = activeTemplate && activeTemplate.items.length > 0 ? activeTemplate.items : CHECKLIST;",
    "const chosenTemplate = templates.find((t) => t.id === templateId) || null;",
    "Checklist templates turn on with the latest WorkTeams update — until then, every inspection uses the standard checklist.",
    "Checklist templates",
    "Add a checklist template",
    "one per line",
    "setActiveTemplate(null);",
  ]) assert.ok(page.includes(needle), `template depth adds: ${needle}`);
  // The template never rewrites a recorded inspection: no update to
  // inspections or inspection_items is introduced by this build.
  assert.ok(!page.includes('.from("inspection_items").update('), "no section rewrites");
});

test("list depth derives from loaded rows and stored results only", () => {
  const page = read(PAGE);
  for (const needle of [
    "Search inspections",
    'placeholder="Location, inspector, or notes…"',
    "Inspection history by site",
    "Average recorded score",
    "last inspected",
    "Showing {visibleInspections.length} of {inspections.length} inspections.",
    "No inspections match your search or filters.",
    "{visibleInspections.map((i) => (",
    "checklist item{resultCounts[i.id].issues === 1 ? \"\" : \"s\"} marked Issue",
    '<option value="low">3 or below</option>',
    '<option value="unscored">Not scored yet</option>',
  ]) assert.ok(page.includes(needle), `list depth adds: ${needle}`);
  // Averages never treat an unscored inspection as zero.
  assert.ok(page.includes("const scoredInspections = inspections.filter((i) => i.score);"), "averages use scored inspections only");
});

test("no protected areas in any changed file", () => {
  for (const file of [PAGE, LIB, SQL_PATH]) {
    const src = read(file);
    for (const banned of ["shift_videos", "comm_book", "time_entries"])
      assert.ok(!src.includes(banned), `${file} stays out of: ${banned}`);
  }
  // Photo handling is referenced exactly as before (upload of a
  // section's photos in addSection) and never re-implemented here.
  const lib = read(LIB);
  assert.ok(!lib.includes("storage.from"), "template lib does not touch photo storage");
});
