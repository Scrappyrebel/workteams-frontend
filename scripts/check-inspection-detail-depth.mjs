import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Inspection detail depth (D-WT-21) invariants:
// * Catalog claim verified first-hand on main: a failed section
//   created NOTHING. The stored record is inspections.score (the
//   rounded average of section scores, written when the list page
//   finishes an inspection), inspection_items rows (035: section
//   score 1–5, notes, ticked-passed checklist jsonb 036) and the
//   per-item results of migration 076 (outcome pass/issue/na,
//   0–5 score, note). Tree-wide, the only work_orders inserts are
//   the Work Orders page itself, the client-portal service route
//   (source "portal") and walkthrough conversion — no inspection
//   code read a score or an "issue" outcome to create any record,
//   and WorkTeams has no corrective-action table at all.
// * The depth build is expansion-only on the detail page:
//   (1) a "Results at a glance" panel whose figures are computed
//       from the already-loaded sections + item results, with the
//       basis stated on screen (overall = stored score, recorded
//       as the rounded average of section scores; item average
//       counts only items that carry a recorded score; unrecorded
//       items are never counted as failures);
//   (2) a "Follow-up" panel listing stored deficiencies under a
//       stated rule (item marked Issue, or a section scored 1–2
//       of 5), the follow-up work orders already created from
//       this inspection, and a manager-only form that creates ONE
//       work order through the Work Orders module's own insert
//       shape, labelled source "inspection" with this inspection's
//       id in the description (work_orders has no inspection link
//       column; the portal's source "portal" is the labelling
//       precedent). Viewing the page writes nothing — the insert
//       lives only in the form's submit handler, behind the same
//       clocked-in gate and owner/admin RLS posture as every other
//       work-order create;
//   (3) an "Other inspections at this site" history list from
//       stored inspections at the same location.
// * Customer publication is untouched: the publish flow still goes
//   through its RPC, and creating a follow-up work order does not
//   publish anything (work-order publication remains the separate
//   manager step on the work order itself).
// * Inspection photos are stored evidence: no photo capture,
//   upload, storage or delete path changes here — display only.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in the changed page.

const PAGE = "app/app/[companyId]/inspections/[id]/page.js";

test("existing detail behaviour is unchanged", () => {
  const page = read(PAGE);
  for (const needle of [
    'sb.rpc("get_client_portal_inspection_publication_for_manager",{p_inspection_id:inspectionId})',
    'rpc("set_client_portal_inspection_publication"',
    "loadItemResultsBySection(sb, inspectionId)",
    "itemResults: resultsBySection[it.id] || []",
    "buildItemResultRows(inspectionId, item.id, CHECKLIST, newSecItemDetails)",
    '.storage.from("inspection-photos").upload(path, file)',
    '.from("inspection_items").insert({',
    '.from("inspections").delete().eq("id", inspectionId)',
    'member.role === "owner" || member.role === "admin"',
    "Only the inspection date, score, and summary will appear in the location-specific Customer Portal link.",
  ]) {
    assert.ok(page.includes(needle), `detail page keeps: ${needle}`);
  }
});

test("results-at-a-glance derives from stored rows and states its basis", () => {
  const page = read(PAGE);
  for (const needle of [
    "Results at a glance",
    "recorded as the rounded average of the section scores below",
    "Items with no recorded result are not counted.",
    'allItemResults.filter((r) => r.outcome === "pass").length',
    'allItemResults.filter((r) => r.outcome === "issue").length',
    'allItemResults.filter((r) => r.outcome === "na").length',
    "itemAverage.toFixed(1)",
    "No per-item results were recorded for this inspection",
  ]) {
    assert.ok(page.includes(needle), `summary panel: ${needle}`);
  }
});

test("deficiency list follows the stated stored-results rule only", () => {
  const page = read(PAGE);
  for (const needle of [
    'if (r.outcome === "issue")',
    "Number(s.score) <= 2",
    "Needs attention ({deficiencies.length})",
    "Nothing was created automatically; a manager decides what becomes a work order below.",
    "No item is marked Issue and no section is scored 1–2 of 5 in the stored results.",
  ]) {
    assert.ok(page.includes(needle), `deficiency rule: ${needle}`);
  }
});

test("follow-up creation rides the existing work-order write path, manager-initiated only", () => {
  const page = read(PAGE);
  // Exactly one work_orders insert exists on this page, inside the
  // follow-up submit handler — the load path performs no insert.
  assert.equal(
    (page.match(/\.from\("work_orders"\)\.insert/g) || []).length,
    1,
    "exactly one work_orders insert (the follow-up form submit)",
  );
  const loadStart = page.indexOf("async function load()");
  const loadEnd = page.indexOf("// ---- Depth additions (D-WT-21): derived");
  assert.ok(loadStart > 0 && loadEnd > loadStart, "load function located");
  assert.ok(!page.slice(loadStart, loadEnd).includes('.from("work_orders").insert'), "load() never creates a work order");
  for (const needle of [
    "async function createFollowUpWorkOrder(e)",
    'requireClockedIn(clockedIn, "create a follow-up work order")',
    'source: "inspection"',
    'status: "open"',
    "location_id: inspection.location_id || null",
    'body: JSON.stringify({ work_order_id: created.id, event: "assigned", actor_member_id: member.id })',
    "It is not published to the customer portal",
    "Inspection record: ${inspectionId}",
  ]) {
    assert.ok(page.includes(needle), `follow-up create: ${needle}`);
  }
  // Linked follow-ups are found by the same label the create writes.
  assert.ok(page.includes('.eq("source", "inspection")'), "follow-up list filters on the inspection source label");
  assert.ok(page.includes('.ilike("description", `%${inspectionId}%`)'), "follow-up list matches this inspection's id in the description");
  // The create form is manager-only, matching the work_orders
  // insert RLS (owner/admin) exactly.
  const formStart = page.indexOf("Create a follow-up work order");
  assert.ok(formStart > 0, "follow-up form exists");
  assert.ok(page.slice(Math.max(0, formStart - 400), formStart).includes("{isManager && ("), "follow-up form is manager-gated");
});

test("site history reads stored inspections at the same location", () => {
  const page = read(PAGE);
  for (const needle of [
    "Other inspections at this site",
    '.eq("location_id", insp.location_id)',
    '.neq("id", inspectionId)',
    ".limit(6)",
    "href={`/app/${company.id}/inspections/${h.id}`}",
  ]) {
    assert.ok(page.includes(needle), `site history: ${needle}`);
  }
});

test("the depth additions touch no protected area and no photo storage path", () => {
  const page = read(PAGE);
  for (const banned of ["time_entries", "shift_videos", "communication_book", "comm_book", "media_recorder", "MediaRecorder"]) {
    assert.ok(!page.includes(banned), `page stays out of: ${banned}`);
  }
  // Photo handling is exactly the pre-existing pair of upload calls
  // (general photos + add-section photos) and one storage remove in
  // the pre-existing photo delete — no new storage write appears.
  assert.equal(
    (page.match(/\.storage\.from\("inspection-photos"\)\.upload/g) || []).length,
    2,
    "exactly the two pre-existing photo upload calls",
  );
  assert.equal(
    (page.match(/\.storage\.from\("inspection-photos"\)\.remove/g) || []).length,
    1,
    "exactly the one pre-existing photo remove call",
  );
});
