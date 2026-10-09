"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Per-company feature toggles: turn off Shift Videos and/or Comm Book
// entirely. When off, the tabs hide and the end-shift sections are skipped.
export default function CompanyFeatureToggles({ companyId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flags, setFlags] = useState({ videos: true, book: true });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error: loadError } = await supabase()
        .from("companies")
        .select("enable_shift_videos,enable_comm_book")
        .eq("id", companyId)
        .single();
      if (!live) return;
      if (loadError) setError("Could not load feature settings: " + loadError.message);
      else setFlags({
        videos: data.enable_shift_videos !== false,
        book: data.enable_comm_book !== false,
      });
      setLoading(false);
    })();
    return () => { live = false; };
  }, [companyId]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const { data, error: updateError } = await supabase()
      .from("companies")
      .update({
        enable_shift_videos: flags.videos,
        enable_comm_book: flags.book,
      })
      .eq("id", companyId)
      .select("enable_shift_videos,enable_comm_book")
      .single();
    if (updateError || !data) {
      setError("Could not save: " + (updateError?.message || "Access denied"));
    } else {
      setFlags({
        videos: data.enable_shift_videos !== false,
        book: data.enable_comm_book !== false,
      });
      setMessage("Saved. The app will update on next page load.");
    }
    setSaving(false);
  }

  return (
    <section className="panel" style={{ padding: 18, marginBottom: 18 }}>
      <h3 style={{ margin: "0 0 8px" }}>Features On / Off</h3>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Turn off features your company doesn't use. When off, the tab disappears
        and employees won't see that section at clock-out.
      </p>
      {loading ? <p>Loading…</p> : (
        <form onSubmit={save}>
          <label style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <input type="checkbox" checked={flags.videos}
              onChange={(e) => setFlags((f) => ({ ...f, videos: e.target.checked }))} />
            🎬 Shift Videos
          </label>
          <label style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <input type="checkbox" checked={flags.book}
              onChange={(e) => setFlags((f) => ({ ...f, book: e.target.checked }))} />
            📖 Communication Book
          </label>
          <button type="submit" disabled={saving} className="btn btn-primary"
            style={{ cursor: saving ? "wait" : "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      )}
      {message && <p role="status" style={{ color: "var(--success-ink)" }}>{message}</p>}
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
    </section>
  );
}
