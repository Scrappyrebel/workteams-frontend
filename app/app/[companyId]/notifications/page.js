"use client";

import { useEffect, useState } from "react";
import { useCompany } from "../../../../lib/company-context";
import { supabase } from "../../../../lib/supabase";
import { ensurePush, enablePush, disablePush } from "../../../../lib/push-client";
import EmergencyButton from "../../../../components/EmergencyButton";

// Per-category phone-notification choices (migration 068). A member with
// no saved row has every category ON. Until the migration runs, the panel
// explains itself and stays disabled — nothing here ever errors.
const PREF_CATEGORIES = [
  {
    key: "schedule_changes",
    label: "Schedule changes",
    help: "New time-off and swap requests, decisions on your requests, and swap answers. These honor your choice now.",
  },
  {
    key: "messages",
    label: "Messages & announcements",
    help: "Crew chat and announcements. These honor your choice now.",
  },
  {
    key: "customer_replies",
    label: "Customer replies",
    help: "When a customer replies in the client portal. These don't send phone notifications yet — your choice is saved and will apply when they do.",
  },
  {
    key: "pay",
    label: "Pay & payroll",
    help: "Payroll-ready and pay alerts. These don't send phone notifications yet — your choice is saved and will apply when they do.",
  },
];

export default function NotificationSettingsPage() {
  const { company, member, loading } = useCompany();
  const [status, setStatus] = useState("unknown");
  const isOwner = member?.role === "owner";

  const [prefs, setPrefs] = useState(null); // null = still loading
  const [prefsReady, setPrefsReady] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  const [quiet, setQuiet] = useState(null); // { start: "HH:MM"|"", end: "HH:MM"|"" }
  const [quietReady, setQuietReady] = useState(true);
  const [savingQuiet, setSavingQuiet] = useState(false);

  useEffect(() => {
    if (!company?.id) return;
    ensurePush({
      companyId: company.id,
      getSession: () => supabase().auth.getSession(),
      onStatus: setStatus,
    });
  }, [company?.id]);

  useEffect(() => {
    if (!company?.id || !member?.id) return;
    (async () => {
      const { data, error } = await supabase()
        .from("member_notification_preferences")
        .select("schedule_changes, messages, customer_replies, pay")
        .eq("company_id", company.id)
        .eq("member_id", member.id)
        .maybeSingle();
      if (error) {
        // Table not there yet (migration 068 not run): show the panel in
        // its honest "turns on with the update" state.
        setPrefsReady(false);
        setPrefs({ schedule_changes: true, messages: true, customer_replies: true, pay: true });
        return;
      }
      setPrefs({
        schedule_changes: data?.schedule_changes !== false,
        messages: data?.messages !== false,
        customer_replies: data?.customer_replies !== false,
        pay: data?.pay !== false,
      });
    })();
  }, [company?.id, member?.id]);

  // Quiet hours (migration 072) load in their OWN probe, separate from
  // the category read above: until that migration runs, the two columns
  // don't exist, this read errors, and only the quiet-hours section
  // shows its "turns on with the update" note — the category panel is
  // never affected.
  useEffect(() => {
    if (!company?.id || !member?.id) return;
    (async () => {
      const { data, error } = await supabase()
        .from("member_notification_preferences")
        .select("quiet_hours_start, quiet_hours_end")
        .eq("company_id", company.id)
        .eq("member_id", member.id)
        .maybeSingle();
      if (error) {
        setQuietReady(false);
        setQuiet({ start: "", end: "" });
        return;
      }
      setQuiet({
        start: data?.quiet_hours_start ? String(data.quiet_hours_start).slice(0, 5) : "",
        end: data?.quiet_hours_end ? String(data.quiet_hours_end).slice(0, 5) : "",
      });
    })();
  }, [company?.id, member?.id]);

  // Save a quiet-hours window; pass { start: "", end: "" } to turn it
  // off. Both blank = off; a start equal to its end is also saved as
  // off (the send paths read an equal start/end as no window).
  async function saveQuiet(next) {
    if (!quietReady || savingQuiet || !next) return;
    const start = next.start || "";
    const end = next.end || "";
    if ((start && !end) || (!start && end)) {
      alert("Set both a start and an end time for quiet hours, or clear both to turn quiet hours off.");
      return;
    }
    const off = !start || start === end;
    setSavingQuiet(true);
    const { error } = await supabase()
      .from("member_notification_preferences")
      .upsert(
        {
          company_id: company.id,
          member_id: member.id,
          quiet_hours_start: off ? null : start,
          quiet_hours_end: off ? null : end,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,member_id" }
      );
    setSavingQuiet(false);
    if (error) {
      alert("Could not save quiet hours: " + error.message);
      return;
    }
    setQuiet(off ? { start: "", end: "" } : { start, end });
  }

  async function togglePref(key) {
    if (!prefsReady || savingKey) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSavingKey(key);
    const { error } = await supabase()
      .from("member_notification_preferences")
      .upsert(
        { company_id: company.id, member_id: member.id, [key]: next[key], updated_at: new Date().toISOString() },
        { onConflict: "company_id,member_id" }
      );
    setSavingKey(null);
    if (error) {
      setPrefs(prefs); // put it back — never show a choice that didn't save
      alert("Could not save that choice: " + error.message);
    }
  }

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

      <section className="panel" style={{ padding: 20, marginTop: 16 }}>
        <h3>Which alerts buzz your phone</h3>
        <p style={{ color: "var(--muted)" }}>
          Pick the kinds of phone notifications you want. Everything starts on.
          Emergency and help alerts are not in this list — those always come through.
        </p>
        {!prefsReady && (
          <p style={{ color: "var(--muted)", fontWeight: 700 }}>
            Per-type choices turn on with the latest WorkTeams update.
          </p>
        )}
        <div style={{ display: "grid", gap: 12 }}>
          {PREF_CATEGORIES.map((c) => (
            <label
              key={c.key}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "12px 14px",
                cursor: prefsReady ? "pointer" : "default",
                opacity: prefsReady ? 1 : 0.6,
              }}
            >
              <input
                type="checkbox"
                checked={prefs ? prefs[c.key] : true}
                disabled={!prefsReady || !prefs || savingKey === c.key}
                onChange={() => togglePref(c.key)}
                style={{ width: 22, height: 22, marginTop: 2 }}
              />
              <span>
                <strong>{c.label}</strong>
                <span style={{ display: "block", color: "var(--muted)", fontSize: "0.88rem", marginTop: 2 }}>
                  {c.help}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel" style={{ padding: 20, marginTop: 16 }}>
        <h3>Quiet hours</h3>
        <p style={{ color: "var(--muted)" }}>
          Set a window and non-urgent phone notifications will not buzz your phone during it — they still
          appear in the app as usual, they just don't buzz, and one that arrives during quiet hours is not
          re-sent later. Emergency and help alerts always come through, quiet hours or not. Both times use
          your company's timezone. Leave both blank to turn quiet hours off.
        </p>
        {!quietReady && (
          <p style={{ color: "var(--muted)", fontWeight: 700 }}>
            Quiet hours turn on with the latest WorkTeams update.
          </p>
        )}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Start</span>
            <input
              type="time"
              value={quiet?.start || ""}
              disabled={!quietReady || !quiet || savingQuiet}
              onChange={(e) => setQuiet({ ...(quiet || { start: "", end: "" }), start: e.target.value })}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: "1rem" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>End</span>
            <input
              type="time"
              value={quiet?.end || ""}
              disabled={!quietReady || !quiet || savingQuiet}
              onChange={(e) => setQuiet({ ...(quiet || { start: "", end: "" }), end: e.target.value })}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: "1rem" }}
            />
          </label>
          <button
            onClick={() => saveQuiet(quiet)}
            disabled={!quietReady || !quiet || savingQuiet}
            style={{ padding: "10px 18px", borderRadius: 999, border: 0, background: "var(--brand)", color: "#fff", fontWeight: 800 }}
          >
            {savingQuiet ? "Saving…" : "Save quiet hours"}
          </button>
          {(quiet?.start || quiet?.end) && (
            <button
              onClick={() => saveQuiet({ start: "", end: "" })}
              disabled={!quietReady || savingQuiet}
              style={{ padding: "10px 18px", borderRadius: 999, border: "1px solid var(--line)", background: "#fff", fontWeight: 800 }}
            >
              Turn off quiet hours
            </button>
          )}
        </div>
      </section>

      {isOwner && (
        <section className="panel" style={{ padding: 20, marginTop: 16 }}>
          <h3>Owner-wide alert coverage</h3>
          <p style={{ color: "var(--muted)" }}>
            Your owner account receives the widest alert coverage: automatic missed clock-in, possible no-show, and overtime alerts, plus emergency and help requests whenever a crew member submits one through the emergency button — including clock problems, customer/communication-book issues, schedule coverage problems, proof/upload problems, safety issues, and equipment/supply emergencies.
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
