import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Training step labels + evidence integrity (Phase 3 item P3-04)
// invariants:
// * Steps 1-5 all render through the one LessonStep read-and-click
//   renderer. The step-4/5 lesson content is written, self-checked
//   exercises and scenarios, so the DISPLAY labels must say that.
//   "Guided practice / Practice with coaching and checkpoints" and
//   "Simulator / Safe hands-on simulation" promise coaching,
//   checkpoints and a simulation the page does not deliver.
// * Only display strings change: step keys, numbers and order in
//   STEP_DEFS are byte-identical, because saved progress is keyed by
//   the training_steps row id / step_number, never by label text.
// * Step 9 (Evidence submission) asks for photo proof of the
//   practical. The step page must refuse to submit without a photo
//   (visible inline error), and migration 082 makes the database
//   reject an evidence row with no file, so an evidence-less
//   completion cannot be recorded by any client. The constraint is
//   NOT VALID on purpose: existing records are never invalidated.
// * Notes stay optional and supplementary ("anything the photo
//   doesn't show") — they were never a designed text-evidence mode,
//   so notes alone do not satisfy the evidence step.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in any changed file.

const TRAINING_LIB = "lib/training.js";
const STEP_PAGE = "app/app/[companyId]/training/[slug]/step/[n]/page.js";
const TRAINING_INDEX = "app/app/[companyId]/training/page.js";
const SQL_PATH = "supabase/082_training_evidence_required.sql";

test("step keys, numbers and order are unchanged (progress cannot orphan)", () => {
  const lib = read(TRAINING_LIB);
  const keys = [...lib.matchAll(/\{ n: (\d+), key: "([a-z_]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(keys, [
    "1:reading",
    "2:visual",
    "3:worked_example",
    "4:guided_practice",
    "5:simulator",
    "6:written_exam",
    "7:scenario_exam",
    "8:practical_final",
    "9:evidence",
    "10:approval",
    "11:recertification",
  ]);
});

test("steps 4 and 5 are labelled for what the renderer actually delivers", () => {
  const lib = read(TRAINING_LIB);
  assert.ok(lib.includes('{ n: 4, key: "guided_practice", label: "Practice exercises"'),
    "step 4 label is Practice exercises (key unchanged)");
  assert.ok(lib.includes('{ n: 5, key: "simulator", label: "Scenario exercises"'),
    "step 5 label is Scenario exercises (key unchanged)");
  for (const banned of [
    "Practice with coaching and checkpoints.",
    "Safe hands-on simulation before the real thing.",
    'label: "Guided practice"',
    'label: "Simulator"',
  ]) assert.ok(!lib.includes(banned), `STEP_DEFS must not promise: ${banned}`);
  const index = read(TRAINING_INDEX);
  assert.ok(index.includes("practice exercises, scenario exercises"),
    "training index summary uses the honest labels too");
  assert.ok(!index.includes("guided practice, simulator"),
    "training index no longer lists a simulator the app does not have");
});

test("evidence step refuses to submit without a photo, with a visible error", () => {
  const page = read(STEP_PAGE);
  for (const needle of [
    "if (!file) {",
    "Add a photo of your finished work before submitting",
    'role="alert"',
    "Photo evidence (required)",
  ]) assert.ok(page.includes(needle), `evidence step contains: ${needle}`);
  // The guard must run before the insert, and the insert must still
  // send the uploaded file's path as file_url.
  const guardAt = page.indexOf("if (!file) {");
  const insertAt = page.indexOf('.from("training_evidence").insert({');
  assert.ok(guardAt !== -1 && insertAt !== -1 && guardAt < insertAt,
    "the no-file check runs before the evidence insert");
  assert.ok(page.includes("file_url: url,"), "insert still records the uploaded file path");
});

test("migration 082 rejects evidence-less rows server-side, existing rows untouched", () => {
  assert.ok(existsSync(SQL_PATH), "migration 082 exists");
  const sql = read(SQL_PATH);
  for (const needle of [
    "BEGIN;",
    "COMMIT;",
    "alter table public.training_evidence",
    "add constraint training_evidence_file_required",
    "check (file_url is not null and btrim(file_url) <> '') not valid",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  assert.ok(!/update public\.training_evidence|delete from public\.training_evidence/.test(sql),
    "migration never rewrites or deletes existing evidence rows");
});

test("protected areas untouched by this build", () => {
  for (const path of [TRAINING_LIB, STEP_PAGE, TRAINING_INDEX, SQL_PATH]) {
    const text = read(path);
    for (const banned of ["time_entries", "shift-videos", "shift_videos", "comm_book", "comm-book"]) {
      assert.ok(!text.includes(banned), `${path} must not reference ${banned}`);
    }
  }
});
