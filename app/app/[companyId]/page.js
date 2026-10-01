"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useCompany } from "../../../lib/company-context";
import { canUse, tierLabel } from "../../../lib/tiers";
import { localToday } from "../../../lib/dates";

const TOOL_CARDS = [
  { key: "scheduling", label: "Schedule", desc: "Shifts by day, who works where.", href: "schedule", roles: "all" },
  { key: "timeclock", label: "Time Clock", desc: "Clock in and out with GPS.", href: "time", roles: "all" },
  { key: "payroll", label: "Hours & Payroll", desc: "Payroll-ready hour reports + CSV.", href: "payroll", roles: "all" },
  { key: "locations", label: "Locations", desc: "Sites, clients, and geofences.", href: "locations", roles: "manager" },
  { key: "team", label: "Team", desc: "Members, roles, and invites.", href: "team", roles: "all" },
  { key: "inspections", label: "Inspections", desc: "Quality checks with photos.", href: "inspections", roles: "manager" },
  { key: "messaging", label: "Crew Messaging", desc: "Message your team.", href: "messages", roles: "all" },
  { key: "bidding", label: "Bids & Proposals", desc: "Quote and win new work.", href: "bids", roles: "manager" },
  { key: "walkthroughs", label: "Walkthroughs", desc: "Room-by-room measurements & scope.", href: "walkthroughs", roles: "manager" },
  { key: "workorders", label: "Work Orders", desc: "One-time and extra jobs.", href: "work-orders", roles: "all" },
  { key: "supplies", label: "Supplies", desc: "Requests and inventory.", href: "supplies", roles: "manager" },
  { key: "portal", label: "Client Portal", desc: "Let clients see their service.", href: "client-portal", roles: "manager" },
  { key: "profitability", label: "Profitability", desc: "Job costs and margins.", href: "profitability", roles: "manager" },
];

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
      const today = localToday();
      const { data: shifts } = await sb
        .from("shifts")
        .select("id, shift_date, start_time, member_id, company_members(display_name), locations(name)")
        .eq("company_id", company.id)
        .eq("shift_date", today);
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
          found.push({ kind: "no-clockin", text: `${name} — no clock-in for the ${s.start_time.slice(0, 5)} shift at ${loc}` });
        } else if (!clockedIn.has(s.member_id) && minsAgo <= 15 && minsAgo > -30) {
          found.push({ kind: "soon", text: `${name} — shift starting soon (${s.start_time.slice(0, 5)}) at ${loc}` });
        }
      }
      setAlerts(found);
      setAlertsLoading(false);
    })();
  }, [loading, company]);

  if (loading || !company) return <p>Loading…</p>;

  const visibleCards = TOOL_CARDS.filter((t) => {
    if (t.roles === "manager" && !isManager) return false;
    if (!isManager) return ["scheduling", "timeclock", "payroll", "team", "workorders"].includes(t.key);
    return true;
  });

  return (
    <div>
      <div className="dashboard-header">
        <p className="eyebrow">DASHBOARD</p>
        <h2 style={{ fontSize: "1.8rem", margin: "4px 0" }}>{company.name}</h2>
        <p style={{ color: "var(--muted)" }}>
          {tierLabel(tier)} tier • You are {member.role}.{" "}
          {isManager && <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>Change plan →</Link>}
        </p>
      </div>

      <section className="panel" style={{ padding: 22, marginBottom: 22 }}>
        <p className="eyebrow">TODAY'S ALERTS</p>
        {alertsLoading ? (
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

      <div className="portal-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {visibleCards.map((t) => {
          const allowed = canUse(tier, t.key);
          const href = allowed ? `/app/${company.id}/${t.href}` : `/app/${company.id}/plans`;
          return (
            <Link className="portal-card" style={{ minHeight: 150, padding: 22 }} href={href} key={t.key}>
              <span className="card-kicker">{allowed ? t.label : "🔒 " + t.label}</span>
              <p style={{ marginTop: 8 }}>{t.desc}</p>
              <span className="card-link">{allowed ? "Open →" : "See plans →"}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
