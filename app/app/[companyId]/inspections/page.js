"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { useClockedIn, requireClockedIn } from "../../../../lib/use-clocked-in";
import { isSupervisorRole } from "../../../../lib/roles";
import { canUseWithRole } from "../../../../lib/tiers";
import { chicagoToday } from "../../../../lib/dates";
import { validatePhotoFile } from "../../../../lib/inspection-photos";
import { INSPECTION_STARTERS, starterById } from "../../../../lib/inspection-starters";
import InspectionChecklistDetails from "../../../../components/InspectionChecklistDetails";
import { buildItemResultRows, saveItemResults } from "../../../../lib/inspection-item-results";

const SCORE_LABELS = { 1: "1 — Poor", 2: "2 — Fair", 3: "3 — Good", 4: "4 — Very good", 5: "5 — Excellent" };
const CHECKLIST = [
  "Floors vacuumed / mopped — no debris or stains",
  "Dusting — desks, shelves, blinds, vents",
  "Trash emptied — liners replaced",
  "Glass & mirrors — streak-free",
  "Restroom fixtures — toilets, sinks, mirrors cleaned",
  "Restroom stocked — soap, paper towels, toilet paper",
  "Kitchen / break room — counters, sink, microwave wiped",
  "High-touch areas disinfected — handles, switches",
];
const emptySection = { name: "", score: "5", notes: "", photos: [], checks: [], itemDetails: {} };

