"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUse } from "../../../../lib/tiers";
import { chicagoToday } from "../../../../lib/dates";
import { validatePhotoFile } from "../../../../lib/inspection-photos";

const emptyForm = { location_id: "", inspection_date: chicagoToday(), score: "5", notes: "" };
const SCORE_LABELS = { 1: "1 — Poor", 2: "2 — Fair", 3: "3 — Good", 4: "4 — Very good", 5: "5 — Excellent" };

export default function InspectionsPage() {
  const { company, member, loading } = useCompany();
  const [inspections, setInspections] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.effectiveTier || company?.tier, "inspections");

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("inspections")
      .select("id, inspection_date, score, notes, inspector_id, locations(name)")
      .eq("company_id", company.id)
      .order("inspection_date", { ascending: false });
    const rows = data || [];
    // Look up inspector names in one batch.
    const ids = [...new Set(rows.map((r) => r.inspector_id).filter(Boolean))];
    let names = {};
    if (ids.length > 0) {
      const { data: members } = await sb.from("company_members").select("id, display_name").in("id", ids);
      for (const m of members || []) names[m.id] = m.display_name;
    }
    setInspections(rows.map((r) => ({ ...r, inspector_name: names[r.inspector_id] || "Unknown inspector" })));
    const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    setLocations(locs || []);
  }

  useEffect(() => {
    if (!loading && company) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company]);

  async function save(e) {
    e.preventDefault();
    if (!form.location_id) {
      alert("Pick a location first.");
      return;
    }
    setSaving(true);
    const sb = supabase();
    const { data: insp, error } = await sb
      .from("inspections")
      .insert({
        company_id: company.id,
        location_id: form.location_id,
        inspector_id: member.id,
        inspection_date: form.inspection_date,
        score: parseInt(form.score, 10),
        notes: form.notes.trim() || null,
      })
      .select("id")
      .single();
    if (error) {
      setSaving(false);
      alert("Could not save inspection: " + error.message);
      return;
    }
    // Upload photos, if any.
    for (const file of photos) {
      const prob = validatePhotoFile(file);
      if (prob) {
        alert(prob);
        continue;
      }
      const path = `${company.id}/${insp.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await sb.storage.from("inspection-photos").upload(path, file);
      if (upErr) {
        alert("Photo upload failed: " + upErr.message);
        continue;
      }
      // Store the storage path; display uses short-lived signed URLs.
      await sb.from("inspection_photos").insert({
        inspection_id: insp.id,
        photo_url: path,
      });
    }
    setSaving(false);
    setForm(emptyForm);
    setPhotos([]);
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
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">INSPECTIONS</p>
      <h2 style={{ fontSize: "1.8rem" }}>Quality inspections</h2>

      {isManager && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>New inspection</h3>
          <form onSubmit={save} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <select
              value={form.location_id}
              onChange={(e) => setForm({ ...form, location_id: e.target.value })}
              style={input}
              required
            >
              <option value="">Choose a location…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                Date
                <input
                  type="date"
                  value={form.inspection_date}
                  onChange={(e) => setForm({ ...form, inspection_date: e.target.value })}
                  style={{ ...input, marginTop: 6 }}
                  required
                />
              </label>
              <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                Score
                <select value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} style={{ ...input, marginTop: 6 }}>
                  {Object.keys(SCORE_LABELS).map((s) => (
                    <option key={s} value={s}>{SCORE_LABELS[s]}</option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notes — what was checked, what needs attention…"
              rows={3}
              style={{ ...input, resize: "vertical" }}
            />
            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Photos (camera or gallery)
              <input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={(e) => setPhotos(Array.from(e.target.files || []))}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            {photos.length > 0 && <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{photos.length} photo(s) selected</p>}
            <button type="submit" disabled={saving} style={button}>
              {saving ? "Saving…" : "Save inspection"}
            </button>
          </form>
        </section>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {inspections.length === 0 && <p style={{ color: "var(--muted)" }}>No inspections yet.</p>}
        {inspections.map((i) => (
          <Link
            key={i.id}
            href={`/app/${company.id}/inspections/${i.id}`}
            className="portal-card"
            style={{ minHeight: 0, padding: "16px 20px", textDecoration: "none", color: "inherit" }}
          >
            <span className="card-kicker">
              {i.inspection_date} • {i.locations?.name || "No location"} • {"★".repeat(i.score || 0)}
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

const input = {
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  width: "100%",
};

const button = {
  padding: "12px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
