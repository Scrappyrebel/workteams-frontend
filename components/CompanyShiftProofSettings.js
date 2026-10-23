"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Company-level proof requirements, enforced by the clock-out completion
// API. Both requirements are ON by default for every company (migration
// 052); the ONLY way one turns off is an owner/manager deliberately
// unchecking it here. Tolerant read: a value the API cannot serve yet
// resolves to REQUIRED (the spec default), matching lib/proof-policy.
export default function CompanyShiftProofSettings({ companyId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policy, setPolicy] = useState({ video: true, book: true });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error: loadError } = await supabase()
        .from("companies")
        .select("require_walkthrough_video,require_book_photo")
        .eq("id", companyId)
        .single();
      if (!live) return;
      if (loadError) {
        // Missing/unreadable = required (spec default ON), never a lockout.
        setPolicy({ video: true, book: true });
        setMessage("Saved settings could not be read, so both requirements are shown as ON — the default. Saving stores your choice.");
      } else setPolicy({
        video: data.require_walkthrough_video !== false,
        book: data.require_book_photo !== false,
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
    // Company RLS authorizes owner/admin updates; no service-role key is used.
    const { data, error: updateError } = await supabase()
      .from("companies")
      .update({
        require_walkthrough_video: policy.video,
        require_book_photo: policy.book,
      })
      .eq("id", companyId)
      .select("require_walkthrough_video,require_book_photo")
      .single();
    if (updateError || !data) {
      setError("Could not save proof settings: " + (updateError?.message || "Access denied"));
    } else {
      setPolicy({ video: data.require_walkthrough_video !== false, book: data.require_book_photo !== false });
      setMessage("Proof requirements saved for this company.");
    }
    setSaving(false);
  }

  return (
    <section className="panel" style={{ padding: 18, marginBottom: 18 }}>
      <h3 style={{ margin: "0 0 8px" }}>Shift Video & Communication Book Requirements</h3>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Both requirements are <strong>ON and active by default</strong> for this
        company: at clock-out, employees must provide the end-of-shift video and
        the Communication Book photo (or save an override reason a manager can
        review). Unchecking a switch here is the only way to make that proof
        optional; employees can still submit it when needed.
      </p>
      {loading ? <p>Loading requirements…</p> : (
        <form onSubmit={save}>
          <label style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <input type="checkbox" checked={policy.video}
              onChange={(e) => setPolicy((p) => ({ ...p, video: e.target.checked }))} />
            Require end-of-shift video
          </label>
          <label style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <input type="checkbox" checked={policy.book}
              onChange={(e) => setPolicy((p) => ({ ...p, book: e.target.checked }))} />
            Require Communication Book photo
          </label>
          <button type="submit" disabled={saving} className="btn btn-primary"
            style={{ cursor: saving ? "wait" : "pointer" }}>
            {saving ? "Saving…" : "Save Requirements"}
          </button>
        </form>
      )}
      {message && <p role="status" style={{ color: "var(--success-ink)" }}>{message}</p>}
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
    </section>
  );
}
