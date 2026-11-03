// Training course outline helpers (Depth D-WT-46) — pure, display-only.
//
// Everything here derives from rows the course page already loads:
// the course's stored training_steps (migration 021: step_number,
// title, description) and the signed-in member's stored
// training_step_progress rows. Nothing here performs a write or a
// network call, and nothing invents course content: the outline shows
// the stored step titles/descriptions exactly as stored, with the
// page's own fallbacks — the label is the STEP_DEFS label when one
// matches the step number, otherwise the stored title; the text is
// the stored description, otherwise the STEP_DEFS description. That
// is the identical precedence the enrolled step ladder already uses,
// so the pre-enrollment outline and the ladder can never disagree.
//
// There is deliberately NO objectives text here: training_courses
// stores no objectives field (021), and course content is not
// invented by display code.

// One outline row per stored step, in stored order.
export function courseOutlineRows(steps, stepDefs) {
  const defs = Array.isArray(stepDefs) ? stepDefs : [];
  return (Array.isArray(steps) ? steps : []).map((s) => {
    const def = defs.find((d) => d.n === s.step_number) || {};
    return {
      step_number: s.step_number,
      label: def.label || s.title || "",
      desc: s.description || def.desc || "",
    };
  });
}

// Progress through the course from the stored progress rows the page
// already loaded: how many of the course's steps carry a stored
// "completed" status. A step with no progress row counts as not
// completed — never as failed. Percent is a plain rounded share.
export function courseProgressSummary(steps, progress) {
  const list = Array.isArray(steps) ? steps : [];
  const map = progress && typeof progress === "object" ? progress : {};
  let completed = 0;
  for (const s of list) {
    if (map[s.id] && map[s.id].status === "completed") completed += 1;
  }
  const total = list.length;
  return {
    total,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
