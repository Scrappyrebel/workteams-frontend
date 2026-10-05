"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { canUse } from "../../../../../lib/tiers";
import { storagePathFromUrl, validatePhotoFile, withSignedUrls } from "../../../../../lib/inspection-photos";

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

export default function InspectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { company, member, loading } = useCompany();
  const [inspection, setInspection] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const inspectionId = params.id;
  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.effectiveTier || company?.tier, "inspections");
  const [sections, setSections] = useState([]);
  const [newSecName, setNewSecName] = useState("");
  const [newSecScore, setNewSecScore] = useState("5");
  const [newSecNotes, setNewSecNotes] = useState("");
  const [newSecPhotos, setNewSecPhotos] = useState([]);
  const [newSecChecks, setNewSecChecks] = useState([]);
  const [secSaving, setSecSaving] = useState(false);
  const [editingSec, setEditingSec] = useState(null);

  async function load() {
    const sb = supabase();
    const { data: insp } = await sb
      .from("inspections")
      .select("*, locations(name)")
      .eq("id", inspectionId)
      .eq("company_id", company.id)
      .single();
    if (!insp) {
      router.replace(`/app/${company.id}/inspections`);
      return;
    }
    let inspectorName = "Unknown inspector";
    if (insp.inspector_id) {
      const { data: m } = await sb.from("team_directory").select("display_name").eq("id", insp.inspector_id).single();
      if (m) inspectorName = m.display_name;
    }
    setInspection({ ...insp, inspector_name: inspectorName });
    // Load sections with their photos.
    const { data: items } = await sb.from("inspection_items")
      .select("*, inspection_photos(*)")
      .eq("inspection_id", inspectionId)
      .order("sort_order");
    const withUrls = [];
    for (const it of items || []) {
      withUrls.push({ ...it, photos: await withSignedUrls(sb, it.inspection_photos || []) });
    }
    setSections(withUrls);
    // Legacy: photos attached directly to the inspection (no section).
    const { data: ph } = await sb.from("inspection_photos").select("*")
      .eq("inspection_id", inspectionId).is("inspection_item_id", null).order("created_at");
    setPhotos(await withSignedUrls(sb, ph || []));
  }

  useEffect(() => {
    if (!loading && company) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company]);

  async function addPhotos(e) {
    e.preventDefault();
    if (files.length === 0) return;
    setUploading(true);
    const sb = supabase();
    for (const file of files) {
      const prob = validatePhotoFile(file);
      if (prob) {
        alert(prob);
        continue;
      }
      const path = `${company.id}/${inspectionId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await sb.storage.from("inspection-photos").upload(path, file);
      if (upErr) {
        alert("Photo upload failed: " + upErr.message);
        continue;
      }
      await sb.from("inspection_photos").insert({ inspection_id: inspectionId, photo_url: path });
    }
    setUploading(false);
    setFiles([]);
    load();
  }

  async function addSectionToExisting(e) {
    e.preventDefault();
    if (!newSecName.trim()) { alert("Name the section first."); return; }
    setSecSaving(true);
    const sb = supabase();
    const { data: item, error } = await sb.from("inspection_items").insert({
      inspection_id: inspectionId,
      section_name: newSecName.trim(),
      score: parseInt(newSecScore, 10),
      notes: newSecNotes.trim() || null,
      checklist: newSecChecks,
      sort_order: sections.length,
    }).select("id").single();
    if (error) { setSecSaving(false); alert("Could not add section: " + error.message); return; }
    for (const file of newSecPhotos) {
      const prob = validatePhotoFile(file);
      if (prob) { alert(prob); continue; }
      const path = `${company.id}/${inspectionId}/${item.id}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await sb.storage.from("inspection-photos").upload(path, file);
      if (upErr) { alert("Photo upload failed: " + upErr.message); continue; }
      await sb.from("inspection_photos").insert({ inspection_id: inspectionId, inspection_item_id: item.id, photo_url: path });
    }
    setSecSaving(false);
    setNewSecName(""); setNewSecScore("5"); setNewSecNotes(""); setNewSecPhotos([]); setNewSecChecks([]);
    load();
  }

  async function saveSectionEdit(e) {
    e.preventDefault();
    if (!editingSec) return;
    const sb = supabase();
    const { error } = await sb.from("inspection_items").update({
      section_name: editingSec.section_name.trim(),
      score: parseInt(editingSec.score, 10),
      notes: editingSec.notes?.trim() || null,
      checklist: editingSec.checklist || [],
    }).eq("id", editingSec.id);
    if (error) { alert("Could not save: " + error.message); return; }
    setEditingSec(null);
    load();
  }

  async function deleteSection(id) {
    if (!confirm("Delete this section and its photos?")) return;
    const { error } = await supabase().from("inspection_items").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  async function removePhoto(id, url) {    if (!confirm("Delete this photo?")) return;
    const sb = supabase();
    const path = storagePathFromUrl(url);
    if (path) {
      await sb.storage.from("inspection-photos").remove([path]);
    }
    await sb.from("inspection_photos").delete().eq("id", id);
    load();
  }

  async function removeInspection() {
    if (!confirm("Delete this inspection and all its photos?")) return;
    const { error } = await supabase().from("inspections").delete().eq("id", inspectionId);
    if (error) alert("Could not delete: " + error.message);
    else router.replace(`/app/${company.id}/inspections`);
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
  if (!inspection) return <p>Loading…</p>;

  return (
    <div>
      <Link href={`/app/${company.id}/inspections`} style={{ color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.9rem" }}>
        ← All inspections
      </Link>
      <p className="eyebrow" style={{ marginTop: 12 }}>INSPECTION</p>
      <h2 style={{ fontSize: "1.8rem" }}>{inspection.locations?.name || "No location"}</h2>

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <p style={{ margin: "0 0 8px" }}>
          <strong>{inspection.inspection_date}</strong> • {SCORE_LABELS[inspection.score] || `Score ${inspection.score}`} • {inspection.inspector_name}
        </p>
        {inspection.notes && <p style={{ color: "var(--muted)", whiteSpace: "pre-wrap" }}>{inspection.notes}</p>}
        {isManager && (
          <button onClick={removeInspection} style={dangerButton}>
            Delete inspection
          </button>
        )}
      </section>

      {sections.length > 0 && (
        <>
          <h3>Sections ({sections.length})</h3>
          {sections.map((s) => (
            <section key={s.id} className="panel" style={{ padding: 18, margin: "12px 0" }}>
              {editingSec?.id === s.id ? (
                <form onSubmit={saveSectionEdit} style={{ display: "grid", gap: 10 }}>
                  <input value={editingSec.section_name}
                    onChange={(e) => setEditingSec({ ...editingSec, section_name: e.target.value })}
                    style={input} required />
                  <select value={editingSec.score}
                    onChange={(e) => setEditingSec({ ...editingSec, score: e.target.value })} style={input}>
                    {Object.keys(SCORE_LABELS).map((sc) => <option key={sc} value={sc}>{SCORE_LABELS[sc]}</option>)}
                  </select>
                  <div style={{ display: "grid", gap: 6 }}>
                    {CHECKLIST.map((item) => (
                      <label key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={(editingSec.checklist || []).includes(item)}
                          onChange={(e) => setEditingSec({
                            ...editingSec,
                            checklist: e.target.checked
                              ? [...(editingSec.checklist || []), item]
                              : (editingSec.checklist || []).filter((c) => c !== item),
                          })}
                          style={{ width: 18, height: 18 }} />
                        {item}
                      </label>
                    ))}
                  </div>
                  <textarea value={editingSec.notes || ""}
                    onChange={(e) => setEditingSec({ ...editingSec, notes: e.target.value })}
                    rows={2} style={{ ...input, resize: "vertical" }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={button}>Save</button>
                    <button type="button" onClick={() => setEditingSec(null)} style={secondaryBtn}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <p style={{ fontWeight: 800, margin: "0 0 6px", fontSize: "1.05rem" }}>
                    {"★".repeat(s.score || 0)}{"★".repeat(5 - (s.score || 0)).replace(/★/g, "☆")} {s.section_name}
                  </p>
                  {Array.isArray(s.checklist) && s.checklist.length > 0 && (
                    <ul style={{ margin: "0 0 8px", paddingLeft: 20, fontSize: "0.9rem", color: "#1e8e4d" }}>
                      {s.checklist.map((c, ci) => <li key={ci}>✓ {c}</li>)}
                    </ul>
                  )}
                  {s.notes && <p style={{ color: "var(--muted)", whiteSpace: "pre-wrap", margin: "0 0 10px" }}>{s.notes}</p>}
                  {s.photos.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginBottom: 8 }}>
                      {s.photos.map((p) => (
                        <a key={p.id} href={p.signed_url || undefined} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.signed_url || undefined} alt={p.caption || s.section_name} style={{ width: "100%", borderRadius: 10, display: "block" }} />
                        </a>
                      ))}
                    </div>
                  )}
                  {isManager && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setEditingSec({ ...s, score: String(s.score) })} style={smallBtn}>Edit</button>
                      <button onClick={() => deleteSection(s.id)} style={smallDanger}>Delete section</button>
                    </div>
                  )}
                </>
              )}
            </section>
          ))}
        </>
      )}

      {photos.length > 0 && <h3>General photos ({photos.length})</h3>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
        {photos.map((p) => (
          <div key={p.id} style={{ position: "relative" }}>
            <a href={p.signed_url || undefined} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.signed_url || undefined} alt={p.caption || "Inspection photo"} style={{ width: "100%", borderRadius: 12, display: "block" }} />
            </a>
            {isManager && (
              <button
                onClick={() => removePhoto(p.id, p.photo_url)}
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  border: "none",
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  borderRadius: 999,
                  width: 30,
                  height: 30,
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {isManager && (
        <section className="panel" style={{ padding: 22, marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Add a section</h3>
          <form onSubmit={addSectionToExisting} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <input value={newSecName} onChange={(e) => setNewSecName(e.target.value)}
              placeholder="Section name — e.g. Restrooms, Break room…" style={input} required />
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                Score
                <select value={newSecScore} onChange={(e) => setNewSecScore(e.target.value)} style={{ ...input, marginTop: 6 }}>
                  {Object.keys(SCORE_LABELS).map((sc) => <option key={sc} value={sc}>{SCORE_LABELS[sc]}</option>)}
                </select>
              </label>
              <label style={{ flex: 2, fontSize: "0.9rem", color: "var(--muted)" }}>
                Photos
                <input type="file" accept="image/*" multiple capture="environment"
                  onChange={(e) => setNewSecPhotos(Array.from(e.target.files || []))}
                  style={{ ...input, marginTop: 6 }} />
              </label>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <p style={{ fontSize: "0.9rem", fontWeight: 700, margin: "4px 0 2px" }}>Checklist — tick what passed</p>
              {CHECKLIST.map((item) => (
                <label key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={newSecChecks.includes(item)}
                    onChange={(e) => setNewSecChecks(e.target.checked
                      ? [...newSecChecks, item]
                      : newSecChecks.filter((c) => c !== item))}
                    style={{ width: 18, height: 18 }} />
                  {item}
                </label>
              ))}
            </div>
            <textarea value={newSecNotes} onChange={(e) => setNewSecNotes(e.target.value)}
              placeholder="Notes for this section…" rows={2} style={{ ...input, resize: "vertical" }} />
            <button type="submit" disabled={secSaving} style={button}>
              {secSaving ? "Adding…" : "+ Add this section"}
            </button>
          </form>
        </section>
      )}

      {isManager && (
        <section className="panel" style={{ padding: 22 }}>
          <h3 style={{ marginTop: 0 }}>Add photos</h3>
          <form onSubmit={addPhotos} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              style={input}
            />
            {files.length > 0 && <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{files.length} photo(s) selected</p>}
            <button type="submit" disabled={uploading || files.length === 0} style={button}>
              {uploading ? "Uploading…" : "Upload photos"}
            </button>
          </form>
        </section>
      )}
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

const dangerButton = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "7px 16px",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 10,
};

const secondaryBtn = {
  padding: "10px 20px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const smallBtn = {
  border: "1px solid var(--line)",
  background: "#fff",
  borderRadius: 999,
  padding: "6px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const smallDanger = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "6px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};
