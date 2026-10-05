"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { isSupervisorRole } from "../../../../lib/roles";
import { canUse } from "../../../../lib/tiers";
import { chicagoToday } from "../../../../lib/dates";
import { validatePhotoFile } from "../../../../lib/inspection-photos";

const SCORE_LABELS = { 1: "1 — Poor", 2: "2 — Fair", 3: "3 — Good", 4: "4 — Very good", 5: "5 — Excellent" };
const emptySection = { name: "", score: "5", notes: "", photos: [] };

export default function InspectionsPage() {
  const { company, member, loading } = useCompany();
  const [inspections, setInspections] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [inspDate, setInspDate] = useState(chicagoToday());
  const [activeId, setActiveId] = useState(null);
  const [sections, setSections] = useState([]);
  const [newSection, setNewSection] = useState(emptySection);
  const [saving, setSaving] = useState(false);
  const [overallNotes, setOverallNotes] = useState("");

  const canInspect = isSupervisorRole(member?.role);
  const allowed = canUse(company?.effectiveTier || company?.tier, "inspections");

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("inspections")
      .select("id, inspection_date, score, notes, inspector_id, locations(name)")
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
    setSaving(false);
    if (error) { alert("Could not start inspection: " + error.message); return; }
    setActiveId(data.id);
    setSections([]);
    setNewSection(emptySection);
  }

  async function addSection(e) {
    e.preventDefault();
    if (!newSection.name.trim()) { alert("Name the section (e.g. Lobby, Restrooms)."); return; }
    setSaving(true);
    const sb = supabase();
    const { data: item, error } = await sb.from("inspection_items").insert({
      inspection_id: activeId,
      section_name: newSection.name.trim(),
      score: parseInt(newSection.score, 10),
      notes: newSection.notes.trim() || null,
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
    setSaving(false);
    setSections([...sections, { ...newSection, id: item.id, photoCount: newSection.photos.length }]);
    setNewSection(emptySection);
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
              placeholder="Notes for this section — what was checked, what needs attention…" rows={2} style={{ ...input, resize: "vertical" }} />
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
