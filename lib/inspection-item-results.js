// Per-item structured results for inspection checklists (migration
// 076, completion audit item A8).
//
// An inspection section's checklist has always been a list of labels
// the inspector ticked as passed, stored in the section's checklist
// jsonb. Migration 076 adds structured detail alongside it: for any
// checklist item the inspector can also record an outcome (pass /
// issue / N/A), a 0–5 score, and a note, saved as one row per item in
// public.inspection_checklist_results.
//
// Everything here is fail-soft, the established pattern (068/073/075):
// until migration 076 has run the table simply is not there, the calls
// below fail quietly, and inspections save and render exactly as they
// always have. A failed results write never breaks saving a section —
// the section record (score, notes, checklist, photos) is the record
// that matters; these rows are additive detail on top of it.

export const ITEM_OUTCOMES = [
  { value: "pass", label: "Pass" },
  { value: "issue", label: "Issue" },
  { value: "na", label: "N/A" },
];

export const ITEM_OUTCOME_LABELS = { pass: "Pass", issue: "Issue", na: "N/A" };

// Build the insert rows for one section from the form's per-item
// detail map ({ [itemLabel]: { outcome, score, note } }). Only items
// the inspector actually recorded something for produce a row; the
// rest are already covered by the section's checklist jsonb exactly
// as before. `orderedLabels` is the checklist in the order the form
// showed it, so rows keep that order for display.
export function buildItemResultRows(inspectionId, inspectionItemId, orderedLabels, details) {
  const rows = [];
  (orderedLabels || []).forEach((label, idx) => {
    const d = (details || {})[label];
    if (!d) return;
    const outcome = d.outcome || "";
    const score = d.score === "" || d.score === null || d.score === undefined ? null : parseInt(d.score, 10);
    const note = (d.note || "").trim();
    if (!outcome && score === null && !note) return;
    rows.push({
      inspection_id: inspectionId,
      inspection_item_id: inspectionItemId,
      item_label: label,
      outcome: outcome || null,
      score,
      note: note || null,
      sort_order: idx,
    });
  });
  return rows;
}

// Best-effort save: a results failure (including the table not
// existing yet) is swallowed — the section itself has already saved.
export async function saveItemResults(sb, rows) {
  if (!rows || rows.length === 0) return;
  try {
    await sb.from("inspection_checklist_results").insert(rows);
  } catch {
    // Item results are additive detail; the section record is what matters.
  }
}

// Load one inspection's results grouped by section id
// ({ [inspectionItemId]: [rows in checklist order] }). Any failure —
// above all the table not existing yet — returns {} and the caller
// renders sections exactly as it did before migration 076.
export async function loadItemResultsBySection(sb, inspectionId) {
  try {
    const { data, error } = await sb
      .from("inspection_checklist_results")
      .select("id, inspection_item_id, item_label, outcome, score, note, sort_order")
      .eq("inspection_id", inspectionId)
      .order("sort_order");
    if (error || !data) return {};
    const bySection = {};
    for (const r of data) {
      if (!bySection[r.inspection_item_id]) bySection[r.inspection_item_id] = [];
      bySection[r.inspection_item_id].push(r);
    }
    return bySection;
  } catch {
    return {};
  }
}
