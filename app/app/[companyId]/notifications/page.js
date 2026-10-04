"use client";

import { useEffect, useState } from "react";
import { useCompany } from "../../../../lib/company-context";
import { supabase } from "../../../../lib/supabase";
import { ensurePush, enablePush, disablePush } from "../../../../lib/push-client";
import EmergencyButton from "../../../../components/EmergencyButton";

export default function NotificationSettingsPage() {
  const { company, member, loading } = useCompany();
  const [status, setStatus] = useState("unknown");
  const isOwner = member?.role === "owner";

  useEffect(() => {
    if (!company?.id) return;
    ensurePush({
      companyId: company.id,
      getSession: () => supabase().auth.getSession(),
      onStatus: setStatus,
    });
  }, [company?.id]);

  if (loading || !company) return <p>Loading…</p>;

  async function turnOn() {
    await enablePush({
      companyId: company.id,
      getSession: () => supabase().auth.getSession(),
      onStatus: setStatus,
    });
  }

  async function turnOff() {
    if (isOwner && !window.confirm("Turn off device notifications for this device? Critical alerts will still remain in the WorkTeams app, but this device will stop buzzing.")) return;
    await disablePush({
      companyId: company.id,
      getSession: () => supabase().auth.getSession(),
      onStatus: setStatus,
    });
  }

  return (
    <div>
      <p className="eyebrow">NOTIFICATIONS</p>
      <h2 style={{ fontSize: "1.8rem" }}>Notification settings</h2>

      <section className="panel" style={{ padding: 20, marginTop: 16 }}>
        <h3>Device notifications</h3>
        <p style={{ color: "var(--muted)" }}>
          Turn on phone/browser notifications for emergency alerts and important work events. Each phone, tablet, or computer must be enabled separately.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <strong>Status: {status === "on" ? "ON" : status === "blocked" ? "BLOCKED BY DEVICE" : status === "unsupported" ? "NOT SUPPORTED" : "OFF"}</strong>
          {status !== "on" && status !== "unsupported" && (
            <button onClick={turnOn} style={{ padding: "10px 18px", borderRadius: 999, border: 0, background: "var(--brand)", color: "#fff", fontWeight: 800 }}>
              🔔 Turn on notifications
            </button>
          )}
          {status === "on" && (
            <button onClick={turnOff} style={{ padding: "10px 18px", borderRadius: 999, border: "1px solid var(--line)", background: "#fff", fontWeight: 800 }}>
              Turn off on this device
            </button>
          )}
        </div>
        {status === "blocked" && <p style={{ color: "#b3261e", fontWeight: 700 }}>Notifications are blocked in your device/browser settings. Allow notifications for WorkTeams, then return here.</p>}
      </section>

      {isOwner && (
        <section className="panel" style={{ padding: 20, marginTop: 16 }}>
          <h3>Owner-wide alert coverage</h3>
          <p style={{ color: "var(--muted)" }}>
            Your owner account receives the widest alert coverage: missed clock-ins, possible no-shows, employee emergency/help requests, clock problems, customer/communication-book issues, schedule coverage problems, proof/upload problems, safety issues, and equipment/supply emergencies.
          </p>
        </section>
      )}

      {!isOwner && (
        <section className="panel" style={{ padding: 20, marginTop: 16 }}>
          <h3>Need management right now?</h3>
          <p style={{ color: "var(--muted)" }}>Use the emergency button for clock problems, safety issues, customer problems, proof uploads, coverage issues, or anything that cannot wait.</p>
          <EmergencyButton />
        </section>
      )}
    </div>
  );
}
