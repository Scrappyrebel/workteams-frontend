// Training index helpers (Depth D-WT-45) — pure, display-only.
//
// Everything here derives from rows the training index page loads from
// the academy's stored tables (migration 021): training_courses
// (category, department, title, description), the signed-in member's own
// training_enrollments (status, current_step, started_at),
// training_step_progress (per-enrollment completion counts) and
// training_certifications (issued_at, expires_at). Nothing here performs
// a write or a network call, and nothing restates a stored value: the
// progress percent is the stored completed-step count over the stored
// step-row count, and the certification state is the stored expires_at
// compared against now — the same comparisons the training records page
// (D-WT-49) already makes, in the same words.

// The records page's stored-status labels, verbatim — one vocabulary
// for an enrollment's status everywhere training shows it.
export const ENROLLMENT_STATUS_LABELS = {
  in_progress: "In progress",
  pending_approval: "Waiting for approval",
  rejected: "Sent back",
  expired: "Expired",
  certified: "Certified",
};

// The records page's expiring-soon window (the 075 alert window).
export const EXPIRING_SOON_MS = 30 * 24 * 3600 * 1000;

// "food_safety" -> "Food Safety". Returns "" for anything that carries
// no usable words (empty, null, punctuation only).
export function humanizeCategory(category) {
  const words = String(category || "")
    .split(/[_-]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return "";
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// The heading for one category section. A category the app already
// knows keeps its exact stored label ("Cleaning courses",
// "Business & management"); any other stored category gets its own
// heading built from the stored slug, so a course in a new category
// displays under its own section instead of never rendering at all.
export function categoryLabel(category, knownLabels = {}) {
  if (knownLabels && knownLabels[category]) return knownLabels[category];
  const human = humanizeCategory(category);
  return human ? `${human} courses` : "Other courses";
}

// Group the loaded courses by their stored category. The categories
// the page has always shown come first, in their established order,
// with their established labels; any other category follows in
// alphabetical order of its stored slug. Courses keep the loaded
// order inside each group (the page's query orders by category, then
// sort_order), so the two existing sections render exactly as before.
export function groupCoursesByCategory(courses, knownLabels = {}) {
  const groups = {};
  for (const c of courses || []) {
    const key = c && c.category ? String(c.category) : "";
    (groups[key] = groups[key] || []).push(c);
  }
  const known = Object.keys(knownLabels || {}).filter(
    (k) => groups[k] && groups[k].length > 0
  );
  const extra = Object.keys(groups)
    .filter((k) => !known.includes(k))
    .sort();
  return [...known, ...extra].map((key) => ({
    key,
    label: categoryLabel(key, knownLabels),
    courses: groups[key],
  }));
}

// Search over the text a course card already shows — title,
// description, department — plus its category heading. An empty query
// returns the rows untouched.
export function searchCourses(courses, query, knownLabels = {}) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [...(courses || [])];
  return (courses || []).filter((c) => {
    const haystack = [
      c.title || "",
      c.description || "",
      c.department || "",
      categoryLabel(c.category, knownLabels),
      c.category || "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function enrollmentByCourse(enrollments) {
  const map = {};
  for (const e of enrollments || []) {
    if (e && e.course_id) map[e.course_id] = e;
  }
  return map;
}

// Per-enrollment step counts from training_step_progress rows — the
// records page's counting pattern: total = stored step rows, done =
// rows whose stored status is "completed".
export function countStepsByEnrollment(stepRows) {
  const counts = {};
  for (const s of stepRows || []) {
    if (!s || !s.enrollment_id) continue;
    const c = (counts[s.enrollment_id] = counts[s.enrollment_id] || {
      done: 0,
      total: 0,
    });
    c.total += 1;
    if (s.status === "completed") c.done += 1;
  }
  return counts;
}

// Progress for one enrollment from its step counts. Returns null when
// there are no counts to speak from (the step-progress read failed or
// no rows exist) so the page can show the step number alone rather
// than a percent it cannot back. A percent is only stated when there
// is at least one stored step row.
export function progressSummary(enrollment, counts) {
  if (!enrollment || !counts) return null;
  const done = counts.done || 0;
  const total = counts.total || 0;
  return {
    done,
    total,
    pct: total > 0 ? Math.round((done / total) * 100) : null,
  };
}

// Certification state from the stored expires_at — the records page's
// exact comparisons: expired when the date has passed; expiring soon
// when it falls inside the 30-day window and has not passed.
export function certState(cert, nowMs = Date.now()) {
  if (!cert || !cert.expires_at) return { expired: false, soon: false };
  const expires = new Date(cert.expires_at).getTime();
  if (Number.isNaN(expires)) return { expired: false, soon: false };
  const expired = expires < nowMs;
  const soon = !expired && expires < nowMs + EXPIRING_SOON_MS;
  return { expired, soon };
}

// The signed-in member's own training at a glance, from their own rows
// only: how many catalog courses they hold a certification for, which
// enrollments are still on the path (every stored status except
// certified — certified enrollments are represented by their
// certification), how many courses they have not started, and how many
// of their certifications are expired or expiring soon. The
// in-progress list keeps the loaded order (the page loads enrollments
// newest first).
export function summarizeMyTraining(courses, enrollments, certs, nowMs = Date.now()) {
  const certCourseIds = new Set((certs || []).map((c) => c.course_id));
  const enrolledCourseIds = new Set((enrollments || []).map((e) => e.course_id));
  const inProgress = (enrollments || []).filter((e) => e.status !== "certified");
  let expiredCerts = 0;
  let expiringSoonCerts = 0;
  for (const c of certs || []) {
    const s = certState(c, nowMs);
    if (s.expired) expiredCerts += 1;
    else if (s.soon) expiringSoonCerts += 1;
  }
  const notStarted = (courses || []).filter(
    (c) => !enrolledCourseIds.has(c.id) && !certCourseIds.has(c.id)
  ).length;
  return {
    certified: certCourseIds.size,
    inProgress,
    notStarted,
    expiredCerts,
    expiringSoonCerts,
  };
}
