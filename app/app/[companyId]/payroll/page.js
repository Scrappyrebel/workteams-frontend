"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { chicagoToday, chicagoDaysAgo } from "../../../../lib/dates";

function isoDate(d) {
  // Local-timezone YYYY-MM-DD (d is already a local Date or offset).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function PayrollPage() {
  const { company, member, loading } = useCompany();
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 13);
    return { start: isoDate(start), end: isoDate(end) };
  });

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    const sb = supabase();
    // Managers need emails for the payroll report; everyone else only ever
    // sees their own row, so the directory (no emails) is enough.
    const { data: members } = isManager
      ? await sb
          .from("company_members")
          .select("id, display_name, email")
          .eq("company_id", company.id)
          .order("display_name")
      : await sb
          .from("team_directory")
          .select("id, display_name")
          .eq("company_id", company.id)
          .order("display_name");
    // Employees may only read their own time entries (enforced by RLS too);
    // filter the query as well so no one else's rows reach the browser.
    let entryQ = sb
      .from("time_entries")
      .select("member_id, clock_in, clock_out, clock_in_role, pay_rate_applied")
      .eq("company_id", company.id)
      .gte("clock_in", range.start + "T00:00:00")
      .lte("clock_in", range.end + "T23:59:59")
      .not("clock_out", "is", null);
    if (!isManager) entryQ = entryQ.eq("member_id", member.id);
    const { data: entries } = await entryQ;

    // Managers get pay rates to build per-hat estimates (member_pay is manager-only).
    let payByMember = {};
    if (isManager) {
      const { data: pay } = await sb
        .from("member_pay")
        .select("member_id, cleaner_hourly_rate, manager_hourly_rate, hourly_rate")
        .eq("company_id", company.id);
      for (const p of pay || []) payByMember[p.member_id] = p;
    }

    const totals = {};
    for (const m of members || []) totals[m.id] = { member: m, hours: 0, shifts: 0, cleanerHours: 0, managerHours: 0, estPay: 0 };
    for (const e of entries || []) {
      const t = totals[e.member_id];
      if (!t) continue;
      const hrs = (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000;
      t.hours += hrs;
      t.shifts += 1;
      if (isManager) {
        const hat = e.clock_in_role === "manager" ? "manager" : "cleaner";
        const rate = e.pay_rate_applied ?? payByMember[e.member_id]?.[hat === "manager" ? "manager_hourly_rate" : "cleaner_hourly_rate"] ?? payByMember[e.member_id]?.hourly_rate ?? 0;
        if (hat === "manager") t.managerHours += hrs; else t.cleanerHours += hrs;
        t.estPay += hrs * rate;
      }
    }
    let list = Object.values(totals);
    if (!isManager) {
      // Non-managers see only their own row; attach their own email (from
      // their own member record) so the CSV export still works.
      list = list
        .filter((r) => r.member.id === member.id)
        .map((r) => ({ ...r, member: { ...r.member, email: member.email } }));
    }
    setRows(list);
  }

  useEffect(() => {
    if (!loading && company && member) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member, range]);

  function exportCsv() {
    const lines = isManager
      ? ["name,email,total_hours,cleaner_hours,manager_hours,est_pay,shifts"]
      : ["name,email,total_hours,shifts"];
    for (const r of rows) {
      const base = [`"${r.member.display_name}"`, r.member.email, r.hours.toFixed(2)];
      const tail = isManager
        ? [r.cleanerHours.toFixed(2), r.managerHours.toFixed(2), r.estPay.toFixed(2), r.shifts]
        : [r.shifts];
      lines.push(base.concat(tail).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hours_${range.start}_${range.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalHours = rows.reduce((s, r) => s + r.hours, 0);

  if (loading || !company) return <p>Loading…</p>;

  return (
    <div>
      <p className="eyebrow">{isManager ? "PAYROLL REPORTS" : "MY HOURS"}</p>
      <h2 style={{ fontSize: "1.8rem" }}>{isManager ? "Payroll-ready hour report" : "My hours"}</h2>
      <p style={{ color: "var(--muted)" }}>
        Closed shifts only — still-open clock-ins don't count until someone clocks out.
      </p>

      <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.9rem", fontWeight: 700 }}>
            From
            <input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} style={input} />
          </label>
          <label style={{ fontSize: "0.9rem", fontWeight: 700 }}>
            To
            <input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} style={input} />
          </label>
          <button onClick={exportCsv} style={button}>Export CSV</button>
        </div>
      </section>

      <div style={{ display: "grid", gap: 8 }}>
        {rows.length === 0 && <p style={{ color: "var(--muted)" }}>No closed shifts in this range.</p>}
        {rows.map((r) => (
          <div key={r.member.id} className="portal-card" style={{ minHeight: 0, padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <strong>{r.member.display_name}</strong>
                {isManager && <span style={{ color: "var(--muted)", fontSize: "0.88rem" }}> • {r.member.email}</span>}
              </div>
              <span style={{ fontWeight: 800, fontSize: "1.15rem" }}>{r.hours.toFixed(2)} h</span>
              <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{r.shifts} shift{r.shifts === 1 ? "" : "s"}</span>
            </div>
            {isManager && (r.cleanerHours > 0 || r.managerHours > 0) && (
              <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6 }}>
                {r.cleanerHours > 0 && <span>🧹 {r.cleanerHours.toFixed(2)} h cleaner</span>}
                {r.cleanerHours > 0 && r.managerHours > 0 && <span> • </span>}
                {r.managerHours > 0 && <span>📋 {r.managerHours.toFixed(2)} h manager</span>}
                <span style={{ fontWeight: 800, color: "var(--brand-deep)" }}> • est. ${r.estPay.toFixed(2)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {isManager && rows.length > 0 && (
        <p style={{ fontWeight: 800, marginTop: 14 }}>
          Team total: {totalHours.toFixed(2)} hours
          {rows.some((r) => r.estPay > 0) && <> • est. ${rows.reduce((s, r) => s + r.estPay, 0).toFixed(2)}</>}
        </p>
      )}

      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 18 }}>
        WorkTeams doesn't process payroll — hand this report (or the CSV) to your payroll
        provider. See <a href="connections" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>Connections</a> to
        link your provider.
      </p>
    </div>
  );
}

const input = {
  display: "block",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  marginTop: 6,
};

const button = {
  padding: "11px 22px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
