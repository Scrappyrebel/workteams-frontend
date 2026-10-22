"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import {
  commissionPlanWording,
  isCompanyOwner,
  loadCommissionSettings,
} from "../../../../../lib/commission";
import WageBonusModeler from "../../../../../components/WageBonusModeler";

export default function CommissionSettingsPage() {
  const { company, member, loading: companyLoading } = useCompany();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    mode: "off",
    salespersonRatePercent: 8.5,
    companyRatePercent: 4.25,
    payoutMonths: 12,
    flatMonthlyAmount: null,
  });
  const [useFlat, setUseFlat] = useState(false);
  const [flatText, setFlatText] = useState("");

  const owner = isCompanyOwner(member);

  useEffect(() => {
    if (companyLoading) return;
    if (!company?.id) {
      setLoading(false);
      return;
    }
    (async () => {
      const sb = supabase();
      // Detect whether the migration has been run yet, tolerantly.
      const probe = await sb
        .from("company_commission_settings")
        .select("company_id")
        .eq("company_id", company.id)
        .maybeSingle();
      setTableMissing(Boolean(probe.error));
      const settings = await loadCommissionSettings(sb, company.id);
      setForm(settings);
      setUseFlat(settings.flatMonthlyAmount !== null);
      setFlatText(settings.flatMonthlyAmount !== null ? String(settings.flatMonthlyAmount) : "");
      setLoading(false);
    })();
  }, [company?.id, companyLoading]);

  async function save() {
    if (!company?.id || !owner) return;
    setSaving(true);
    setError("");
    setMessage("");
    const payload = {
      company_id: company.id,
      commission_mode: form.mode,
      salesperson_rate_percent: form.salespersonRatePercent,
      company_rate_percent: form.companyRatePercent,
      payout_months: Math.max(1, Math.round(form.payoutMonths || 12)),
      flat_monthly_amount: useFlat ? Number(flatText) || 0 : null,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await supabase()
      .from("company_commission_settings")
      .upsert(payload, { onConflict: "company_id" });
    if (saveError) {
      setTableMissing(true);
      setError(
        "Could not save commission settings: " +
          saveError.message +
          " (If the settings table does not exist yet, the database migration still needs to be run.)"
      );
      setSaving(false);
      return;
    }
    setMessage("Commission settings saved for this company.");
    setSaving(false);
  }

  if (companyLoading || loading) return <p>Loading commission settings…</p>;
  if (!owner) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: "1.6rem" }}>Commission &amp; Bonus Settings</h2>
        <p>Only the company owner can view or change these settings.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
      <p className="eyebrow">COMPANY</p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "1.6rem", margin: "4px 0 16px" }}>Commission &amp; Bonus Settings</h2>
        <Link
          href={`/app/${company.id}/settings`}
          style={{ marginLeft: "auto", color: "var(--brand-deep)", fontWeight: 700 }}
        >
          ← Back to Settings
        </Link>
      </div>
      <p style={{ color: "var(--muted)" }}>
        Owner-only. Choose whether this company has no commission tooling at all, an owner-only private calculator,
        or a team-visible commission plan. Settings apply to this company only.
      </p>

      {tableMissing && (
        <div className="card" style={{ borderColor: "#b45309", padding: 16 }}>
          <strong>Database setup still needed</strong>
          <p style={{ color: "var(--muted)" }}>
            The commission settings table does not exist yet, so the app is safely using mode &ldquo;off&rdquo; with
            the default rates. Run the company commission settings migration (052) in Supabase, then save here.
          </p>
        </div>
      )}
      {message && (
        <div className="card" style={{ borderColor: "var(--ok)", padding: 16 }}>
          <strong>{message}</strong>
        </div>
      )}
      {error && (
        <div className="card error-card" style={{ padding: 16 }}>
          <strong>{error}</strong>
        </div>
      )}

      <section className="card" style={{ padding: 18 }}>
        <label style={{ fontWeight: 700 }}>Commission mode</label>
        <select
          value={form.mode}
          onChange={(e) => setForm({ ...form, mode: e.target.value })}
          style={inputStyle}
        >
          <option value="off">Off — no commission screens, wording or links for anyone</option>
          <option value="owner">Owner only — calculator and settings only for the owner</option>
          <option value="team">Team — managers see the plan and commission projections</option>
        </select>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <label style={labelStyle}>
            Salesperson-generated rate (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.salespersonRatePercent}
              onChange={(e) => setForm({ ...form, salespersonRatePercent: Number(e.target.value) })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Company-generated rate (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.companyRatePercent}
              onChange={(e) => setForm({ ...form, companyRatePercent: Number(e.target.value) })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Payout duration (service months)
            <input
              type="number"
              min="1"
              max="120"
              step="1"
              value={form.payoutMonths}
              onChange={(e) => setForm({ ...form, payoutMonths: Number(e.target.value) })}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
            <input type="checkbox" checked={useFlat} onChange={(e) => setUseFlat(e.target.checked)} />
            Use a flat monthly amount instead of percentages
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={flatText}
            disabled={!useFlat}
            onChange={(e) => setFlatText(e.target.value)}
            placeholder="Flat amount per month ($)"
            style={inputStyle}
          />
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Commission is still paid only on collected revenue: no commission accrues on uncollected revenue or
          canceled months, and renewals/add-ons earn nothing unless you change these settings.
        </p>
        <button
          type="button"
          onClick={() => void save()}
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
          {saving ? "Saving…" : "Save Commission Settings"}
        </button>
      </section>

      {form.mode === "team" && (
        <section className="card" style={{ padding: 18, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Plan wording your team will see</h3>
          <p style={{ color: "var(--muted)" }}>
            Generated from the numbers above — it updates when your settings change.
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {commissionPlanWording({
              ...form,
              flatMonthlyAmount: useFlat ? Number(flatText) || 0 : null,
            }).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </section>
      )}

      {form.mode !== "off" && (
        <>
          <WageBonusModeler />
          <p style={{ color: "var(--muted)" }}>
            <Link href={`/app/${company.id}/commissions`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
              Open the Sales Commissions calculator →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  marginTop: 8,
};

const labelStyle = { fontWeight: 700, fontSize: "0.95rem" };
