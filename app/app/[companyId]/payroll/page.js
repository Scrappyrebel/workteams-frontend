"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { resolveEntryPayRate, MEMBER_PAY_RATE_COLUMNS } from "../../../../lib/pay-rate";

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
  // True only when the payroll_reviewed column (migration 098) was
  // actually served — before that update runs, held entries still
  // show, but there is no review button to offer.
  const [reviewReady, setReviewReady] = useState(false);
  const [locationNames, setLocationNames] = useState({});
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
    // proof_override_used arrives with migration 052 — read it tolerantly:
    // if the API cannot serve the column yet, retry without it rather
    // than blanking the payroll report.
    // Location names for the per-shift detail below. Tolerant: if the
    // locations read fails, the detail simply shows no location rather
    // than blanking the report.
    const { data: locs } = await sb
      .from("locations")
      .select("id, name")
      .eq("company_id", company.id);
    const locById = {};
    for (const l of locs || []) locById[l.id] = l.name;
    setLocationNames(locById);
    const runEntries = (level) => {
      // Level 2 also asks for payroll_reviewed (migration 098) — the
      // same tolerant ladder as proof_override_used: if the API
      // cannot serve a column yet, retry without it rather than
      // blanking the payroll report.
      const extra = level >= 2 ? ", proof_override_used, payroll_reviewed" : level === 1 ? ", proof_override_used" : "";
      let q = sb
        .from("time_entries")
        .select("id, member_id, location_id, clock_in, clock_out, clock_in_role, pay_rate_applied" + extra)
        .eq("company_id", company.id)
        .gte("clock_in", range.start + "T00:00:00")
        .lte("clock_in", range.end + "T23:59:59")
        .not("clock_out", "is", null);
      if (!isManager) q = q.eq("member_id", member.id);
      return q;
    };
    let entryResult = await runEntries(2);
    setReviewReady(!entryResult.error);
    if (entryResult.error) entryResult = await runEntries(1);
    if (entryResult.error) entryResult = await runEntries(0);
    const entries = entryResult.data;

    // Managers get pay rates to build per-hat estimates (member_pay is manager-only).
    let payByMember = {};
    if (isManager) {
      const { data: pay } = await sb
        .from("member_pay")
        .select(MEMBER_PAY_RATE_COLUMNS)
        .eq("company_id", company.id);
      for (const p of pay || []) payByMember[p.member_id] = p;
    }

    const totals = {};
    for (const m of members || []) totals[m.id] = { member: m, hours: 0, shifts: 0, cleanerHours: 0, managerHours: 0, estPay: 0, overrideShifts: 0, details: [], heldHours: 0, heldCount: 0, heldDetails: [] };
    for (const e of entries || []) {
      const t = totals[e.member_id];
      if (!t) continue;
      const hrs = (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000;
      if (e.proof_override_used) t.overrideShifts += 1;
      // Per-shift detail behind the total (the same entries the totals
      // above are summed from — nothing new is calculated here beyond
      // the per-shift slice of the existing manager estimate).
      const detail = {
        id: e.id,
        clockIn: e.clock_in,
        clockOut: e.clock_out,
        hours: hrs,
        hat: e.clock_in_role === "manager" ? "manager" : "cleaner",
        locationId: e.location_id || null,
        override: !!e.proof_override_used,
        estPay: 0,
      };
      // Audit fix, 2026-11-15 (Sebastian §2): a single closed shift
      // longer than 16 hours is almost always a missed clock-out —
      // the watchdog's own auto-close cap is 16 hours. Such an
      // entry is NEVER counted in the pay totals silently: it is
      // held out and listed below as NEEDS REVIEW until a manager
      // corrects the entry or marks it reviewed (payroll_reviewed,
      // migration 098). The entry itself is never changed here.
      if (hrs > 16 && !e.payroll_reviewed) {
        t.heldHours += hrs;
        t.heldCount += 1;
        t.heldDetails.push(detail);
        continue;
      }
      t.hours += hrs;
      t.shifts += 1;
      if (isManager) {
        const hat = detail.hat;
        // Shared chain (lib/pay-rate) — Profitability resolves identically.
        const rate = resolveEntryPayRate(e, payByMember[e.member_id]);
        if (hat === "manager") t.managerHours += hrs; else t.cleanerHours += hrs;
        t.estPay += hrs * rate;
        detail.estPay = hrs * rate;
      }
      t.details.push(detail);
    }
    for (const t of Object.values(totals)) {
      t.details.sort((a, b) => new Date(a.clockIn) - new Date(b.clockIn));
      t.heldDetails.sort((a, b) => new Date(a.clockIn) - new Date(b.clockIn));
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

  // Manager review of a held entry: the hours are real, count them.
  // Writes only the review flag — the entry's times never change.
  async function markReviewed(entryId) {
    const sb = supabase();
    const { error } = await sb.from("time_entries").update({ payroll_reviewed: true }).eq("id", entryId);
    if (error) {
      alert("Could not mark that entry reviewed: " + error.message);
      return;
    }
    load();
  }

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

  // Additive second export: one row per closed shift, so a total can be
  // checked shift by shift. The summary CSV above is unchanged.
  function exportDetailCsv() {
    const lines = isManager
      ? ["name,email,date,clock_in,clock_out,hours,worked_as,location,est_pay,proof_override"]
      : ["name,email,date,clock_in,clock_out,hours,worked_as,location"];
    for (const r of rows) {
      for (const d of r.details || []) {
        const base = [
          `"${r.member.display_name}"`,
          r.member.email,
          isoDate(new Date(d.clockIn)),
          `"${new Date(d.clockIn).toLocaleString()}"`,
          `"${new Date(d.clockOut).toLocaleString()}"`,
          d.hours.toFixed(2),
          d.hat,
          `"${locationNames[d.locationId] || ""}"`,
        ];
        const tail = isManager ? [d.estPay.toFixed(2), d.override ? "yes" : "no"] : [];
        lines.push(base.concat(tail).join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hours_detail_${range.start}_${range.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalHours = rows.reduce((s, r) => s + r.hours, 0);

  if (loading || !company) return <p>Loading…</p>;

  return (
    <div>
      <p className="eyebrow">{isManager ? "PAYROLL REPORTS" : "MY HOURS"}</p>
      <h2 style={{ fontSize: "1.8rem" }}>{isManager ? "Hour report" : "My hours"}</h2>
      <p style={{ color: "var(--muted)" }}>
        Closed shifts only — still-open clock-ins don't count until someone clocks out.
      </p>
      <p style={{ color: "var(--muted)" }}>
        Every closed shift behind a total is listed under that person below, and the
        shift-detail CSV lists one row per shift. This report has no overtime split
        and no break deduction — breaks are not recorded on a shift. One check does
        happen: a single shift longer than 16 hours is held out of every total as
        NEEDS REVIEW until a manager corrects the entry or marks it reviewed,
        because a shift that long is almost always a missed clock-out. Your payroll
        provider works out overtime and final pay from these hours.
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
          <button onClick={exportDetailCsv} style={button}>Export shift detail CSV</button>
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
            {r.overrideShifts > 0 && (
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#9b2d15", marginTop: 6 }}>
                ⚠ {r.overrideShifts} shift{r.overrideShifts === 1 ? "" : "s"} used a proof override (required proof not uploaded) — see Time entries for the reason{r.overrideShifts === 1 ? "" : "s"}
              </div>
            )}
            {r.heldCount > 0 && (
              <div style={{ marginTop: 8, padding: "10px 12px", background: "#fdecea", border: "1px solid #d66", borderRadius: 10 }}>
                <div style={{ fontWeight: 800, color: "#9b2d15", fontSize: "0.9rem" }}>
                  ⚠ NEEDS REVIEW — {r.heldCount} shift{r.heldCount === 1 ? "" : "s"} over 16 hours ({r.heldHours.toFixed(2)} h) held out of the totals above
                </div>
                {r.heldDetails.map((d) => (
                  <div key={d.id} style={{ fontSize: "0.85rem", marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span>
                      {new Date(d.clockIn).toLocaleDateString()}{" "}
                      {new Date(d.clockIn).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} –{" "}
                      {new Date(d.clockOut).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span style={{ fontWeight: 700 }}>{d.hours.toFixed(2)} h</span>
                    {locationNames[d.locationId] && <span>{locationNames[d.locationId]}</span>}
                    {isManager && reviewReady && (
                      <button onClick={() => markReviewed(d.id)} style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #9b2d15", background: "#fff", color: "#9b2d15", fontWeight: 700, cursor: "pointer" }}>
                        Mark reviewed — count these hours
                      </button>
                    )}
                  </div>
                ))}
                <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "6px 0 0" }}>
                  {isManager
                    ? reviewReady
                      ? "Correct the entry in Time entries if the times are wrong. If the hours are real, mark it reviewed and it will count."
                      : "Correct the entry in Time entries if the times are wrong."
                    : "These hours are not counted yet. Ask a manager to review this shift."}
                </p>
              </div>
            )}
            {r.details && r.details.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: "0.88rem", fontWeight: 700, color: "var(--brand-deep)" }}>
                  Shift detail ({r.details.length} shift{r.details.length === 1 ? "" : "s"})
                </summary>
                <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                  {r.details.map((d) => (
                    <div key={d.id} style={{ fontSize: "0.85rem", color: "var(--muted)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span>
                        {new Date(d.clockIn).toLocaleDateString()}{" "}
                        {new Date(d.clockIn).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} –{" "}
                        {new Date(d.clockOut).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span style={{ fontWeight: 700 }}>{d.hours.toFixed(2)} h</span>
                      {locationNames[d.locationId] && <span>{locationNames[d.locationId]}</span>}
                      {isManager && <span>{d.hat}</span>}
                      {isManager && d.estPay > 0 && <span>est. ${d.estPay.toFixed(2)}</span>}
                      {d.override && <span style={{ fontWeight: 700, color: "#9b2d15" }}>proof override</span>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>

      {isManager && rows.length > 0 && (
        <p style={{ fontWeight: 800, marginTop: 14 }}>
          Team total: {totalHours.toFixed(2)} hours
          {rows.some((r) => r.estPay > 0) && <> • est. ${rows.reduce((s, r) => s + r.estPay, 0).toFixed(2)}</>}
          {rows.some((r) => r.heldCount > 0) && (
            <> • ⚠ {rows.reduce((s, r) => s + r.heldHours, 0).toFixed(2)} h held for review (not counted)</>
          )}
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
