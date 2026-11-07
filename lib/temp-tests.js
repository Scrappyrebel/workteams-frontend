// Skills-test library + records for the temp staffing service.
//
// MODEL (Wendy, 2026-11-07): test-to-place, not train-to-place. A temp
// passes the tests their line of work requires BEFORE they can be
// assigned to it; fail = no placement, and the agency does not do
// on-site training to make up a failed test.
//
// STORAGE (interim, no new tables yet): a test result is a row in the
// existing temp_member_skills table whose skill string encodes the
// result:  test:<testKey>:pass | test:<testKey>:fail
// An optional score rides in a sibling row:  score:<testKey>:<number>
// created_at on the row is the record date; the LATEST row for a test
// wins. Test tags are reserved — the free-form skill box rejects them,
// and the skill-tag displays filter them out (the Skills Tests panel
// is where they belong).
//
// DATABASE NEED (flagged for a future migration): a real
// temp_test_records table (test key, score, result, recorded_by,
// expires_at, certificate reference). Validity periods and retake
// rules are agency policy, set per test below as defaults; nothing
// here expires a pass automatically until that table lands.

export const TEST_TAG_PREFIX = "test:";
export const SCORE_TAG_PREFIX = "score:";

export function isTestTag(skill) {
  return (
    typeof skill === "string" &&
    (skill.startsWith(TEST_TAG_PREFIX) || skill.startsWith(SCORE_TAG_PREFIX))
  );
}

export function testTag(testKey, passed) {
  return `${TEST_TAG_PREFIX}${testKey}:${passed ? "pass" : "fail"}`;
}

export function scoreTag(testKey, score) {
  return `${SCORE_TAG_PREFIX}${testKey}:${score}`;
}

// The library. `requiredIn` lists the staffing lanes where the test
// is a hard gate. `scoreKind`: "percent" (0–100) or "wpm" (typing).
export const TEST_LIBRARY = [
  // ---- Office / administrative ----
  {
    key: "office-excel",
    lane: "office",
    label: "Microsoft Excel proficiency",
    scoreKind: "percent",
    requiredIn: ["office"],
    note: "Offices expect a temp to arrive already knowing Excel. Typical agency pass marks run 70–80%; the agency sets its own cut.",
  },
  {
    key: "office-word",
    lane: "office",
    label: "Microsoft Word proficiency",
    scoreKind: "percent",
    requiredIn: ["office"],
    note: "Documents, formatting, mail merge basics — the everyday office tools.",
  },
  {
    key: "office-typing",
    lane: "office",
    label: "Typing test",
    scoreKind: "wpm",
    requiredIn: [],
    note: "40 words per minute is the documented federal-clerk anchor; 35–50 wpm is the common office range. Record the score; the client sets the floor.",
  },
  // ---- Factory / manufacturing — the safety gate (required for EVERY factory temp) ----
  {
    key: "factory-osha",
    lane: "manufacturing",
    label: "OSHA general safety test",
    scoreKind: "percent",
    requiredIn: ["manufacturing"],
    safetyGate: true,
    note: "General workplace safety knowledge. No factory placement without a pass — no exceptions.",
  },
  {
    key: "factory-hazcom",
    lane: "manufacturing",
    label: "Chemical safety / HazCom test",
    scoreKind: "percent",
    requiredIn: ["manufacturing"],
    safetyGate: true,
    note: "Labels, pictograms, safety data sheets, and the worker's right to know. The host still owes site-specific chemical training on its own chemicals.",
  },
  {
    key: "factory-loto",
    lane: "manufacturing",
    label: "Lockout/tagout test (affected level)",
    scoreKind: "percent",
    requiredIn: ["manufacturing"],
    safetyGate: true,
    note: "Recognize locks and tags, know the prohibition on restarting or removing them. Machine-specific authorized-level training can only be given by the host, on its own equipment.",
  },
  // ---- Factory — forklift, TWO-STATE record ----
  {
    key: "forklift-instruction",
    lane: "manufacturing",
    label: "Forklift — agency instruction (video + written test)",
    scoreKind: "percent",
    requiredIn: [],
    forkliftState: "instruction",
    note: "This is only the classroom part of OSHA's rule (29 CFR 1910.178). It is a pre-screen, never a certification by itself.",
  },
  {
    key: "forklift-host-eval",
    lane: "manufacturing",
    label: "Forklift — host workplace evaluation",
    scoreKind: null,
    requiredIn: [],
    forkliftState: "hostEval",
    note: "The host watches the operator actually drive in its workplace. Only when this is done is the operator fully certified under OSHA's rule.",
  },
  // ---- Factory — aptitude (per job, not universal) ----
  {
    key: "factory-sorting",
    lane: "manufacturing",
    label: "Sorting / accuracy test",
    scoreKind: "percent",
    requiredIn: [],
    note: "Sorting, labeling and SKU accuracy for warehouse and production work.",
  },
  {
    key: "factory-piecework",
    lane: "manufacturing",
    label: "Piecework pace test",
    scoreKind: "percent",
    requiredIn: [],
    note: "Pace and consistency on simulated production work.",
  },
  // ---- Cleaning / janitorial — screening, not a test battery ----
  {
    key: "cleaning-screening",
    lane: "cleaning",
    label: "Cleaning screening record",
    scoreKind: null,
    requiredIn: ["cleaning"],
    note: "Interview, references, and chemical-safety awareness covered. Cleaning placements screen for reliability; there is no standard cleaning test battery.",
  },
];

