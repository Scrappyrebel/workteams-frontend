import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Training records depth (Depth item D-WT-49) invariants:
// * The records page historically read ONLY training_certifications,
//   so a manager saw issued certifications and nothing else — no
//   in-progress training, no exam attempts, no search, no export —
//   even though migration 021 has stored enrollments, step progress
//   and graded exam attempts since the academy launched.
// * The page now also reads training_enrollments (status, current
//   step, started_at), training_step_progress (stored completion
//   counts) and training_exam_attempts (kind, variant, score, passed,
//   dates). Displayed values are the stored values; the only labels
//   are plain words for stored statuses. Nothing is backfilled or
//   restated, and the page performs NO writes of any kind — training
//   records are compliance evidence.
// * Scope is unchanged: managers see the company's rows, everyone
//   else only their own member rows, for the new reads exactly as for
//   the certification read. The 075 alerts block and the certification
//   cards render as before (fail-soft: a failed new read leaves the
//   page exactly as it was).
// * Search filters the records on screen by employee/course; the CSV
//   export (the Hour report's Blob pattern) copies the filtered rows.
// * Certification issuing, the course player and the approvals flow
//   are untouched — approvals is a separate page (D-WT-48).

const PAGE = "app/app/[companyId]/training/records/page.js";

test("records page reads enrollments, step progress and exam attempts (021)", () => {
  const page = read(PAGE);
  for (const needle of [
    '.from("training_enrollments")',
    '.from("training_step_progress")',
    '.from("training_exam_attempts")',
    '"id, enrollment_id, kind, variant, score, passed, started_at, completed_at"',
    "STATUS_LABELS",
    ">Training in progress<",
    ">Exam attempts<",
  ]) assert.ok(page.includes(needle), `records page contains: ${needle}`);
});

test("records page scope is unchanged for every read (manager vs own)", () => {
  const page = read(PAGE);
  assert.ok(
    page.includes('if (!isManager) q = q.eq("member_id", member.id);'),
    "certifications still scope to own rows for non-managers"
  );
  assert.ok(
    page.includes('if (!isManager) eq = eq.eq("member_id", member.id);'),
    "enrollments scope to own rows for non-managers"
  );
  assert.ok(
    page.includes("company_members!training_enrollments_member_id_fkey"),
    "enrollment person comes from the stored member link"
  );
});

test("records page is read-only and keeps the 075 alerts + certification rendering", () => {
  const page = read(PAGE);
  assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(page), "no writes on the records page");
  for (const needle of [
    'sb.rpc("refresh_training_certification_alerts"',
    '.from("training_certifications")',
    '"No certifications yet."',
    "Certified ",
    " — expired, recertify",
  ]) assert.ok(page.includes(needle), `records page keeps: ${needle}`);
});

test("records page has search and the Hour-report-style CSV export of stored rows", () => {
  const page = read(PAGE);
  for (const needle of [
    'type="search"',
    "Search by employee or course…",
    "function exportCsv()",
    'new Blob([lines.join("\\n")], { type: "text/csv" })',
    ">Export CSV</button>",
    '"Written exam attempt"',
    '"Scenario exam attempt"',
    '"Course progress"',
  ]) assert.ok(page.includes(needle), `records page contains: ${needle}`);
});
