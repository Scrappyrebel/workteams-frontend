import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  courseOutlineRows,
  courseProgressSummary,
} from "../lib/training-course-outline.mjs";
const read = (p) => readFileSync(p, "utf8");

// Training course depth (Depth item D-WT-46) invariants:
// * The course page historically had exactly one non-success state:
//   `if (loading || !data) return <p>Loading…</p>`. getCourse returns
//   null for an unknown or inactive slug, so a bad link spun on
//   "Loading…" forever with no way out. The page now records that
//   resolution and renders an honest "Course not found" terminal
//   state with the same Training Center back link the success path
//   uses. The loading render and the fetch itself are unchanged.
// * training_courses (021) stores NO objectives field, and course
//   content is never invented by display code. What IS stored is a
//   per-step syllabus: training_steps title + description for every
//   step. Before this pass those rendered only AFTER enrollment, so
//   a learner could not see what a course covers before starting
//   it. The pre-enrollment "What this course covers" outline shows
//   the stored steps through lib/training-course-outline.mjs with
//   the page's own label/description precedence — display-only, no
//   links, no writes, no new queries.
// * Enrolled learners get a progress line ("Your progress: X of N
//   steps completed (P%)") derived from the progress rows the page
//   already loads. A step with no row counts as not completed,
//   never as failed.
// * Access and behaviour are byte-identical: same getCourse /
//   getEnrollment / enroll calls, same Start button, same step
//   ladder, same step links. The page still performs no direct
//   writes (enroll stays in lib/training), and no evidence, clock,
//   video or Comm Book code is touched.

const PAGE = "app/app/[companyId]/training/[slug]/page.js";
const LIB = "lib/training-course-outline.mjs";

test("course page resolves a bad slug to an honest not-found state", () => {
  const page = read(PAGE);
  for (const needle of [
    "const [notFound, setNotFound] = useState(false);",
    "if (!d) setNotFound(true);",
    "if (loading || (!data && !notFound)) return <p>Loading…</p>;",
    "if (notFound) {",
    ">Course not found</h2>",
    "It may have been renamed or is no longer offered.",
    "Browse the Training Center",
  ]) assert.ok(page.includes(needle), `course page contains: ${needle}`);
});

test("course page shows the stored step outline before enrollment", () => {
  const page = read(PAGE);
  for (const needle of [
    'from "../../../../../lib/training-course-outline"',
    "courseOutlineRows(steps, STEP_DEFS)",
    ">What this course covers</h3>",
    "courseProgressSummary(steps, progress)",
    "Your progress: {progressSummary.completed} of {progressSummary.total} steps completed ({progressSummary.percent}%)",
  ]) assert.ok(page.includes(needle), `course page contains: ${needle}`);
});

test("course page keeps its existing behaviour and performs no direct writes", () => {
  const page = read(PAGE);
  for (const needle of [
    "const d = await getCourse(slug);",
    "const e = await getEnrollment(companyId, member.id, d.course.id);",
    "const e = await enroll(companyId, member.id, data.course.id, data.steps);",
    '{busy ? "Enrolling…" : "Start this course"}',
    "`/app/${companyId}/training/${slug}/step/${s.step_number}`",
    "{def.label || s.title}",
    "{s.description || def.desc}",
    "✓ Certified — nice work.",
    "Submitted — waiting on manager approval.",
  ]) assert.ok(page.includes(needle), `course page keeps: ${needle}`);
  assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(page), "no direct writes on the course page");
  assert.ok(!/training_evidence|shift.?video|comm.?book|time.?clock/i.test(page), "no protected-area code on the course page");
});

test("outline lib is pure and mirrors the page's own precedence", () => {
  const src = read(LIB);
  assert.ok(!/supabase|\.from\(|fetch\(/.test(src), "lib performs no reads or writes");
  const lib = { courseOutlineRows, courseProgressSummary };
  const defs = [
    { n: 1, label: "Reading", desc: "Def desc one." },
    { n: 2, label: "Visual reinforcement", desc: "Def desc two." },
  ];
  const steps = [
    { id: "a", step_number: 1, title: "Stored title one", description: "Stored desc one." },
    { id: "b", step_number: 2, title: "Stored title two", description: "" },
    { id: "c", step_number: 9, title: "Stored title nine", description: "Stored desc nine." },
  ];
  assert.deepEqual(lib.courseOutlineRows(steps, defs), [
    { step_number: 1, label: "Reading", desc: "Stored desc one." },
    { step_number: 2, label: "Visual reinforcement", desc: "Def desc two." },
    { step_number: 9, label: "Stored title nine", desc: "Stored desc nine." },
  ]);
  assert.deepEqual(lib.courseOutlineRows(null, defs), []);
  assert.deepEqual(
    lib.courseProgressSummary(steps, { a: { status: "completed" }, b: { status: "available" } }),
    { total: 3, completed: 1, percent: 33 }
  );
  assert.deepEqual(lib.courseProgressSummary([], {}), { total: 0, completed: 0, percent: 0 });
  assert.deepEqual(
    lib.courseProgressSummary(steps, { a: { status: "completed" }, b: { status: "completed" }, c: { status: "completed" } }),
    { total: 3, completed: 3, percent: 100 }
  );
});