export const TEST_BY_KEY = Object.fromEntries(TEST_LIBRARY.map((t) => [t.key, t]));

export function requiredTestsForLane(lane) {
  return TEST_LIBRARY.filter((t) => (t.requiredIn || []).includes(lane));
}

// Parse one worker's skill rows into test records:
// { [testKey]: { passed, date, score } } — latest row wins per key.
export function testRecordsFromSkills(skillRows) {
  const records = {};
  const scores = {};
  const sorted = [...(skillRows || [])].sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );
  for (const row of sorted) {
    const s = row.skill || "";
    if (s.startsWith(TEST_TAG_PREFIX)) {
      const rest = s.slice(TEST_TAG_PREFIX.length);
      const idx = rest.lastIndexOf(":");
      if (idx > 0) {
        const key = rest.slice(0, idx);
        const result = rest.slice(idx + 1);
        if (TEST_BY_KEY[key] && (result === "pass" || result === "fail")) {
          records[key] = {
            passed: result === "pass",
            date: (row.created_at || "").slice(0, 10) || null,
          };
        }
      }
    } else if (s.startsWith(SCORE_TAG_PREFIX)) {
      const rest = s.slice(SCORE_TAG_PREFIX.length);
      const idx = rest.lastIndexOf(":");
      if (idx > 0) {
        const key = rest.slice(0, idx);
        const val = parseFloat(rest.slice(idx + 1));
        if (TEST_BY_KEY[key] && Number.isFinite(val)) scores[key] = val;
      }
    }
  }
  for (const [key, val] of Object.entries(scores)) {
    if (records[key]) records[key].score = val;
  }
  return records;
}

// Gate check: can this worker be assigned to a job in `lane`?
// Returns { assignable: boolean, missing: [test,...] }.
export function laneGateStatus(records, lane) {
  const missing = requiredTestsForLane(lane).filter(
    (t) => !records[t.key]?.passed
  );
  return { assignable: missing.length === 0, missing };
}

// Forklift honesty: two states, never blurred.
// "none" | "instruction" (pre-screen passed — NOT certified) | "certified"
export function forkliftStatus(records) {
  const instruction = !!records["forklift-instruction"]?.passed;
  const hostEval = !!records["forklift-host-eval"]?.passed;
  if (instruction && hostEval) return "certified";
  if (instruction) return "instruction";
  return "none";
}

export const FORKLIFT_STATUS_LABELS = {
  none: "No forklift record",
  instruction: "Agency instruction passed — pre-screen only, NOT certified",
  certified: "Certified — agency instruction + host workplace evaluation on file",
};

// What a client company may see: test name, result, date, score.
// Never item-level answers (none are stored), never other workers.
export function clientTestSummary(records) {
  return TEST_LIBRARY.filter((t) => records[t.key]).map((t) => ({
    label: t.label,
    passed: records[t.key].passed,
    date: records[t.key].date,
    score: records[t.key].score ?? null,
    scoreKind: t.scoreKind,
  }));
}
