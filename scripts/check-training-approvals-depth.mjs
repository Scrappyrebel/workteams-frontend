import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

import {
  EXAM_KIND_LABELS,
  STEP_STATUS_LABELS,
  groupByEnrollment,
  latestFinishedAttempt,
  sortExamAttempts,
  sortPriorDecisions,
  sortStepProgress,
  stepProgressSummary,
} from "../lib/training-approvals.mjs";

// Training approvals depth (Depth item D-WT-48) invariants:
// * The approvals page historically loaded ONLY the step-9 evidence
//   for each pending enrollment, so a manager certified a trainee
//   without ever seeing the exam scores, step progress, attempt
//   history, or earlier send-backs — even though migration 021 has
//   stored all of them (training_step_progress.score/attempts,
//   training_exam_attempts, training_approvals) since the academy
//   launched, and the 021 RLS policies already let company
//   owners/admins read them ("progress via enrollment", "exam
//   attempts via enrollment").
// * The page now also reads those stored rows for the pending
//   enrollments and displays them on each card, above the decision
//   buttons. Displayed values are the stored values; the only labels
//   are the training records page's exact words for the same stored
//   kinds/statuses. Nothing is backfilled, recomputed (beyond counts
//   of stored rows), or restated.
// * THE CERTIFICATION DECISION IS UNCHANGED: who can approve (the
//   owner/admin gate), the prompt for send-back notes, and every
//   write decide() performs (training_approvals insert,
//   training_certifications insert, enrollment status updates, the
//   steps 10-11 completion on approve and the step-9 re-open on
//   send-back) are pinned below, byte-for-byte in shape.
// * The new reads are fail-soft (the records page's pattern): a
//   failed read leaves the queue exactly as it was. The reads are
//   scoped to the pending enrollments of THIS company (the pending
//   query's company filter), never widened.
// * Evidence handling is untouched: the page still only READS
//   evidence rows and creates signed URLs to display them — no
//   upload, storage write, or deletion anywhere on this page, and no
//   protected area (time clock, shift videos, Communication Book)
//   is referenced.

const PAGE = "app/app/[companyId]/training/approvals/page.js";
const LIB = "lib/training-approvals.mjs";

test("approvals page reads the stored record behind each pending enrollment (021)", () => {
  const page = read(PAGE);
  for (const needle of [
    '.from("training_step_progress")',
    '"enrollment_id, status, score, attempts, completed_at, training_steps!inner(step_number, step_key, title)"',
    '.from("training_exam_attempts")',
    '"id, enrollment_id, kind, variant, score, passed, started_at, completed_at"',
    '.from("training_approvals")',
    '"id, enrollment_id, decision, notes, decided_at"',
    "groupByEnrollment(stepRows)",
    "groupByEnrollment(attemptRows)",
    "groupByEnrollment(decisionRows)",
    "<ReviewRecord",
    "Training record",
    "Exam attempts",
    "Earlier reviews of this training",
    "waiting for review",
  ]) assert.ok(page.includes(needle), `approvals page contains: ${needle}`);
});

test("new reads are fail-soft and scoped to the pending enrollments", () => {
  const page = read(PAGE);
  for (const needle of [
    "if (!stepError) next.steps = groupByEnrollment(stepRows);",
    "if (!attemptError) next.attempts = groupByEnrollment(attemptRows);",
    "if (!decisionError) next.decisions = groupByEnrollment(decisionRows);",
    '.eq("company_id", companyId)',
    '.eq("status", "pending_approval")',
    '.in("enrollment_id", ids)',
  ]) assert.ok(page.includes(needle), `approvals page keeps: ${needle}`);
  // Exam answers and question ids are never selected for display —
  // answer material stays out of the review surface.
  assert.ok(!page.includes("question_ids"), "no question ids read");
  assert.ok(!/\.select\([^)]*answers/.test(page), "no exam answers read");
});

