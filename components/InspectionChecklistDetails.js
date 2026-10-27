"use client";

import { ITEM_OUTCOMES } from "../lib/inspection-item-results";

// The inspection checklist with optional per-item detail capture
// (migration 076, completion audit item A8).
//
// Renders the section form's checklist exactly as it always has — one
// checkbox per item, ticked = passed — and, under each item, a compact
// row of optional per-item detail controls: an outcome (Pass / Issue /
// N/A), a 0–5 score, and a note. Anything recorded there is saved as a
// structured row in inspection_checklist_results when the section is
// added; anything left blank behaves exactly as it did before.
//
// The two views of an item are kept in agreement: choosing "Pass"
// ticks the item's checkbox, choosing "Issue" or "N/A" unticks it,
// and unticking the checkbox clears a recorded "Pass" — so the
// section's ticked-passed list and its per-item results can never
// contradict each other.
//
// Fully controlled: the parent owns `checks` (the ticked labels) and
// `details` ({ [label]: { outcome, score, note } }) and receives both
// together through onChange, so the two never go out of step.
export default function InspectionChecklistDetails({ items, focus, checks, details, onChange }) {
  function detailFor(label) {
    return (details || {})[label] || { outcome: "", score: "", note: "" };
  }

  function emit(nextChecks, nextDetails) {
    onChange({ checks: nextChecks, details: nextDetails });
  }

  function toggleCheck(label, checked) {
    const nextChecks = checked
      ? [...checks, label]
      : checks.filter((c) => c !== label);
    let nextDetails = details || {};
    if (!checked && detailFor(label).outcome === "pass") {
      nextDetails = { ...nextDetails, [label]: { ...detailFor(label), outcome: "" } };
    }
    emit(nextChecks, nextDetails);
  }

  function chooseOutcome(label, outcome) {
    const nextDetails = { ...(details || {}), [label]: { ...detailFor(label), outcome } };
    let nextChecks = checks;
    if (outcome === "pass" && !checks.includes(label)) nextChecks = [...checks, label];
    if ((outcome === "issue" || outcome === "na") && checks.includes(label)) {
      nextChecks = checks.filter((c) => c !== label);
    }
    emit(nextChecks, nextDetails);
  }

  function setDetailField(label, field, value) {
    emit(checks, { ...(details || {}), [label]: { ...detailFor(label), [field]: value } });
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {(items || []).map((item) => {
        const d = detailFor(item);
        return (
          <div key={item}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}>
              <input type="checkbox" checked={checks.includes(item)}
                onChange={(e) => toggleCheck(item, e.target.checked)}
                style={{ width: 18, height: 18 }} />
              {item}
              {focus && focus.has(item) && (
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--brand-deep)" }}>⭐ focus</span>
              )}
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: 26, marginTop: 4 }}>
              <select value={d.outcome} onChange={(e) => chooseOutcome(item, e.target.value)}
                aria-label={`Result for: ${item}`} style={miniSelect}>
                <option value="">Result…</option>
                {ITEM_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={d.score} onChange={(e) => setDetailField(item, "score", e.target.value)}
                aria-label={`Score for: ${item}`} style={miniSelect}>
                <option value="">Score…</option>
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}
              </select>
              <input value={d.note} onChange={(e) => setDetailField(item, "note", e.target.value)}
                placeholder="Item note (optional)…" aria-label={`Note for: ${item}`}
                style={{ ...miniInput, flex: 1, minWidth: 150 }} />
            </div>
          </div>
        );
      })}
      <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0 }}>
        Per-item results are optional — record a result, a score, or a note for any item that needs one.
      </p>
    </div>
  );
}

const miniSelect = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  fontSize: "0.85rem",
  background: "#fff",
};

const miniInput = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  fontSize: "0.85rem",
};
