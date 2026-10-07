"use client";

import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const CATS = [
  { key: "arrival", label: "📍 Arrival" },
  { key: "client", label: "💬 Client" },
  { key: "issue", label: "⚠️ Issue" },
  { key: "note", label: "📝 Note" },
];

// Compact comm-book entry for embedding in the Time Clock page.
// Props: companyId, memberId, locationId (auto-filled), locationName, onDone
export default function CommBookQuick({ companyId, memberId, locationId, locationName, onDone }) {
  const [cat, setCat] = useState("note");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const photoRef = useRef(null);

  async function save() {
    setError("");
    if (!message.trim()) { setError("Write a message first."); return; }
    setSaving(true);
    try {
      const sb = supabase();
      let photoUrl = null;
      if (photo) {
        const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${companyId}/${memberId}/${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage.from("inspection-photos").upload(path, photo);
        if (upErr) throw new Error("Photo upload failed.");
        photoUrl = path;
      }
      const { error: dbErr } = await sb.from("comm_book").insert({
        company_id: companyId,
        member_id: memberId,
        location_id: locationId || null,
        category: cat,
        message: message.trim(),
        photo_url: photoUrl,
      });
      if (dbErr) throw dbErr;
      setDone(true); setMessage(""); setPhoto(null); setCat("note");
      onDone && onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div style={{ padding: "12px", background: "#e6f4ea", borderRadius: 8, textAlign: "center" }}>
        ✅ Logged{locationName ? ` for ${locationName}` : ""}!
        <br />
        <button onClick={() => setDone(false)} style={{ marginTop: 8 }}>Log another</button>
      </div>
    );
  }

  return (
    <div>
      {error && <p style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{error}</p>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            style={{
              padding: "8px 10px", fontSize: "0.88rem", borderRadius: 8,
              border: cat === c.key ? "2px solid var(--primary)" : "1px solid var(--border)",
              background: cat === c.key ? "var(--primary-bg)" : "transparent",
              fontWeight: cat === c.key ? "bold" : "normal",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        placeholder={locationName ? `Anything to report at ${locationName}?` : "Anything to report?"}
        style={{ width: "100%", marginBottom: 8, boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={(e) => setPhoto(e.target.files[0] || null)} />
        <button onClick={() => photoRef.current?.click()} style={{ fontSize: "0.9rem" }}>
          {photo ? `📷 ${photo.name.slice(0, 18)}…` : "📷 Photo"}
        </button>
        <button onClick={save} disabled={saving}
          style={{ flex: 1, padding: "12px", fontWeight: 700 }}>
          {saving ? "Saving…" : "📝 Log it"}
        </button>
      </div>
    </div>
  );
}
