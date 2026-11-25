"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

// Per-company feature toggles: turn off Shift Videos and/or Comm Book
// entirely. When off, the tabs hide and the end-shift sections are skipped.
//
// Walkthrough fix #29 (Wendy, 2026-11-19): this panel used to run its
// own select on the companies table on every dashboard load and print
// the raw database error ("permission denied for table companies") at
// the bottom of both dashboards when the column grant was missing.
// The app layout already loads these two flags with a tolerant select
// (and falls back gracefully), so the dashboard passes them in as the
// starting values and this panel only talks to the database when the
// owner actually saves. A save error still shows — that one is real
// and the owner caused it by tapping Save.
export default function CompanyFeatureToggles({ companyId, initialFlags, bookApplicable = false }) {
  const [saving, setSaving] = useState(false);
  const [flags, setFlags] = useState({
    videos: initialFlags?.videos !== false,
    book: initialFlags?.book !== false,
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
      window.dispatchEvent(new CustomEvent("workteams:policy-changed",{detail:{companyId,policy:data}}));
      setMessage("Feature switches saved.");
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
      <form onSubmit={save}>
        <label style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
          <input type="checkbox" checked={flags.videos}
            onChange={(e) => setFlags((f) => ({ ...f, videos: e.target.checked }))} />
          🎬 Shift Videos
        </label>
        {bookApplicable && <label style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
          <input type="checkbox" checked={flags.book}
            onChange={(e) => setFlags((f) => ({ ...f, book: e.target.checked }))} />
          📖 Communication Book
        </label>}

        <button type="submit" disabled={saving} className="btn btn-primary"
          style={{ cursor: saving ? "wait" : "pointer" }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
      {message && <p role="status" style={{ color: "var(--success-ink)" }}>{message}</p>}
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
    </section>
  );
}