test("the manager gate and the certification decision write path are unchanged", () => {
  const page = read(PAGE);
  for (const needle of [
    'const isManager = member && (member.role === "owner" || member.role === "admin");',
    "Only owners and admins can review approvals.",
    'const notes = approved ? null : prompt("What needs to be fixed? (sent to the employee)");',
    'await sb.from("training_approvals").insert({',
    'decision: approved ? "approved" : "rejected",',
    'await sb.from("training_certifications").insert({',
    'company_id: companyId,',
    '.update({ status: "certified", completed_at: new Date().toISOString() })',
    '.update({ status: "in_progress" })',
    "if ([10, 11].includes(s.training_steps.step_number))",
    "if (s.training_steps.step_number === 9)",
    '.update({ status: "available", completed_at: null })',
    "onClick={() => decide(e, true)}",
    "onClick={() => decide(e, false)}",
  ]) assert.ok(page.includes(needle), `approvals page keeps: ${needle}`);
});

test("evidence display is read-only and no protected area is touched", () => {
  const page = read(PAGE);
  const lib = read(LIB);
  for (const needle of [
    "training_evidence(id, file_url, notes, submitted_at)",
    '.from("training-evidence")',
    ".createSignedUrl(path, 3600)",
    "<EvidenceImage path={ev.file_url} />",
  ]) assert.ok(page.includes(needle), `approvals page keeps: ${needle}`);
  for (const text of [page, lib]) {
    for (const banned of [
      ".upload(",
      ".remove(",
      "time_entries",
      "shift-videos",
      "shift_videos",
      "comm_book",
      "comm-book",
    ]) assert.ok(!text.includes(banned), `must not reference: ${banned}`);
  }
  // The only writes on the page are the decision's own writes.
  const writes = [...page.matchAll(/\.(insert|update|delete|upsert)\(/g)].map((m) => m[1]);
  assert.deepEqual(writes.sort(), ["insert", "insert", "update", "update", "update", "update"]);
});

test("lib: step ordering, summary counts and percent derive from stored rows only", () => {
  const rows = [
    { status: "completed", training_steps: { step_number: 2 } },
    { status: "completed", training_steps: { step_number: 1 } },
    { status: "available", training_steps: { step_number: 3 } },
    { status: "locked", training_steps: { step_number: 4 } },
  ];
  assert.deepEqual(
    sortStepProgress(rows).map((r) => r.training_steps.step_number),
    [1, 2, 3, 4]
  );
  assert.deepEqual(stepProgressSummary(rows), { total: 4, completed: 2, percent: 50 });
  assert.deepEqual(stepProgressSummary([]), { total: 0, completed: 0, percent: null });
  assert.equal(STEP_STATUS_LABELS.completed, "Completed");
});

test("lib: exam attempts order newest-first and latest finished is per kind", () => {
  const attempts = [
    { kind: "written", score: 60, passed: false, started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T01:00:00Z" },
    { kind: "written", score: 92, passed: true, started_at: "2026-01-03T00:00:00Z", completed_at: "2026-01-03T01:00:00Z" },
    { kind: "scenario", score: 85, passed: true, started_at: "2026-01-02T00:00:00Z", completed_at: "2026-01-02T01:00:00Z" },
    { kind: "written", score: null, passed: null, started_at: "2026-01-04T00:00:00Z", completed_at: null },
  ];
  assert.equal(sortExamAttempts(attempts)[0].started_at, "2026-01-04T00:00:00Z");
  assert.equal(latestFinishedAttempt(attempts, "written").score, 92);
  assert.equal(latestFinishedAttempt(attempts, "scenario").score, 85);
  assert.equal(latestFinishedAttempt([], "written"), null);
  assert.equal(EXAM_KIND_LABELS.written, "Written exam");
  assert.equal(EXAM_KIND_LABELS.scenario, "Scenario exam");
});

test("lib: prior decisions order newest-first and grouping never mixes enrollments", () => {
  const decisions = [
    { enrollment_id: "e1", decision: "rejected", decided_at: "2026-01-01T00:00:00Z" },
    { enrollment_id: "e1", decision: "rejected", decided_at: "2026-02-01T00:00:00Z" },
    { enrollment_id: "e2", decision: "approved", decided_at: "2026-03-01T00:00:00Z" },
  ];
  const by = groupByEnrollment(decisions);
  assert.equal(sortPriorDecisions(by.e1)[0].decided_at, "2026-02-01T00:00:00Z");
  assert.equal(by.e1.length, 2);
  assert.equal(by.e2.length, 1);
  assert.deepEqual(groupByEnrollment([{ no_enrollment: true }]), {});
});
