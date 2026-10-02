"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { isSupervisorRole } from "../../../../lib/roles";

// Emergency alert log. Supervisors and up can acknowledge ("I'm on it").
// Everyone sees the alerts for their company.
export default function EmergencyPage() {
  const { company, member, loading } = useCompany();
  const [alerts, setAlerts] = useState([]);
  const [busy, setBusy] = useState(null);

  const canAck = isSupervisorRole(member?.role);

  async function load() {
    const { data } = await supabase()
      .from("emergency_alerts")
      .select("id, audience, message, location_name, created_at, acknowledged_at, company_members!emergency_alerts_sender_member_id_fkey(display_name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setAlerts(data || []);
  }

  useEffect(() => {
    if (!loading && company) {
      load();
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company]);

  async function acknowledge(id) {
    setBusy(id);
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch("/api/emergency/acknowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ companyId: company.id, alertId: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed");
      await load();
    } catch (e) {
      alert(e.message);
    }
    setBusy(null);
  }

  if (loading || !company) return <p>Loading…</p>;

  const unacked = alerts.filter((a) => !a.acknowledged_at);

  return (
    <div>
      <p className="eyebrow">EMERGENCY</p>
      <h2 style={{ fontSize: "1.8rem" }}>Alert log</h2>
      {unacked.length > 0 && (
        <p style={{ fontWeight: 800, color: "#b3261e" }}>
          {unacked.length} needing a response right now
        </p>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {alerts.length === 0 && (
          <p style={{ color: "var(--muted)" }}>No alerts. Hopefully it stays that way.</p>
        )}
        {alerts.map((a) => (
          <div
            key={a.id}
            className="portal-card"
            style={{
              minHeight: 0,
              padding: "14px 18px",
              borderLeft: a.acknowledged_at ? "4px solid var(--line)" : "4px solid #b3261e",
              opacity: a.acknowledged_at ? 0.75 : 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>
                  🚨 {a.company_members?.display_name || "Someone"}
                  <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: "0.85rem" }}>
                    {" "}→ {a.audience === "owner" ? "Owner" : "Managers & supervisors"}
                  </span>
                </div>
                <div style={{ marginTop: 4 }}>{a.message}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4 }}>
                  {new Date(a.created_at).toLocaleString()}
                  {a.acknowledged_at && " • ✅ Responded"}
                </div>
              </div>
              {canAck && !a.acknowledged_at && (
                <button
                  onClick={() => acknowledge(a.id)}
                  disabled={busy === a.id}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 999,
                    border: "none",
                    background: "#28704a",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {busy === a.id ? "…" : "I'm on it"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
