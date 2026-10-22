"use client";

import { useEffect, useState } from "react";
import { useCompany } from "../../../../lib/company-context";
import { supabase } from "../../../../lib/supabase";
import { DEFAULT_TZ } from "../../../../lib/dates";
import TelegramEvidenceSetup from "./TelegramEvidenceSetup";
import { US_STATES } from "../../../../lib/rate-guidance";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern — New York" },
  { value: "America/Chicago", label: "Central — Chicago" },
  { value: "America/Denver", label: "Mountain — Denver" },
  { value: "America/Phoenix", label: "Arizona — Phoenix (no DST)" },
  { value: "America/Los_Angeles", label: "Pacific — Los Angeles" },
  { value: "America/Anchorage", label: "Alaska — Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii — Honolulu" },
];

export default function SettingsPage() {
  const { company, member } = useCompany();
  const [signupTelegramNotice, setSignupTelegramNotice] = useState(false);

  useEffect(() => {
    setSignupTelegramNotice(new URLSearchParams(window.location.search).get("telegram_setup") === "1");
  }, []);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TZ);
  const [state, setState] = useState("");
  // Whether companies.state exists in this project's schema yet. Detected
  // tolerantly so Settings keeps saving before migration 042 is run.
  const [hasStateColumn, setHasStateColumn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (company) {
      setName(company.name || "");
      setTimezone(company.timezone || DEFAULT_TZ);
      // Fetch state separately (not part of the layout's explicit company
      // column list): missing column or unset state both read as "".
      supabase()
        .from("companies")
        .select("state")
        .eq("id", company.id)
        .single()
        .then(({ data, error }) => {
          if (!error && data && data.state != null) {
            setHasStateColumn(true);
            setState(String(data.state));
          }
        });
    }
  }, [company]);

  if (member && member.role !== "owner") {
    return (
      <div style={{ padding: 24 }}>
        <p>Only the company owner can change settings.</p>
      </div>
    );
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    const sb = supabase();
    const payload = { name: name.trim(), timezone };
    // Only send state if the column exists; otherwise settings must still save.
    if (hasStateColumn) payload.state = state || null;
    const { error } = await sb
      .from("companies")
      .update(payload)
      .eq("id", company.id);
    setSaving(false);
    if (error) {
      setError("Could not save settings: " + error.message);
    } else {
      setSaved(true);
      // Refresh so the new timezone applies immediately.
      window.location.reload();
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <p className="eyebrow">COMPANY</p>
      <h2 style={{ fontSize: "1.6rem", margin: "4px 0 16px" }}>Settings</h2>
      {saved && (
        <div className="card" style={{ borderColor: "var(--ok)" }}>
          <strong>Settings saved.</strong>
        </div>
      )}
      {error && (
        <div className="card error-card">
          <strong>{error}</strong>
        </div>
      )}
      <form onSubmit={save}>
        <div className="card">
          <label style={{ fontWeight: 700 }}>Company name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 12, border: "1px solid var(--line)", fontSize: "1rem", marginTop: 8 }}
          />
        </div>
        <div className="card">
          <label style={{ fontWeight: 700 }}>Time zone</label>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "8px 0" }}>
            Used for "today" on the schedule and dashboard, late/no-show and
            overtime alert windows, and bid expiry dates.
          </p>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 12, border: "1px solid var(--line)", fontSize: "1rem" }}
          >
            {TIMEZONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="card">
          <label style={{ fontWeight: 700 }}>State</label>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "8px 0" }}>
            Used for state-adjusted reference rate ranges when bidding. Reference
            only — your own rates always take priority.
          </p>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 12, border: "1px solid var(--line)", fontSize: "1rem" }}
          >
            <option value="">— Set later —</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "12px 28px",
            borderRadius: 999,
            background: "var(--brand)",
            color: "#fff",
            fontWeight: 800,
            border: "none",
            fontSize: "1rem",
            cursor: "pointer",
          }}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
      {signupTelegramNotice && <p className="card" role="status">
        You chose optional private Telegram setup when creating this company.
        Only the owner needs Telegram; employees continue uploading in WorkTeams.
        Use the verification controls below. Uploads remain OFF until separately approved.
      </p>}
      <TelegramEvidenceSetup />
    </div>
  );
}
