"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";

const CATEGORIES = [
  { key: "arrival", label: "📍 Arrival", desc: "Clocked in / arrived at location" },
  { key: "client", label: "💬 Client", desc: "Something the client said or asked" },
  { key: "issue", label: "⚠️ Issue", desc: "Problem found on site" },
  { key: "note", label: "📝 Note", desc: "General note for the record" },
];

function CommBookPhoto({ path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data } = await sb.storage.from("inspection-photos").createSignedUrl(path, 3600);
      if (data?.signedUrl) setUrl(data.signedUrl);
    })();
  }, [path]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt="Book photo"
      style={{ width: "100%", maxWidth: 400, marginTop: 8, borderRadius: 8 }}
    />
  );
}

export default function CommBookPage() {
  const { company, member, loading } = useCompany();
  const [entries, setEntries] = useState([]);
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
        photoUrl = path;
      }
      const { error: dbErr } = await sb.from("comm_book").insert({
        company_id: company.id,
        member_id: member.id,
        location_id: form.location_id || null,
        category: form.category,
        message: form.message.trim(),
        photo_url: photoUrl,
      });
      if (dbErr) throw dbErr;
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
                  <CommBookPhoto path={e.photo_url} />
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
