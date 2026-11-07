"use client";

import { useEffect, useState } from "react";
import {
  STATE_PRICING,
  getStatePricing,
  estimateBillRate,
  COMP_JOB_TYPES,
} from "../../../../lib/temp-state-pricing";

// State pricing check: temp work is priced from the labor law of the
// state where the temp works. Verified states show their researched
// figures and a bill-rate estimator. Unverified states say so
// plainly and price NOTHING — the app never borrows another state's
// numbers, because a wrong number in a quote is a lawsuit risk.
export default function StatePricing({ companyId }) {
  const storeKey = `temp-pricing-state:${companyId}`;
  const [code, setCode] = useState("MO");
  const [pay, setPay] = useState("");
  const [jobType, setJobType] = useState("janitorial");
  const [markup, setMarkup] = useState("40");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved && getStatePricing(saved)) setCode(saved);
    } catch {}
  }, [storeKey]);

  function pick(next) {
    setCode(next);
    try {
      localStorage.setItem(storeKey, next);
    } catch {}
  }

  const st = getStatePricing(code);
  const est =
    st && st.verified && pay !== ""
      ? estimateBillRate(code, { payRate: pay, jobType, markupPct: markup })
      : null;
  const verifiedCount = STATE_PRICING.filter((s) => s.verified).length;

  return (
    <div style={{ marginTop: 28, borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 18, maxWidth: 560 }}>
      <h3 style={{ margin: "0 0 6px" }}>State pricing check</h3>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px" }}>
        Minimum wage, unemployment insurance, and workers' comp are set by the
        state where the temp works. {verifiedCount} of 50 states verified so
        far — a state that is not verified does not get priced here, at all.
      </p>
      <label style={{ fontSize: 13, fontWeight: 600 }}>
        State where the temp works
        <select
          value={code}
          onChange={(e) => pick(e.target.value)}
          style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }}
        >
          {STATE_PRICING.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name} ({s.code}){s.verified ? " — verified" : " — not verified yet"}
            </option>
          ))}
        </select>
      </label>

      {st && !st.verified && (
        <p role="note" style={{ fontSize: 14, background: "#fdf0ef", color: "#7a1f1a", padding: "10px 12px", borderRadius: 8, marginTop: 12 }}>
          <strong>{st.name} is not verified yet.</strong> We have not researched
          this state's wage, unemployment, and workers' comp figures, so this
          app will not estimate a rate for work there — and it will never
          quietly use another state's numbers in their place. Research for
          this state has to land before it can be quoted from here.
        </p>
      )}

      {st && st.verified && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, margin: "0 0 8px" }}>
            <span className="badge">Verified {st.verifiedOn}</span>{" "}
            <span style={{ color: "var(--muted)" }}>{st.source}</span>
          </p>
          <div style={{ fontSize: 14, display: "grid", gap: 4 }}>
            <div>Minimum wage: <strong>${st.minWage.toFixed(2)}/hr</strong> (from {st.minWageEffective})</div>
            <div>Unemployment (new employer): <strong>{st.uiNewEmployerRate}%</strong> on the first ${st.uiWageBase.toLocaleString()} of wages per worker per year</div>
            <div>Workers' comp benchmark, per $100 of payroll: clerical <strong>${st.compPer100.clerical.toFixed(2)}</strong> · janitorial <strong>${st.compPer100.janitorial.toFixed(2)}</strong> · factory / machine shop <strong>${st.compPer100.machineShop.toFixed(2)}</strong></div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{st.compNote}</div>
            <div>Final pay when a temp is let go: {st.finalPayDischarged}</div>
            <div>Pay schedule: {st.paySchedule}</div>
          </div>

          <div style={{ marginTop: 14, padding: 12, background: "var(--panel-2, #f6f7fb)", borderRadius: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Bill-rate estimator — {st.name}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13 }}>
                Temp pay ($/hr)
                <input type="number" min="0" step="0.01" value={pay}
                  onChange={(e) => setPay(e.target.value)}
                  style={{ display: "block", padding: 8, width: 110, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13 }}>
                Kind of work
                <select value={jobType} onChange={(e) => setJobType(e.target.value)}
                  style={{ display: "block", padding: 8, marginTop: 4 }}>
                  {COMP_JOB_TYPES.map((j) => (
                    <option key={j.key} value={j.key}>{j.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>
                Markup over loaded cost (%)
                <input type="number" min="0" step="1" value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
                  style={{ display: "block", padding: 8, width: 90, marginTop: 4 }} />
              </label>
            </div>
            {est && !est.ok && est.reason === "below_min_wage" && (
              <p role="alert" style={{ fontSize: 13, color: "#b3261e", fontWeight: 600, margin: "10px 0 0" }}>
                That pay is below {st.name}'s minimum wage of ${st.minWage.toFixed(2)}/hr — it cannot be quoted.
              </p>
            )}
            {est && est.ok && (
              <p style={{ fontSize: 14, margin: "10px 0 0" }}>
                Loaded cost <strong>${est.loadedPerHour.toFixed(2)}/hr</strong>
                {" "}(pay ${est.payPerHour.toFixed(2)} + comp ${est.compPerHour.toFixed(2)})
                {" "}→ bill rate <strong>${est.billPerHour.toFixed(2)}/hr</strong>.
                Unemployment adds about ${est.uiAnnualPerWorker.toFixed(2)} per
                full-time worker per year at this pay.
              </p>
            )}
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0" }}>
              The price has to carry the full loaded cost — pay, comp,
              unemployment, drive time, supplies — plus a share of overhead
              and profit. A rate that only covers the wage is a rate that
              loses money.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
