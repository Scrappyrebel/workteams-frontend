"use client";

import { useState } from "react";
import { formatMoney, formatPercent } from "../lib/commission";

/**
 * Commission modeler with try-any-number inputs: the owner (or, in
 * team mode, a manager) can test a different revenue, rate, payout
 * length, or flat amount and see the money — without changing the
 * company's saved commission settings.
 *
 * Props: settings (saved company settings), initialMonthlyRevenue.
 */
export default function CommissionModeler({ settings, initialMonthlyRevenue = "" }) {
  const [revenue, setRevenue] = useState(initialMonthlyRevenue === "" ? "" : String(initialMonthlyRevenue));
  const [source, setSource] = useState("salesperson_generated");
  const [rate, setRate] = useState("");
  const [months, setMonths] = useState("");
  const [flat, setFlat] = useState("");

  if (!settings) return null;

  const savedRatePct = source === "company_generated" ? settings.companyRatePercent : settings.salespersonRatePercent;
  const ratePct = rate === "" ? savedRatePct : Number(rate) || 0;
  const monthsNum = months === "" ? settings.payoutMonths : Math.max(1, Number(months) || settings.payoutMonths);
  const monthly = flat !== "" ? Number(flat) || 0 : (Number(revenue) || 0) * (ratePct / 100);
  const total = monthly * monthsNum;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={labelStyle}>
          Monthly collected revenue ($)
          <input type="number" min="0" step="any" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="e.g. 2000" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Sale source
          <select value={source} onChange={(e) => setSource(e.target.value)} style={inputStyle}>
            <option value="salesperson_generated">Salesperson-generated ({formatPercent(settings.salespersonRatePercent)} saved)</option>
            <option value="company_generated">Company-generated ({formatPercent(settings.companyRatePercent)} saved)</option>
          </select>
        </label>
        <label style={labelStyle}>
          Try a rate (%) — blank = saved rate
          <input type="number" min="0" max="100" step="any" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={String(savedRatePct)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Try payout months — blank = saved ({settings.payoutMonths})
          <input type="number" min="1" max="120" step="1" value={months} onChange={(e) => setMonths(e.target.value)} placeholder={String(settings.payoutMonths)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Try a flat monthly amount ($) — overrides %
          <input type="number" min="0" step="any" value={flat} onChange={(e) => setFlat(e.target.value)} placeholder={settings.flatMonthlyAmount !== null ? String(settings.flatMonthlyAmount) : "Optional"} style={inputStyle} />
        </label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <div className="portal-card" style={{ minHeight: 0, padding: "14px 18px", flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 800 }}>PER MONTH</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--brand-deep)" }}>{formatMoney(monthly)}</div>
        </div>
        <div className="portal-card" style={{ minHeight: 0, padding: "14px 18px", flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 800 }}>OVER {monthsNum} SERVICE MONTHS</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--brand-deep)" }}>{formatMoney(total)}</div>
        </div>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Modeling only — trying numbers here never changes the saved company settings. Commission is paid only on
        collected revenue: nothing accrues on uncollected revenue or canceled months, and renewals/add-ons earn
        nothing unless the owner changes the settings.
      </p>
    </div>
  );
}

const inputStyle = {
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
  marginTop: 6,
};

const labelStyle = { flex: 1, minWidth: 200, fontSize: "0.9rem", color: "var(--muted)" };
