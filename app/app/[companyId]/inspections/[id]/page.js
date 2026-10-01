"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { canUse } from "../../../../../lib/tiers";
import { storagePathFromUrl, validatePhotoFile, withSignedUrls } from "../../../../../lib/inspection-photos";

const SCORE_LABELS = { 1: "1 — Poor", 2: "2 — Fair", 3: "3 — Good", 4: "4 — Very good", 5: "5 — Excellent" };

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
    setInspection(insp);
    let inspectorName = "Unknown inspector";
    if (insp.inspector_id) {
      const { data: m } = await sb.from("company_members").select("display_name").eq("id", insp.inspector_id).single();
      if (m) inspectorName = m.display_name;
    }
    setInspection({ ...insp, inspector_name: inspectorName });
    const { data: ph } = await sb.from("inspection_photos").select("*").eq("inspection_id", inspectionId).order("created_at");
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

  async function removePhoto(id, url) {
    if (!confirm("Delete this photo?")) return;
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

      <h3>Photos ({photos.length})</h3>
      {photos.length === 0 && <p style={{ color: "var(--muted)" }}>No photos yet.</p>}
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
