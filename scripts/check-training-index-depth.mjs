import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ENROLLMENT_STATUS_LABELS,
  categoryLabel,
  certState,
  countStepsByEnrollment,
  enrollmentByCourse,
  groupCoursesByCategory,
  humanizeCategory,
  progressSummary,
  searchCourses,
  summarizeMyTraining,
} from "../lib/training-index.mjs";
const read = (p) => readFileSync(p, "utf8");

// Training index depth (Depth item D-WT-45) invariants:
// * On main the index rendered ONLY the two hard-coded categories in
//   CATEGORY_LABELS (any other stored category was loaded, grouped and
//   silently never rendered), and migration 021's CHECK froze the
//   catalog at those same two values. The page now groups through
//   lib/training-index.mjs: the two known categories come first with
//   their exact labels, any other stored category follows under its
//   own derived heading, and migration 088 widens the CHECK to any
//   slug-shaped category. Existing rows, order and labels are
//   unchanged; the app renders exactly as before until a course with
//   another category exists.
// * The page historically read only the course catalog and the
//   member's own certifications — a half-finished course looked
//   identical to an untouched one. It now also reads the member's OWN
//   training_enrollments and training_step_progress (021, stored
//   since launch) to show a "Your training" panel, per-card progress
//   ("Step X of 11", "N of M steps completed (P%)", progress bar) and
//   certification dates with the records page's expired / expiring
//   soon flags. Scope is byte-identical to the certification read:
//   own member rows only. The reads are fail-soft — a failed read
//   leaves the page exactly as it was.
// * There is NO assignment model in WorkTeams training (no
//   assigned_by, no due date, enrollment is self-started) — this
//   guard pins that the page invents none: no due-date or assignment
//   wording, and no writes of any kind. Training evidence is never
//   read or touched here (protected-adjacent surface).

const PAGE = "app/app/[companyId]/training/page.js";
const MIGRATION = "supabase/088_training_course_categories.sql";
const KNOWN = { cleaning: "Cleaning courses", business: "Business & management" };
const NOW = Date.parse("2026-11-03T12:00:00Z");

test("grouping keeps the known categories first with exact labels and appends any other category", () => {
  const courses = [
    { id: "1", category: "business", title: "B" },
    { id: "2", category: "cleaning", title: "C" },
    { id: "3", category: "food_safety", title: "F" },
    { id: "4", category: "cleaning", title: "C2" },
    { id: "5", category: "equipment", title: "E" },
  ];
  const groups = groupCoursesByCategory(courses, KNOWN);
  assert.deepEqual(groups.map((g) => g.key), ["cleaning", "business", "equipment", "food_safety"]);
  assert.deepEqual(groups.map((g) => g.label), [
    "Cleaning courses",
    "Business & management",
    "Equipment courses",
    "Food Safety courses",
  ]);
  assert.deepEqual(groups[0].courses.map((c) => c.id), ["2", "4"], "loaded order kept inside a group");
  assert.equal(categoryLabel("cleaning", KNOWN), "Cleaning courses");
  assert.equal(categoryLabel("", KNOWN), "Other courses");
  assert.equal(humanizeCategory("food_safety"), "Food Safety");
  assert.equal(humanizeCategory(""), "");
  assert.deepEqual(groupCoursesByCategory([], KNOWN), []);
});

test("search matches title, description, department and category; empty query returns all", () => {
  const courses = [
    { id: "1", category: "cleaning", title: "Floor Care", description: "Buffers", department: "Floors" },
    { id: "2", category: "business", title: "Sales Basics", description: "Calls", department: "Sales" },
    { id: "3", category: "food_safety", title: "Kitchen Hygiene", description: "Storage", department: "Kitchen" },
  ];
  assert.deepEqual(searchCourses(courses, "", KNOWN).map((c) => c.id), ["1", "2", "3"]);
  assert.deepEqual(searchCourses(courses, "floor", KNOWN).map((c) => c.id), ["1"]);
  assert.deepEqual(searchCourses(courses, "food safety", KNOWN).map((c) => c.id), ["3"]);
  assert.deepEqual(searchCourses(courses, "zzz", KNOWN), []);
});

