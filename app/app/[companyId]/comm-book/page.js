"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { readEvidenceBlob, evidenceFilename, exportEvidence } from "../../../../lib/evidence-export";

const CATEGORIES = [
  { key: "arrival", label: "📍 Arrival", desc: "Clocked in / arrived at location" },
  { key: "client", label: "💬 Client", desc: "Something the client said or asked" },
  { key: "issue", label: "⚠️ Issue", desc: "Problem found on site" },
  { key: "note", label: "📝 Note", desc: "General note for the record" },
];

function CommBookPhoto({ path, canExport, label }) {
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportNote, setExportNote] = useState("");
  const [preparedShare, setPreparedShare] = useState(null);
  async function exportPhoto(share) {
    if (!canExport || exportBusy) return;
    setExportBusy(true); setExportError(""); setExportNote(""); setPreparedShare(null);
    try {
      const blob = await readEvidenceBlob(supabase(), "inspection-photos", path);
      const filename = evidenceFilename("book-photo", path, label);
      if (share) {
        setPreparedShare({ blob, filename });
        setExportNote("Book photo ready. Tap Open phone sharing options below to choose Gmail, email, or another app.");
      } else {
        const result = await exportEvidence(blob, filename, false);
        if (result === "downloaded") setExportNote("Photo copy saved. Attach the file to your email or customer dispute.");
      }
    } catch (err) { setExportError(err?.message || "Photo export failed."); }
    finally { setExportBusy(false); }
  }
  const [url, setUrl] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setUrl(null);
    setError("");
    (async () => {
      try {
        const sb = supabase();
        const { data, error: signError } = await sb.storage
          .from("inspection-photos")
          .createSignedUrl(path, 3600);
        if (signError) throw signError;
        if (!data?.signedUrl) throw new Error("No photo access link was returned.");
        if (active) setUrl(data.signedUrl);
      } catch (err) {
        console.error("Communication Book photo access error:", err);
        if (active) setError("The photo could not be opened. Try refreshing this page or signing in again.");
      }
    })();
    return () => { active = false; };
  }, [path]);
  if (error) return <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!url) return <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading book photo…</p>;
  return (
    <div style={{ marginTop: 8 }}>
      <img
        src={url}
        alt="Communication Book photo"
        loading="lazy"
        style={{ width: "100%", maxWidth: 400, borderRadius: 8 }}
        onError={() => setError("The saved photo could not be displayed. Refresh and try again.")}
      />
      <p style={{ margin: "4px 0", fontSize: 13 }}>
        <a href={url} target="_blank" rel="noopener noreferrer">Open original photo</a>
      </p>
      {canExport && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={exportBusy} onClick={() => void exportPhoto(true)}>
            {exportBusy ? "Preparing photo…" : "↗ Share book photo"}
          </button>
          <button type="button" disabled={exportBusy} onClick={() => void exportPhoto(false)}>↓ Save copy</button>
        </div>
      )}
      {preparedShare && canExport && (
        <div role="group" aria-label="Share prepared book photo" style={{ marginTop: 10, padding: 12, border: "2px solid var(--primary)", borderRadius: 10 }}>
          <strong>Photo ready — choose where to send it</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <button type="button" style={{ padding: "12px 16px", background: "var(--primary)", color: "#fff", fontWeight: 800, borderRadius: 8 }}
              onClick={() => void exportEvidence(preparedShare.blob, preparedShare.filename, true)
                .then((result) => {
                  if (result === "shared") {
                    setExportNote("Photo handed to your selected app. Complete sending from that app.");
                    setPreparedShare(null);
                  } else if (result === "cancelled") {
                    setExportNote("Phone sharing was cancelled or closed. Tap Open phone sharing options again or Save copy.");
                  } else {
                    setExportNote("The share menu could not open. A download was requested; check Files > Downloads, or try again.");
                  }
                }).catch((err) => setExportError(err?.message || "Phone sharing failed. Try Save copy."))}>
              ↗ Open phone sharing options
            </button>
            <button type="button" onClick={() => void exportEvidence(preparedShare.blob, preparedShare.filename, false)
              .then(() => setExportNote("Photo download requested. Check Downloads."))
              .catch((err) => setExportError(err?.message || "Could not save photo."))}>↓ Save copy instead</button>
            <button type="button" onClick={() => { setPreparedShare(null); setExportNote(""); }}>Cancel</button>
          </div>
        </div>
      )}
      {exportError && <p role="alert" style={{ color: "var(--danger)" }}>{exportError}</p>}
      {exportNote && <p role="status">{exportNote}</p>}
    </div>
  );
}

