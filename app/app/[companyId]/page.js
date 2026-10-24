"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useCompany } from "../../../lib/company-context";
import { tierLabel } from "../../../lib/tiers";
import { roleLabel } from "../../../lib/roles";
import { chicagoToday, formatTime12h } from "../../../lib/dates";
import EmergencyButton from "../../../components/EmergencyButton";
import CompanyShiftProofSettings from "../../../components/CompanyShiftProofSettings";
import CompanyFeatureToggles from "../../../components/CompanyFeatureToggles";

export default function CompanyDashboard() {
  const { company, member, loading } = useCompany();
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const tier = company?.tier || "starter";

  useEffect(() => {
    if (loading || !company) return;
    (async () => {
      const sb = supabase();
      const today = chicagoToday(company?.timezone);
      // Employees only see alerts about their own shifts; managers see all.
      const mineOnly = !(member && (member.role === "owner" || member.role === "admin"));
      let shiftQ = sb
        .from("shifts")
        .select("id, shift_date, start_time, member_id, company_members(display_name), locations(name)")
        .eq("company_id", company.id)
        .eq("shift_date", today);
      if (mineOnly) shiftQ = shiftQ.eq("member_id", member.id);
      const { data: shifts } = await shiftQ;
      const { data: entries } = await sb
        .from("time_entries")
        .select("member_id, clock_in")
        .eq("company_id", company.id)
        .gte("clock_in", today + "T00:00:00");
      const clockedIn = new Set((entries || []).map((e) => e.member_id));
      const now = new Date();
      const found = [];
      for (const s of shifts || []) {
        const start = new Date(`${s.shift_date}T${s.start_time}`);
        const minsAgo = (now - start) / 60000;
        const name = s.company_members?.display_name || "Unassigned";
        const loc = s.locations?.name || "No location";
        if (!clockedIn.has(s.member_id) && minsAgo > 15) {
          found.push({ kind: "no-clockin", text: `${name} — no clock-in for the ${formatTime12h(s.start_time)} shift at ${loc}` });
        } else if (!clockedIn.has(s.member_id) && minsAgo <= 15 && minsAgo > -30) {
          found.push({ kind: "soon", text: `${name} — shift starting soon (${formatTime12h(s.start_time)}) at ${loc}` });
        }
      }
      setAlerts(found);
      setAlertsLoading(false);
    })();
  }, [loading, company]);

  if (loading || !company) return <p>Loading…</p>;

  return (
    <div>
      <div className="dashboard-header" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p className="eyebrow">DASHBOARD</p>
          <h2 style={{ fontSize: "1.8rem", margin: "4px 0" }}>{company.name}</h2>
          <p style={{ color: "var(--muted)" }}>
            {tierLabel(tier)} tier • You are {roleLabel(member.role)}.{" "}
            {isManager && <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>Plans →</Link>}
          </p>
        </div>
        <EmergencyButton compact />
      </div>

      <section className="panel" style={{ padding: 20, marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 12px" }}>Quick Access · Shift Essentials</h3>
        <div className="portal-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <Link className="portal-card" href={`/app/${company.id}/time`}
                style={{ minHeight: 86, padding: 16 }}>
            <strong>⏰ Time Clock</strong>
            <p style={{ margin: "6px 0 0" }}>Clock in and out with GPS →</p>
          </Link>
          <Link className="portal-card" href={`/app/${company.id}/schedule`}
                style={{ minHeight: 86, padding: 16 }}>
            <strong>📅 Schedule</strong>
            <p style={{ margin: "6px 0 0" }}>Sunday–Saturday calendar →</p>
          </Link>
          <Link className="portal-card" href={`/app/${company.id}/time#end-shift-proof`}
                style={{ minHeight: 86, padding: 16 }}>
            <strong>🎥 Shift Video</strong>
            <p style={{ margin: "6px 0 0" }}>Open recorder →</p>
          </Link>
          <Link className="portal-card" href={`/app/${company.id}/time#end-shift-proof`}
                style={{ minHeight: 86, padding: 16 }}>
            <strong>📖 Communication Book</strong>
            <p style={{ margin: "6px 0 0" }}>Take book photo →</p>
          </Link>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.86rem", marginBottom: 0 }}>
          Video and book proof controls appear in Time Clock during an active shift.
        </p>
      </section>

      <section className="panel" style={{ padding: 22, marginBottom: 22 }}>
        <p className="eyebrow">TODAY'S ALERTS</p>        {alertsLoading ? (
          <p>Checking shifts…</p>
        ) : alerts.length === 0 ? (
          <p style={{ color: "var(--success-ink)", fontWeight: 700 }}>✅ All clear — no late or missing clock-ins right now.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {alerts.map((a, i) => (
              <div
                key={i}
                style={{
                  background: a.kind === "no-clockin" ? "#fdecea" : "#fff4e5",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontWeight: 600,
                }}
              >
                {a.kind === "no-clockin" ? "⚠️ " : "⏰ "}
                {a.text}
              </div>
            ))}
          </div>
        )}
      </section>

      <p style={{ color: "var(--muted)", fontSize: "0.92rem", margin: "0 0 18px" }}>
        Everything else — Team, Messages, My Hours / Payroll, Bids and more — lives in the{" "}
        <strong style={{ color: "var(--brand-deep)" }}>☰ Menu</strong> at the very top of the page.
      </p>

      {isManager && <CompanyShiftProofSettings companyId={company.id} />}
      {isManager && <CompanyFeatureToggles companyId={company.id} />}
    </div>
  );
}