export default function InspectionsPage() {
  const { company, member, loading } = useCompany();
  const { clockedIn } = useClockedIn();
  const [inspections, setInspections] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [inspDate, setInspDate] = useState(chicagoToday());
  // Recompute the default once the company's timezone is known.
  useEffect(() => {
    if (company?.timezone) setInspDate(chicagoToday(company.timezone));
  }, [company?.timezone]);
  const [activeId, setActiveId] = useState(null);
  const [sections, setSections] = useState([]);
  const [newSection, setNewSection] = useState(emptySection);
  const [saving, setSaving] = useState(false);
  const [overallNotes, setOverallNotes] = useState("");
  // Section plan: a starter template or the structure of a previous
  // inspection. It pre-fills section names one at a time (with the focus
  // checklist items and a look-for note for starters). Scores, checklist
  // passes, notes, and photos are always entered live by the inspector.
  const [startFrom, setStartFrom] = useState("blank");
  const [plan, setPlan] = useState(null);
  const [planPos, setPlanPos] = useState(0);

  const canInspect = isSupervisorRole(member?.role);
  const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "inspections", member?.role);

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("inspections")
      .select("id, location_id, inspection_date, score, notes, inspector_id, locations(name)")
      .eq("company_id", company.id)
      .order("inspection_date", { ascending: false });
    const rows = data || [];
    const ids = [...new Set(rows.map((r) => r.inspector_id).filter(Boolean))];
    let names = {};
    if (ids.length > 0) {
      const { data: members } = await sb.from("team_directory").select("id, display_name").in("id", ids);
      for (const m of members || []) names[m.id] = m.display_name;
    }
    // Count sections per inspection.
    const { data: items } = await sb.from("inspection_items").select("inspection_id");
    const counts = {};
    for (const it of items || []) counts[it.inspection_id] = (counts[it.inspection_id] || 0) + 1;
    setInspections(rows.map((r) => ({
      ...r,
      inspector_name: names[r.inspector_id] || "Unknown inspector",
      section_count: counts[r.id] || 0,
    })));
    const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    setLocations(locs || []);
  }

  useEffect(() => {
    if (!loading && company) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company]);

  async function startInspection() {
    if (!requireClockedIn(clockedIn, "start an inspection")) return;
    if (!locationId) { alert("Pick a location first."); return; }
    setSaving(true);
    const sb = supabase();
    const { data, error } = await sb.from("inspections").insert({
      company_id: company.id,
      location_id: locationId,
      inspector_id: member.id,
      inspection_date: inspDate,
      notes: overallNotes.trim() || null,
    }).select("id").single();
    if (error) { setSaving(false); alert("Could not start inspection: " + error.message); return; }
    // Build the section plan, if one was chosen. A starter contributes its
    // sections with focus items and look-for notes; a copied inspection
    // contributes only its section names and order — never its scores,
    // checklist passes, notes, or photos.
    let nextPlan = null;
    if (startFrom.startsWith("starter:")) {
      const starter = starterById(startFrom.slice("starter:".length));
      if (starter) {
        nextPlan = {
          label: starter.name,
          sections: starter.sections.map((s) => ({ name: s.name, focus: s.focus || [], lookFor: s.lookFor || "" })),
        };
      }
    } else if (startFrom.startsWith("copy:")) {
      const { data: srcItems } = await sb
        .from("inspection_items")
        .select("section_name, sort_order")
        .eq("inspection_id", startFrom.slice("copy:".length))
        .order("sort_order");
      if (srcItems && srcItems.length > 0) {
        nextPlan = {
          label: "Copied inspection",
          sections: srcItems.map((s) => ({ name: s.section_name, focus: [], lookFor: "" })),
        };
      }
    }
    setSaving(false);
    setActiveId(data.id);
    setSections([]);
    setPlan(nextPlan);
    setPlanPos(0);
    setNewSection(nextPlan && nextPlan.sections.length > 0 ? { ...emptySection, name: nextPlan.sections[0].name } : emptySection);
  }

  // Move the plan to the section after `pos` and pre-fill its name.
  function advancePlan(pos) {
    if (!plan) return;
    const next = pos + 1;
    setPlanPos(next);
    setNewSection(next < plan.sections.length ? { ...emptySection, name: plan.sections[next].name } : emptySection);
  }

  function dropPlan() {
    setPlan(null);
    setPlanPos(0);
    setNewSection(emptySection);
  }

  async function addSection(e) {
    e.preventDefault();
    if (!requireClockedIn(clockedIn, "add an inspection section")) return;
    if (!newSection.name.trim()) { alert("Name the section (e.g. Lobby, Restrooms)."); return; }
    setSaving(true);
    const sb = supabase();
    const { data: item, error } = await sb.from("inspection_items").insert({
      inspection_id: activeId,
      section_name: newSection.name.trim(),
      score: parseInt(newSection.score, 10),
      notes: newSection.notes.trim() || null,
      checklist: newSection.checks,
      sort_order: sections.length,
    }).select("id").single();
    if (error) { setSaving(false); alert("Could not add section: " + error.message); return; }
    // Upload this section's photos.
    for (const file of newSection.photos) {
      const prob = validatePhotoFile(file);
      if (prob) { alert(prob); continue; }
      const path = `${company.id}/${activeId}/${item.id}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await sb.storage.from("inspection-photos").upload(path, file);
      if (upErr) { alert("Photo upload failed: " + upErr.message); continue; }
      await sb.from("inspection_photos").insert({ inspection_id: activeId, inspection_item_id: item.id, photo_url: path });
    }
    // Per-item structured results (migration 076) ride along with the
    // section — best-effort, so a pre-076 database saves the section
    // exactly as it always has.
    await saveItemResults(sb, buildItemResultRows(activeId, item.id, orderedChecklist, newSection.itemDetails));
    setSaving(false);
    setSections([...sections, { ...newSection, id: item.id, photoCount: newSection.photos.length }]);
    if (plan && planPos < plan.sections.length) advancePlan(planPos);
    else setNewSection(emptySection);
  }

  async function finishInspection() {
    // Compute overall score as the average of section scores.
    if (sections.length > 0) {
      const avg = Math.round(sections.reduce((s, x) => s + parseInt(x.score, 10), 0) / sections.length);
      await supabase().from("inspections").update({ score: avg }).eq("id", activeId);
    }
    setActiveId(null);
    setSections([]);
    setLocationId("");
    setOverallNotes("");
    setStartFrom("blank");
    setPlan(null);
    setPlanPos(0);
    load();
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed) {
    return (
      <div>
        <p className="eyebrow">INSPECTIONS</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Inspections</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Quality checks with photos are a <strong>Plus</strong> feature.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>See plans →</Link>
        </section>
      </div>
    );
  }

  const activeLocation = locations.find((l) => l.id === locationId);
  const planSection = plan && planPos < plan.sections.length ? plan.sections[planPos] : null;
  const planFocus = new Set(planSection?.focus || []);
  const orderedChecklist = planSection
    ? [...CHECKLIST.filter((c) => planFocus.has(c)), ...CHECKLIST.filter((c) => !planFocus.has(c))]
    : CHECKLIST;

  return (
    <div>
      <p className="eyebrow">INSPECTIONS</p>
      <h2 style={{ fontSize: "1.8rem" }}>Quality inspections</h2>

      {canInspect && !activeId && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>New inspection</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            One inspection per visit — you'll add room-by-room sections inside it.
          </p>
          <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={input} required>
              <option value="">Choose a location…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Date
              <input type="date" value={inspDate} onChange={(e) => setInspDate(e.target.value)} style={{ ...input, marginTop: 6 }} required />
            </label>
            <textarea value={overallNotes} onChange={(e) => setOverallNotes(e.target.value)}
              placeholder="Overall notes (optional)…" rows={2} style={{ ...input, resize: "vertical" }} />
            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Start from
              <select value={startFrom}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartFrom(v);
                  if (v.startsWith("copy:")) {
                    const src = inspections.find((i) => i.id === v.slice("copy:".length));
                    if (src?.location_id) setLocationId(src.location_id);
                  }
                }}
                style={{ ...input, marginTop: 6 }}>
                <option value="blank">Blank — I'll build the sections as I go</option>
                <optgroup label="Starter templates">
                  {INSPECTION_STARTERS.map((s) => (
                    <option key={s.id} value={`starter:${s.id}`}>{s.name} ({s.sections.length} sections)</option>
                  ))}
                </optgroup>
                {inspections.length > 0 && (
                  <optgroup label="Copy a previous inspection's sections">
                    {inspections.map((i) => (
                      <option key={i.id} value={`copy:${i.id}`}>
                        {i.inspection_date} — {i.locations?.name || "No location"} ({i.section_count} section{i.section_count === 1 ? "" : "s"})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            {startFrom.startsWith("starter:") && starterById(startFrom.slice("starter:".length)) && (
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
                {starterById(startFrom.slice("starter:".length)).blurb} The sections pre-fill one at a
                time — you still score, check, and photograph each one as you walk it.
              </p>
            )}
            {startFrom.startsWith("copy:") && (
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
                Only the section names and order are copied — never scores, checklist
                results, notes, or photos.
              </p>
            )}
            <button onClick={startInspection} disabled={saving} style={button}>
              {saving ? "Starting…" : "Start inspection →"}
            </button>
          </div>
        </section>
      )}

      {canInspect && activeId && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>📋 {activeLocation?.name} — {inspDate}</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            Add each room or area as its own section. Score it, note issues, snap photos as you go.
          </p>

          {plan && planSection && (
            <div style={{ border: "1px dashed var(--brand)", borderRadius: 12, padding: 12, marginBottom: 12, background: "var(--bg-soft)" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "0.9rem" }}>
                📋 Section plan — {plan.label}: section {planPos + 1} of {plan.sections.length}
              </p>
              {planSection.lookFor && (
                <p style={{ margin: "0 0 4px", fontSize: "0.88rem", color: "var(--muted)" }}>
                  Look for: {planSection.lookFor}
                </p>
              )}
              {planPos + 1 < plan.sections.length && (
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                  Still to come: {plan.sections.slice(planPos + 1).map((s) => s.name).join(", ")}
                </p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => advancePlan(planPos)} style={smallGhost}>Skip this section</button>
                <button type="button" onClick={dropPlan} style={smallGhost}>Drop the plan</button>
              </div>
            </div>
          )}
          {plan && !planSection && (
            <p style={{ fontSize: "0.9rem", color: "var(--muted)", margin: "0 0 12px" }}>
              ✅ Section plan complete — add any extra sections below, or finish the inspection.
            </p>
          )}

          {sections.map((s, i) => (
            <div key={s.id || i} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <p style={{ fontWeight: 800, margin: "0 0 4px" }}>
                {"★".repeat(parseInt(s.score, 10))} {s.name}
                {s.photoCount > 0 && <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: "0.85rem" }}> • {s.photoCount} photo(s)</span>}
              </p>
              {s.notes && <p style={{ fontSize: "0.9rem", color: "var(--muted)", margin: 0 }}>{s.notes}</p>}
            </div>
          ))}

          <form onSubmit={addSection} style={{ display: "grid", gap: 10, marginTop: 14, padding: 14, background: "var(--bg-soft)", borderRadius: 12 }}>
            <h4 style={{ margin: 0 }}>Add a section</h4>
            <input value={newSection.name} onChange={(e) => setNewSection({ ...newSection, name: e.target.value })}
              placeholder="Section name — e.g. Lobby, Restrooms, Break room…" style={input} required />
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                Score
                <select value={newSection.score} onChange={(e) => setNewSection({ ...newSection, score: e.target.value })} style={{ ...input, marginTop: 6 }}>
                  {Object.keys(SCORE_LABELS).map((sc) => <option key={sc} value={sc}>{SCORE_LABELS[sc]}</option>)}
                </select>
              </label>
              <label style={{ flex: 2, fontSize: "0.9rem", color: "var(--muted)" }}>
                Photos
                <input type="file" accept="image/*" multiple capture="environment"
                  onChange={(e) => setNewSection({ ...newSection, photos: Array.from(e.target.files || []) })}
                  style={{ ...input, marginTop: 6 }} />
              </label>
            </div>
            <textarea value={newSection.notes} onChange={(e) => setNewSection({ ...newSection, notes: e.target.value })}
              placeholder="Notes for this section — what needs attention…" rows={2} style={{ ...input, resize: "vertical" }} />
            <div style={{ display: "grid", gap: 6 }}>
              <p style={{ fontSize: "0.9rem", fontWeight: 700, margin: "4px 0 2px" }}>Checklist — tick what passed</p>
              <InspectionChecklistDetails
                items={orderedChecklist}
                focus={planFocus}
                checks={newSection.checks}
                details={newSection.itemDetails}
                onChange={({ checks, details }) => setNewSection({ ...newSection, checks, itemDetails: details })}
              />
            </div>
            {newSection.photos.length > 0 && <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>{newSection.photos.length} photo(s) selected</p>}
            <button type="submit" disabled={saving} style={secondaryBtn}>
              {saving ? "Adding…" : "+ Add this section"}
            </button>
          </form>

          <button onClick={finishInspection} style={{ ...button, marginTop: 14 }}>
            ✅ Done — save inspection ({sections.length} section{sections.length === 1 ? "" : "s"})
          </button>
        </section>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {inspections.length === 0 && <p style={{ color: "var(--muted)" }}>No inspections yet.</p>}
        {inspections.map((i) => (
          <Link key={i.id} href={`/app/${company.id}/inspections/${i.id}`}
            className="portal-card" style={{ minHeight: 0, padding: "16px 20px", textDecoration: "none", color: "inherit" }}>
            <span className="card-kicker">
              {i.inspection_date} • {i.locations?.name || "No location"} • {"★".repeat(i.score || 0)}
              {i.section_count > 0 && ` • ${i.section_count} section${i.section_count === 1 ? "" : "s"}`}
            </span>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
              {i.inspector_name}
              {i.notes ? ` — ${i.notes.slice(0, 80)}${i.notes.length > 80 ? "…" : ""}` : ""}
            </p>
            <span className="card-link">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const input = { padding: "11px 13px", borderRadius: 12, border: "1px solid var(--line)", fontSize: "1rem", width: "100%" };
const button = { padding: "12px", borderRadius: 999, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 800, cursor: "pointer" };
const secondaryBtn = { padding: "10px", borderRadius: 999, border: "1px solid var(--line)", background: "#fff", fontWeight: 700, cursor: "pointer" };
const smallGhost = { padding: "6px 14px", borderRadius: 999, border: "1px solid var(--line)", background: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" };
