"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { isManagerRole } from "../../../../lib/roles";
import { buildTempPayOwed, fmtMoney, fmtHours } from "../../../../lib/temp-pay-owed";

function isoDate(d) {
  // Local-timezone YYYY-MM-DD (same helper as the Payroll report).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Temp pay owed — owners/managers only. This is pay data: the page loads
// nothing at all for anyone else, and RLS on the temp tables is
// manager-scoped as a second wall (migration 043).
//
// What "owed" means here (also stated on the page): an assignment counts
// only when the temp accepted it, the job is marked completed, and the
// client confirmed the job's hours. Owed = the assignment's own recorded
// rate (temp_assignments.pay_rate_cents; the agency default when the
// assignment has none) x the client-confirmed hours. Assignments missing
// any of those recorded facts are listed under "Not yet payable" with
// the reason and no dollar amount — requested hours are never treated
// as hours worked.
export default function TempPayOwedPage() {
  const { company, member, loading } = useCompany();
  const [report, setReport] = useState(null);
  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 13);
    return { start: isoDate(start), end: isoDate(end) };
  });

  const isManager = !!member && isManagerRole(member.role);

  async function load() {
    const sb = supabase();
    const [{ data: requests }, { data: members }, { data: config }] = await Promise.all([
      sb
        .from("temp_job_requests")
        .select("id, customer_name, service_type, job_date, status, hours_requested, hours_confirmed, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(500),
      sb
        .from("company_members")
        .select("id, display_name, email")
        .eq("company_id", company.id)
        .order("display_name"),
      sb
        .from("temp_agency_config")
        .select("temp_hourly_pay")
        .eq("company_id", company.id)
        .maybeSingle(),
    ]);
    const reqs = requests || [];
    let assignments = [];
    if (reqs.length > 0) {
      const { data: asg } = await sb
        .from("temp_assignments")
        .select("id, job_request_id, member_id, status, pay_rate_cents")
        .in("job_request_id", reqs.map((r) => r.id))
        .limit(1000);
      assignments = asg || [];
    }
    setReport(
      buildTempPayOwed({
        assignments,
        requests: reqs,
        members: members || [],
        config: config || null,
        start: range.start,
        end: range.end,
      })
    );
  }

  useEffect(() => {
    if (!loading && company && member && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member, isManager, range]);

  function exportCsv() {
    if (!report) return;
    const lines = ["temp,email,client,date,hours,rate_per_hour,amount_owed"];
    for (const t of report.perTemp) {
      for (const d of t.details) {
        lines.push(
          [
            `"${t.memberName}"`,
            t.memberEmail,
            `"${d.client}"`,
            d.date,
            fmtHours(d.hoursHundredths),
            (d.rateCents / 100).toFixed(2),
            (d.owedCents / 100).toFixed(2),
          ].join(",")
        );
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `temp_pay_owed_${range.start}_${range.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !company) return <p>Loading…</p>;

  if (!isManager) {
    return (
      <div>
        <p className="eyebrow">TEMP STAFFING — PAY</p>
        <h2 style={{ fontSize: "1.8rem" }}>Temp pay owed</h2>
        <p style={{ color: "var(--muted)" }}>This report is for owners and managers only.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">TEMP STAFFING — PAY</p>
      <h2 style={{ fontSize: "1.8rem" }}>Temp pay owed</h2>
      <p style={{ color: "var(--muted)" }}>
        What each temp is owed for finished temp jobs. An assignment counts here only when the
        temp accepted it, the job is marked completed, and the client confirmed the hours —
        owed is that assignment&rsquo;s recorded pay rate × the client-confirmed hours (the same
        per-cleaner hours the job was quoted on). Jobs missing any of those steps are listed
        below under &ldquo;Not yet payable&rdquo; with no amount, so nothing is ever guessed
        from requested hours.
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

      {!report && <p style={{ color: "var(--muted)" }}>Loading…</p>}

      {report && report.perTemp.length === 0 && (
        <p style={{ color: "var(--muted)" }}>
          No temp pay is owed in this range yet — no completed jobs with client-confirmed hours.
        </p>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {(report?.perTemp || []).map((t) => (
          <div key={t.memberId} className="portal-card" style={{ minHeight: 0, padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <strong>{t.memberName}</strong>
                {t.memberEmail && (
                  <span style={{ color: "var(--muted)", fontSize: "0.88rem" }}> • {t.memberEmail}</span>
                )}
              </div>
              <span style={{ fontWeight: 800, fontSize: "1.15rem" }}>{fmtMoney(t.totalCents)}</span>
              <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                {fmtHours(t.totalHoursHundredths)} h • {t.assignments} assignment{t.assignments === 1 ? "" : "s"}
              </span>
            </div>
            <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
              {t.details.map((d) => (
                <div key={d.assignmentId} style={{ fontSize: "0.88rem", color: "var(--muted)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span>{d.date}</span>
                  <span style={{ flex: 1 }}>
                    {d.client}
                    {d.serviceType ? ` · ${d.serviceType.replace(/_/g, " ")}` : ""}
                  </span>
                  <span>{fmtHours(d.hoursHundredths)} h confirmed</span>
                  <span>
                    × {fmtMoney(d.rateCents)}/hr
                    {d.rateSource === "agency default" ? " (agency default)" : ""}
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--brand-deep)" }}>{fmtMoney(d.owedCents)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {report && report.perTemp.length > 0 && (
        <p style={{ fontWeight: 800, marginTop: 14 }}>
          Total owed: {fmtMoney(report.grandTotalCents)}
        </p>
      )}

      {report && report.awaiting.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <h3 style={{ marginBottom: 8 }}>Not yet payable</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {report.awaiting.map((d) => (
              <div key={d.assignmentId} className="portal-card" style={{ minHeight: 0, padding: "12px 18px" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: "0.92rem" }}>
                  <strong>{d.memberName}</strong>
                  <span style={{ flex: 1, color: "var(--muted)" }}>
                    {d.date} · {d.client}
                    {d.serviceType ? ` · ${d.serviceType.replace(/_/g, " ")}` : ""}
                  </span>
                  <span style={{ color: "var(--muted)" }}>
                    {d.rateCents !== null ? `${fmtMoney(d.rateCents)}/hr` : "no rate recorded"}
                    {d.hoursRequested != null ? ` · ${Number(d.hoursRequested).toFixed(2)} h requested` : ""}
                  </span>
                  <span style={{ fontWeight: 700 }}>{d.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {report && report.excludedCount > 0 && (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 14 }}>
          {report.excludedCount} declined / no-show assignment{report.excludedCount === 1 ? "" : "s"} in
          this range {report.excludedCount === 1 ? "is" : "are"} not listed — no pay is owed on those.
        </p>
      )}

      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 18 }}>
        WorkTeams doesn&rsquo;t process payroll — hand this report (or the CSV) to your payroll
        provider, same as the Payroll report.
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
