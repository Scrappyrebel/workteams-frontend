"use client";

import { useState } from "react";
import { formatMoney } from "../lib/commission";

/**
 * Owner-only wage-% bonus modeler: enter an employee's yearly wages
 * and a percentage; the % and the $ amount are shown side by side so
 * the owner can size a bonus (e.g. for a bonus letter they write).
 * This component must only be rendered for the company owner when the
 * company's commission mode is not "off" — it is never employee-visible.
 */
export default function WageBonusModeler() {
  const [yearlyWages, setYearlyWages] = useState("");
  const [percent, setPercent] = useState("3");
  const wages = Number(yearlyWages) || 0;
  const pct = Number(percent) || 0;
  const amount = (wages * pct) / 100;
  return (
    <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
      <h3 style={{ marginTop: 0 }}>Wage-% Bonus Modeler (Owner Only)</h3>
      <p style={{ color: "var(--muted)" }}>
        Model an annual bonus as a percentage of an employee&apos;s yearly wages. This is a private
        owner planning tool — it is not a published plan and employees never see it.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={{ flex: 1, minWidth: 180, fontSize: "0.9rem", color: "var(--muted)" }}>
          Employee yearly wages ($)
          <input
            type="number"
            min="0"
            step="0.01"
            value={yearlyWages}
            onChange={(e) => setYearlyWages(e.target.value)}
            placeholder="e.g. 42000"
            style={inputStyle}
          />
        </label>
        <label style={{ flex: 1, minWidth: 180, fontSize: "0.9rem", color: "var(--muted)" }}>
          Bonus percentage (%)
          <input
            type="number"
            min="0"
            step="0.1"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            placeholder="e.g. 3"
            style={inputStyle}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <div className="portal-card" style={{ minHeight: 0, padding: "14px 18px", flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 800 }}>BONUS PERCENTAGE</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--brand-deep)" }}>
            {pct.toLocaleString(undefined, { maximumFractionDigits: 2 })}%
          </div>
        </div>
        <div className="portal-card" style={{ minHeight: 0, padding: "14px 18px", flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 800 }}>BONUS AMOUNT</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--brand-deep)" }}>{formatMoney(amount)}</div>
        </div>
      </div>
      <p style={{ color: "var(--muted)", marginTop: 10 }}>
        Side by side: {pct.toLocaleString(undefined, { maximumFractionDigits: 2 })}% of {formatMoney(wages)} in
        yearly wages = <strong>{formatMoney(amount)}</strong>.
      </p>
    </section>
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