test("step counts, progress percent and certification state derive only from stored rows", () => {
  const counts = countStepsByEnrollment([
    { enrollment_id: "e1", status: "completed" },
    { enrollment_id: "e1", status: "completed" },
    { enrollment_id: "e1", status: "available" },
    { enrollment_id: "e1", status: "locked" },
    { enrollment_id: "e2", status: "completed" },
    { enrollment_id: null, status: "completed" },
  ]);
  assert.deepEqual(counts.e1, { done: 2, total: 4 });
  assert.deepEqual(progressSummary({ id: "e1" }, counts.e1), { done: 2, total: 4, pct: 50 });
  assert.equal(progressSummary({ id: "e1" }, null), null, "no counts -> no percent stated");
  assert.deepEqual(progressSummary({ id: "e1" }, { done: 0, total: 0 }), { done: 0, total: 0, pct: null });
  const day = 24 * 3600 * 1000;
  assert.deepEqual(certState({ expires_at: new Date(NOW - day).toISOString() }, NOW), { expired: true, soon: false });
  assert.deepEqual(certState({ expires_at: new Date(NOW + 10 * day).toISOString() }, NOW), { expired: false, soon: true });
  assert.deepEqual(certState({ expires_at: new Date(NOW + 90 * day).toISOString() }, NOW), { expired: false, soon: false });
  assert.deepEqual(certState({}, NOW), { expired: false, soon: false });
});

test("own-training summary counts stored rows and keeps non-certified enrollments in loaded order", () => {
  const courses = [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }];
  const enrollments = [
    { id: "e2", course_id: "c2", status: "pending_approval" },
    { id: "e1", course_id: "c1", status: "in_progress" },
    { id: "e3", course_id: "c3", status: "certified" },
  ];
  const certs = [
    { course_id: "c3", expires_at: new Date(NOW + 90 * 24 * 3600 * 1000).toISOString() },
    { course_id: "c4", expires_at: new Date(NOW - 24 * 3600 * 1000).toISOString() },
  ];
  const s = summarizeMyTraining(courses, enrollments, certs, NOW);
  assert.equal(s.certified, 2);
  assert.deepEqual(s.inProgress.map((e) => e.id), ["e2", "e1"]);
  assert.equal(s.notStarted, 0, "c4 holds a (now expired) certification, so it is not 'not started'");
  assert.equal(s.expiredCerts, 1);
  assert.equal(s.expiringSoonCerts, 0);
  assert.equal(ENROLLMENT_STATUS_LABELS.pending_approval, "Waiting for approval");
  assert.deepEqual(enrollmentByCourse(enrollments).c1.id, "e1");
});

test("index page reads own enrollments + step progress and renders progress, search and all categories", () => {
  const page = read(PAGE);
  for (const needle of [
    '.from("training_enrollments")',
    '.from("training_step_progress")',
    '"id, course_id, status, current_step, started_at, completed_at"',
    '"course_id, issued_at, expires_at"',
    ">Your training</h3>",
    "You are not part-way through a course right now.",
    'type="search"',
    'placeholder="Search courses…"',
    "No courses match your search.",
    "groupCoursesByCategory(visibleCourses, CATEGORY_LABELS)",
    "steps completed",
    "— expired, recertify",
    "— expiring soon",
    'from "../../../../lib/training-index.mjs"',
  ]) assert.ok(page.includes(needle), `index page contains: ${needle}`);
  // The new reads keep the certification read's exact own-member scope.
  assert.equal(
    (page.match(/\.eq\("member_id", member\.id\)/g) || []).length,
    2,
    "certifications and enrollments both scope to the signed-in member's own rows"
  );
});

test("index page keeps existing behavior and invents no assignments, due dates or writes", () => {
  const page = read(PAGE);
  for (const needle of [
    'const CATEGORY_LABELS = { cleaning: "Cleaning courses", business: "Business & management" };',
    '.from("training_courses")',
    "• Certified",
    "• Recertify",
    "No courses yet — check back soon.",
    "Review approvals →",
    "Training records →",
    "My training records →",
  ]) assert.ok(page.includes(needle), `index page keeps: ${needle}`);
  assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(page), "no writes on the index page");
  assert.ok(!/due date|assigned to|assignment/i.test(page), "no assignment or due-date claims — no such model exists");
  assert.ok(!page.includes("training_evidence"), "training evidence is never read on this page");
  assert.ok(!/storage|upload/i.test(page), "no media/storage code on this page (protected areas untouched)");
});

test("migration 088 widens only the category check and touches nothing else", () => {
  const sql = read(MIGRATION);
  for (const needle of [
    "drop constraint if exists training_courses_category_check",
    "add constraint training_courses_category_check",
    "check (category ~ '^[a-z][a-z0-9_-]*$')",
    "BEGIN;",
    "COMMIT;",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  const code = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  assert.ok(!/create table|create policy|grant |companies/i.test(code), "no new table, policy, grant or companies change");
});

test("prebuild chain runs this guard", () => {
  const pkg = read("package.json");
  assert.ok(
    pkg.includes("node scripts/check-training-index-depth.mjs"),
    "package.json prebuild includes check-training-index-depth"
  );
});
