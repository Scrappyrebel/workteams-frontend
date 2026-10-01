"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { localToday, localDaysAgo } from "../../../../lib/dates";

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
    const { data: members } = await sb
      .from("company_members")
      .select("id, display_name, email")
      .eq("company_id", company.id)
      .order("display_name");
    const { data: entries } = await sb
      .from("time_entries")
      .select("member_id, clock_in, clock_out")
      .eq("company_id", company.id)
      .gte("clock_in", range.start + "T00:00:00")
      .lte("clock_in", range.end + "T23:59:59")
      .not("clock_out", "is", null);

    const totals = {};
    for (const m of members || []) totals[m.id] = { member: m, hours: 0, shifts: 0 };
    for (const e of entries || []) {
      const t = totals[e.member_id];
      if (!t) continue;
      t.hours += (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000;
      t.shifts += 1;
    }
    let list = Object.values(totals);
    if (!isManager) list = list.filter((r) => r.member.id === member.id);
    setRows(list);
  }

  useEffect(() => {
    if (!loading && company && member) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member, range]);

  function exportCsv() {
    const lines = ["name,email,total_hours,shifts"];
    for (const r of rows) {
      lines.push([`"${r.member.display_name}"`, r.member.email, r.hours.toFixed(2), r.shifts].join(","));
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
          </div>
        ))}
      </div>

      {isManager && rows.length > 0 && (
        <p style={{ fontWeight: 800, marginTop: 14 }}>Team total: {totalHours.toFixed(2)} hours</p>
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
