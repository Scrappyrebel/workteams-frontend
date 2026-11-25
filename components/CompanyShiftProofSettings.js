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
  const [industry,setIndustry]=useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error: loadError } = await supabase()
        .from("companies")
        .select("industry_key,require_walkthrough_video,require_book_photo")
        .eq("id", companyId)
        .single();
      if (!live) return;
      if (data) setIndustry(data.industry_key || "");
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
        industry_key: industry || null,
        require_walkthrough_video: policy.video,
        require_book_photo: policy.book,
      })
      .eq("id", companyId)
      .select("industry_key,require_walkthrough_video,require_book_photo")
      .single();
    if (updateError || !data) {
      setError("Could not save proof settings: " + (updateError?.message || "Access denied"));
    } else {
      setPolicy({ video: data.require_walkthrough_video !== false, book: data.require_book_photo !== false });
      window.dispatchEvent(new CustomEvent("workteams:policy-changed",{detail:{companyId,policy:data}}));
      setMessage("Proof requirements saved for this company.");
    }
    setSaving(false);
  }

  return (
    <section className="panel" style={{ padding: 18, marginBottom: 18 }}>
      <h3 style={{ margin: "0 0 8px" }}>Shift Video & Communication Book Requirements</h3>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Video and Communication Book requirements have separate switches. The book is available only to cleaning companies. Site settings can make either item optional at one location. Missing proof never prevents saving actual finishing time.
      </p>
      {loading ? <p>Loading requirements…</p> : (
        <form onSubmit={save}>
          <label>Company work type <select value={industry} onChange={event=>setIndustry(event.target.value)}><option value="">Choose work type</option><option value="janitorial_cleaning">Cleaning / Janitorial</option><option value="staffing">Other staffing</option><option value="other">Other business</option></select></label>
          <label style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <input type="checkbox" checked={policy.video}
              onChange={(e) => setPolicy((p) => ({ ...p, video: e.target.checked }))} />
            Require end-of-shift video
            <strong style={{ color: policy.video ? "var(--success-ink)" : "var(--danger)" }}>
              {policy.video ? "— ON (active)" : "— OFF (optional)"}
            </strong>
          </label>
          {industry === "janitorial_cleaning" && <label style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <input type="checkbox" checked={policy.book}
              onChange={(e) => setPolicy((p) => ({ ...p, book: e.target.checked }))} />
            Require Communication Book photo
            <strong style={{ color: policy.book ? "var(--success-ink)" : "var(--danger)" }}>
              {policy.book ? "— ON (active)" : "— OFF (optional)"}
            </strong>
          </label>}

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

