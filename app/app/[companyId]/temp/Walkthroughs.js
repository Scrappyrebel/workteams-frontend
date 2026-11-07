"use client";

import { useEffect, useState } from "react";
import { TEMP_WALKTHROUGH_TEMPLATES } from "../../../../lib/temp-walkthroughs";

// Field-sales walkthroughs for the temp service: one tap-through
// template per industry line, worked on the tablet at the client's
// site, ending in a quote worksheet so the client can be quoted on
// the spot. Progress is kept on this device (same pattern as the
// Playbook checklists) until a walkthrough-records table lands —
// DATABASE NEED flagged in the PR.
export default function Walkthroughs({ lanes }) {
  const [lane, setLane] = useState(lanes?.[0] || "cleaning");
  const template =
    TEMP_WALKTHROUGH_TEMPLATES.find((t) => t.lane === lane) ||
    TEMP_WALKTHROUGH_TEMPLATES[0];
  const storeKey = `temp-walkthrough:${lane}`;
  const [rec, setRec] = useState({ client: "", checked: {}, quote: {} });

  useEffect(() => {
    try {
      setRec(JSON.parse(localStorage.getItem(storeKey) || '{"client":"","checked":{},"quote":{}}'));
    } catch {
      setRec({ client: "", checked: {}, quote: {} });
    }
  }, [storeKey]);

  function save(next) {
    setRec(next);
    try {
      localStorage.setItem(storeKey, JSON.stringify(next));
    } catch {}
  }

  const totalItems = template.sections.reduce((n, s) => n + s.items.length, 0);
  const doneItems = Object.values(rec.checked || {}).filter(Boolean).length;
  const q = rec.quote || {};
  const positions = parseFloat(q.positions) || 0;
  const hours = parseFloat(q.hours) || 0;
  const bill = parseFloat(q.billRate) || 0;
  const weekly = positions * hours * bill;

  return (
    <section className="panel" style={{ padding: 24, marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Sales walkthroughs</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        Walk the client's site with the template for their industry and tap off
        everything they expect for the jobs they want filled — then quote them
        before you leave. The factory template's safety section is your OSHA
        verification record: complete it on every factory walkthrough.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {TEMP_WALKTHROUGH_TEMPLATES.map((t) => (
          <button
            key={t.lane}
            onClick={() => setLane(t.lane)}
            className={lane === t.lane ? "btn-primary" : "btn-ghost"}
            style={{ padding: "8px 16px" }}
          >
            {t.label}
            {lanes && !lanes.includes(t.lane) ? " (not a lane you run)" : ""}
          </button>
        ))}
      </div>

      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
        Client / site name
        <input
          value={rec.client || ""}
          onChange={(e) => save({ ...rec, client: e.target.value })}
          placeholder="e.g. Acme Packaging — Plant 2"
          style={{ display: "block", width: "100%", padding: 10, marginTop: 4, fontWeight: 400 }}
        />
      </label>

      <p style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>
        Say on arrival: “{template.openingLine}”
      </p>
      <p style={{ fontSize: 13, fontWeight: 600 }}>
        {doneItems} of {totalItems} checked
      </p>

      {template.sections.map((section) => (
        <div key={section.title} style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 4px" }}>{section.title}</h3>
          {section.safety && (
            <p role="note" style={{ fontSize: 13, color: "#8a6d00", background: "#fff8e1", padding: "8px 10px", borderRadius: 8, margin: "0 0 6px" }}>
              OSHA record: this section is the agency's inquire-and-verify
              record for this site. A hazard you can see gets noted and raised
              with the client before any temp is sent in — never after.
            </p>
          )}
          {section.items.map((item, i) => {
            const id = `${section.title}:${i}`;
            const on = !!rec.checked?.[id];
            return (
              <label
                key={id}
                style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  padding: "8px 0", borderBottom: "1px solid var(--border)",
                  cursor: "pointer", fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => save({ ...rec, checked: { ...(rec.checked || {}), [id]: !on } })}
                  style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }}
                />
                <span style={{ textDecoration: on ? "line-through" : "none", color: on ? "var(--muted)" : "inherit" }}>
                  {item}
                </span>
              </label>
            );
          })}
        </div>
      ))}

      <div style={{ marginTop: 20, padding: 14, background: "var(--panel-2, #f6f7fb)", borderRadius: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Quote worksheet — quote them on the spot</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13 }}>
            Temps
            <input type="number" min="0" value={q.positions || ""}
              onChange={(e) => save({ ...rec, quote: { ...q, positions: e.target.value } })}
              style={{ display: "block", padding: 8, width: 90, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Hours per temp / week
            <input type="number" min="0" value={q.hours || ""}
              onChange={(e) => save({ ...rec, quote: { ...q, hours: e.target.value } })}
              style={{ display: "block", padding: 8, width: 110, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Bill rate ($/hr per temp)
            <input type="number" min="0" step="0.01" value={q.billRate || ""}
              onChange={(e) => save({ ...rec, quote: { ...q, billRate: e.target.value } })}
              style={{ display: "block", padding: 8, width: 130, marginTop: 4 }} />
          </label>
        </div>
        <p style={{ fontSize: 14, margin: "10px 0 0" }}>
          {weekly > 0
            ? <>Estimated weekly bill: <strong>${weekly.toFixed(2)}</strong> for {positions} temp(s).</>
            : "Fill in temps, hours, and your bill rate to price the week."}
        </p>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 0" }}>
          Worksheet only. Build the rate from the full loaded cost — pay,
          workers' comp for that job, unemployment, supplies — plus profit,
          and check the client's state in Agency Settings → State pricing
          before you quote a number as final.
        </p>
      </div>

      <button
        className="btn-ghost"
        style={{ padding: "8px 14px", marginTop: 14, fontSize: 13 }}
        onClick={() => save({ client: "", checked: {}, quote: {} })}
      >
        Clear this walkthrough
      </button>
    </section>
  );
}
