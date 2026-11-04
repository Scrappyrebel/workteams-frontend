"use client";

import { useEffect, useState } from "react";
import { useCompany } from "../../../../lib/company-context";
import { supabase } from "../../../../lib/supabase";
import { DEFAULT_TZ } from "../../../../lib/dates";
import { US_STATES } from "../../../../lib/rate-guidance";
import { planStanding, settingsCompleteness } from "../../../../lib/settings-summary";

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
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TZ);
  const [state, setState] = useState("");
  // Whether companies.state exists in this project's schema yet. Detected
  // tolerantly so Settings keeps saving before migration 042 is run.
  const [hasStateColumn, setHasStateColumn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // Team size for the at-a-glance panel (D-WT-40): a tolerant
  // probe — any failure leaves it null and the line is omitted.
  const [memberCount, setMemberCount] = useState(null);

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
          // D-WT-40 repair: the probe used to require a non-null
          // state before marking the column present, which
          // conflated "column missing" with "column present but
          // not set yet" — a company whose state was never set
          // could never set it (save omitted the field forever).
          // An error-free row means the column was served,
          // whether or not a value is stored yet.
          if (!error && data) {
            setHasStateColumn(true);
            if (data.state != null) setState(String(data.state));
          }
        });
      supabase()
        .from("company_members")
        .select("id")
        .eq("company_id", company.id)
        .then(({ data, error }) => {
          if (!error && data) setMemberCount(data.length);
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
      {company && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 10px" }}>Your company at a glance</h3>
          {(() => {
            const standing = planStanding(company);
            const completeness = settingsCompleteness({
              name,
              timezone,
              state,
              hasStateColumn,
            });
            return (
              <>
                <p style={{ margin: "0 0 6px" }}>
                  <strong>Plan:</strong>{" "}
                  {standing.tierName || "Not recorded"}
                  {standing.complimentary ? " (complimentary)" : ""}
                </p>
                <p style={{ margin: "0 0 6px" }}>
                  <strong>Subscription:</strong>{" "}
                  {standing.statusText || "Not recorded"}
                </p>
                {standing.sinceLabel && (
                  <p style={{ margin: "0 0 6px" }}>
                    <strong>Company since:</strong> {standing.sinceLabel}
                  </p>
                )}
                {memberCount != null && (
                  <p style={{ margin: "0 0 6px" }}>
                    <strong>Team members:</strong> {memberCount}
                  </p>
                )}
                <p style={{ margin: "0 0 6px" }}>
                  <strong>Settings on this page:</strong>{" "}
                  {completeness.filled} of {completeness.total} set
                  {completeness.missing.length > 0
                    ? " — still to set: " + completeness.missing.join(", ") + "."
                    : " — everything here is set."}
                </p>
                {completeness.stateUnavailable && (
                  <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 6px" }}>
                    State saving is not active in this workspace yet —
                    the State choice above will start saving once it is.
                  </p>
                )}
                <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>
                  Plan changes and billing live on the Plans page in
                  this company's menu — nothing about billing is
                  changed here. This panel only shows what is
                  already recorded for your company.
                </p>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