export default function CommBookPage() {
  const { company, member, loading } = useCompany();
  const [entries, setEntries] = useState([]);
  const [bookOverrides, setBookOverrides] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({ category: "note", location_id: "", message: "" });
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [respondingTo, setRespondingTo] = useState(null);
  const [responseText, setResponseText] = useState("");
  const photoRef = useRef(null);

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("comm_book")
      .select("id, category, message, photo_url, response, responded_at, created_at, location_id, member_id, company_members!comm_book_member_id_fkey(display_name), locations(name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setEntries(data || []);
    // Book-photo overrides (migration 052): shifts where the employee saved
    // an "I can't upload this" reason instead of a book photo. Manager
    // review only. Tolerant: table absent before the migration runs.
    try {
      const { data: ovs, error: ovError } = await sb
        .from("shift_proof_overrides")
        .select("id, proof_kind, reason, created_at, location_id, member_id, company_members!shift_proof_overrides_member_id_fkey(display_name), locations(name)")
        .eq("company_id", company.id)
        .eq("proof_kind", "book")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!ovError) setBookOverrides(ovs || []);
    } catch { /* overrides unavailable — log still renders */ }
    const { data: locs } = await sb
      .from("locations")
      .select("id, name")
      .eq("company_id", company.id)
      .order("name");
    setLocations(locs || []);
  }

  useEffect(() => {
    if (!loading && company?.id) load();
  }, [loading, company?.id]);

  async function handleSave() {
    setError("");
    if (!form.message.trim()) {
      setError("Write a message first.");
      return;
    }
    setSaving(true);
    try {
      const sb = supabase();
      let photoUrl = null;
      if (photo) {
        const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${company.id}/${member.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage.from("inspection-photos").upload(path, photo);
        if (upErr) throw new Error("Photo upload failed: " + upErr.message);
        const { data: photoReceipt, error: verifyError } =
          await sb.storage.from("inspection-photos").info(path);
        if (verifyError || !photoReceipt ||
            Number(photoReceipt.size) !== photo.size) {
          throw new Error("Communication Book photo was transferred but could not be verified. Keep the original and retry.");
        }
        photoUrl = path;
      }
      const { data: savedEntry, error: dbErr } = await sb.from("comm_book").insert({
        company_id: company.id,
        member_id: member.id,
        location_id: form.location_id || null,
        category: form.category,
        message: form.message.trim(),
        photo_url: photoUrl,
      }).select("id,company_id,member_id,photo_url").single();
      if (dbErr) throw dbErr;
      if (!savedEntry || savedEntry.company_id !== company.id ||
          savedEntry.member_id !== member.id ||
          savedEntry.photo_url !== photoUrl) {
        throw new Error("The Communication Book record could not be verified. Keep your entry and photo until it is confirmed.");
      }
      setForm({ category: "note", location_id: "", message: "" });
      setPhoto(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRespond(entry) {
    if (!responseText.trim()) return;
    const sb = supabase();
    await sb
      .from("comm_book")
      .update({
        response: responseText.trim(),
        responded_by: member.id,
        responded_at: new Date().toISOString(),
      })
      .eq("id", entry.id);
    setRespondingTo(null);
    setResponseText("");
    load();
  }

  async function handleDelete(entry) {
    if (!confirm("Delete this entry?")) return;
    const sb = supabase();
    await sb.from("comm_book").delete().eq("id", entry.id);
    load();
  }

  const catLabel = (key) => CATEGORIES.find((c) => c.key === key)?.label || key;

  if (loading) return <main className="site-shell"><p>Loading…</p></main>;

  return (
    <main className="site-shell">
      <h1>📖 Communication Book</h1>
      <p style={{ color: "var(--muted)" }}>
        Log arrivals, client requests, issues, and notes. Managers can respond right here.
      </p>

      {/* New entry */}
      <section className="panel" style={{ marginBottom: 20 }}>
        <h2>New entry</h2>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setForm({ ...form, category: c.key })}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: form.category === c.key ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: form.category === c.key ? "var(--primary-bg)" : "transparent",
                  fontWeight: form.category === c.key ? "bold" : "normal",
                }}
                title={c.desc}
              >
                {c.label}
              </button>
            ))}
          </div>
          <label>
            Location
            <select
              value={form.location_id}
              onChange={(e) => setForm({ ...form, location_id: e.target.value })}
              style={{ width: "100%", marginTop: 4 }}
            >
              <option value="">— Pick a location —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <label>
            Message
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={3}
              placeholder="What happened? What did the client say?"
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <div>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => setPhoto(e.target.files[0] || null)}
            />
            <button onClick={() => photoRef.current?.click()}>
              {photo ? `📷 ${photo.name}` : "📷 Add photo (optional)"}
            </button>
            {photo && (
              <button onClick={() => setPhoto(null)} style={{ marginLeft: 8, color: "var(--danger)" }}>
                ✕
              </button>
            )}
          </div>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "📝 Log it"}
          </button>
        </div>
      </section>

      {/* Book-photo overrides — manager review (never shown as photos) */}
      {isManager && bookOverrides.length > 0 && (
        <section className="panel" style={{ marginBottom: 20, border: "2px solid #e0a458", background: "#fffaf2" }}>
          <h2 style={{ marginTop: 0 }}>⚠ Book photo overrides — no photo uploaded</h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            These employees used the “I can&apos;t upload this” override for the required
            Communication Book photo. The reason they gave is shown with their name and location.
          </p>
          {bookOverrides.map((o) => (
            <div key={o.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
              <strong>{o.company_members?.display_name || "Someone"}</strong>
              {o.locations?.name ? <span> · 📍 {o.locations.name}</span> : null}
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                {" · "}{new Date(o.created_at).toLocaleString()}
              </span>
              <p style={{ margin: "4px 0 0" }}>Reason: “{o.reason}”</p>
            </div>
          ))}
        </section>
      )}

      {/* Entries */}
      <section className="panel">
        <h2>Log</h2>
        {entries.length === 0 && <p style={{ color: "var(--muted)" }}>Nothing logged yet.</p>}
        {entries.map((e) => (
          <div key={e.id} style={{ borderBottom: "1px solid var(--border)", padding: "12px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div>
                  <strong>{catLabel(e.category)}</strong>
                  {" · "}{e.company_members?.display_name || "Someone"}
                  {e.locations?.name && <span> · 📍 {e.locations.name}</span>}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  {new Date(e.created_at).toLocaleString()}
                </div>
                <p style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>{e.message}</p>
                {e.photo_url && (
                  <CommBookPhoto path={e.photo_url} canExport={isManager} label={e.locations?.name || "Communication-Book"} />
                )}
                {e.response ? (
                  <div style={{
                    background: "var(--primary-bg)",
                    borderLeft: "3px solid var(--primary)",
                    padding: "8px 12px",
                    marginTop: 8,
                    borderRadius: "0 8px 8px 0",
                  }}>
                    <strong>↩ Manager response</strong>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>
                      {" · "}{new Date(e.responded_at).toLocaleString()}
                    </span>
                    <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{e.response}</p>
                  </div>
                ) : isManager ? (
                  respondingTo === e.id ? (
                    <div style={{ marginTop: 8 }}>
                      <textarea
                        value={responseText}
                        onChange={(ev) => setResponseText(ev.target.value)}
                        rows={2}
                        placeholder="Write your response…"
                        style={{ width: "100%" }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button className="btn-primary" onClick={() => handleRespond(e)}>Send</button>
                        <button onClick={() => { setRespondingTo(null); setResponseText(""); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setRespondingTo(e.id)} style={{ marginTop: 4 }}>
                      ↩ Respond
                    </button>
                  )
                ) : null}
              </div>
              {isManager && (
                <button
                  onClick={() => handleDelete(e)}
                  style={{ color: "var(--danger)", alignSelf: "start" }}
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
