// Training approvals helpers (Depth D-WT-48) — pure, display-only.
//
// Everything here derives from rows the approvals page reads from the
// migration-021 training tables: training_step_progress (status,
// score, attempts, completed_at, joined to the stored training_steps
// title/number/key), training_exam_attempts (kind, variant, score,
// passed, dates) and training_approvals (prior decisions). Those facts
// have been stored since the academy launched; the approvals page
// historically never read them, so a manager certified seeing only
// the step-9 evidence. Nothing here performs a write or a network
// call, recomputes a score, or changes a stored value: ordering
// reorders already-loaded rows in memory, counts count stored rows,
// and the exam labels reuse the training records page's exact words
// for the same stored kinds ("Written exam" / "Scenario exam",
// "Passed" / "Did not pass").

export const EXAM_KIND_LABELS = {
  written: "Written exam",
  scenario: "Scenario exam",
};

// The stored step statuses (021 CHECK) in plain words. Only the label
// is presentation; the status itself is the stored value.
export const STEP_STATUS_LABELS = {
  completed: "Completed",
  in_progress: "In progress",
  available: "Available",
  locked: "Locked",
};

// Step rows for one enrollment, in the course's own step order (the
// stored step_number). Rows without a joined step sort last, keeping
// their loaded order (the sort is made stable with the original
// index).
export function sortStepProgress(rows) {
  return [...(rows || [])]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const na = a.r.training_steps?.step_number;
      const nb = b.r.training_steps?.step_number;
      const ka = typeof na === "number" ? na : Number.MAX_SAFE_INTEGER;
      const kb = typeof nb === "number" ? nb : Number.MAX_SAFE_INTEGER;
      return ka !== kb ? ka - kb : a.i - b.i;
    })
    .map((x) => x.r);
}

// How much of the stored record is complete: counts of the stored
// step rows and how many carry the stored "completed" status. The
// percent is completed out of total stored rows, rounded; with no
// rows it is null (nothing honest to show).
export function stepProgressSummary(rows) {
  const list = rows || [];
  const total = list.length;
  const completed = list.filter((r) => r.status === "completed").length;
  return {
    total,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : null,
  };
}

// Exam attempts newest first, by the stored started_at (falling back
// to completed_at). The stored order is kept for ties and for rows
// with no dates.
export function sortExamAttempts(attempts) {
  return [...(attempts || [])]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const da = x.a.started_at || x.a.completed_at || "";
      const db = y.a.started_at || y.a.completed_at || "";
      if (da !== db) return da < db ? 1 : -1;
      return x.i - y.i;
    })
    .map((x) => x.a);
}

// The most recent FINISHED attempt of one kind (written/scenario), or
// null when the trainee has not finished an attempt of that kind.
// "Finished" is the stored completed_at being set — the same test the
// records page uses.
export function latestFinishedAttempt(attempts, kind) {
  const finished = sortExamAttempts(attempts).filter(
    (a) => a.kind === kind && a.completed_at
  );
  return finished.length > 0 ? finished[0] : null;
}

// Prior review decisions on one enrollment, newest first by the
// stored decided_at (falling back to the loaded order).
export function sortPriorDecisions(decisions) {
  return [...(decisions || [])]
    .map((d, i) => ({ d, i }))
    .sort((x, y) => {
      const da = x.d.decided_at || "";
      const db = y.d.decided_at || "";
      if (da !== db) return da < db ? 1 : -1;
      return x.i - y.i;
    })
    .map((x) => x.d);
}

// Group rows (step progress, exam attempts, prior decisions) by their
// enrollment_id so the page can attach each pending enrollment's own
// stored record to its card. Rows for other enrollments are ignored
// by the caller, never merged across people.
export function groupByEnrollment(rows) {
  const by = {};
  for (const r of rows || []) {
    if (!r || !r.enrollment_id) continue;
    (by[r.enrollment_id] = by[r.enrollment_id] || []).push(r);
  }
  return by;
}
