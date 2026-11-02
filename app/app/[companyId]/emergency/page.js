"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { isSupervisorRole } from "../../../../lib/roles";
import {
  loadEmergencyAlertEvents,
  recordEmergencyAlertEvent,
  latestEventByAlert,
  filterEmergencyAlerts,
  alertAgeLabel,
  waitingSummary,
} from "../../../../lib/emergency-alert-events";

// Customer portal alerts (migration 065) carry the request id in their
// dedupe_key — customer_portal_request:<id> or
// customer_portal_reply:<id>:<reply_id> — so the alert can deep-link
// straight to that request's conversation in the Client Portal inbox.
function portalMessageId(alert) {
  if (alert?.category !== "customer_portal" || typeof alert?.dedupe_key !== "string")
    return null;
  const match = alert.dedupe_key.match(
    /^customer_portal_(?:request|reply):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match ? match[1] : null;
}

// Emergency alert log. Supervisors and up can acknowledge ("I'm on it").
// Everyone sees the alerts for their company.
export default function EmergencyPage() {
  const { company, member, loading } = useCompany();
  const [alerts, setAlerts] = useState([]);
  const [busy, setBusy] = useState(null);
  // Depth (D-WT-53): today's default view is unchanged — the newest 50
  // alerts. "Show more alerts" raises the limit in steps of 50.
  const [limit, setLimit] = useState(50);
  // Triage filters over the alerts already loaded (stored fields only).
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [whenFilter, setWhenFilter] = useState("all");
  // Assignment/resolution record (migration 086). Loaded fail-soft:
  // before 086 runs, eventsOk stays false and none of the record
  // layer renders — the page is exactly as it was.
  const [eventsOk, setEventsOk] = useState(false);
  const [events, setEvents] = useState([]);
  const [names, setNames] = useState({});
  const [responders, setResponders] = useState([]);
  const [assignPick, setAssignPick] = useState({});
  const [resolutionNote, setResolutionNote] = useState({});
  const [recordBusy, setRecordBusy] = useState(null);

  const canAck = isSupervisorRole(member?.role);

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("emergency_alerts")
      .select("id, audience, category, message, location_name, dedupe_key, created_at, acknowledged_at, acknowledged_by, company_members!emergency_alerts_sender_member_id_fkey(display_name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    const rows = data || [];
    setAlerts(rows);
    // Record layer: events for the loaded alerts, plus the names they
    // reference (acknowledged_by, assignees, actors) resolved through
    // team_directory — the roster view every company member can read.
    // Any failure leaves the record layer hidden and the log untouched.
    const ev = await loadEmergencyAlertEvents(sb, rows.map((r) => r.id));
    setEventsOk(ev.ok);
    setEvents(ev.events);
    if (ev.ok) {
      const ids = new Set();
      for (const r of rows) if (r.acknowledged_by) ids.add(r.acknowledged_by);
      for (const e of ev.events) {
        if (e.assignee_member_id) ids.add(e.assignee_member_id);
        if (e.actor_id) ids.add(e.actor_id);
      }
      if (ids.size > 0) {
        const { data: dir } = await sb
          .from("team_directory")
          .select("id, display_name")
          .in("id", [...ids]);
        const map = {};
        for (const m of dir || []) map[m.id] = m.display_name;
        setNames(map);
      }
      if (canAck) {
        const { data: dir } = await sb
          .from("team_directory")
          .select("id, display_name, role")
          .eq("company_id", company.id)
          .order("display_name");
        setResponders(
          (dir || []).filter((m) => ["owner", "admin", "supervisor"].includes(m.role))
        );
      }
    }
  }

  useEffect(() => {
    if (!loading && company) {
      load();
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, limit]);

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

  // Record an assignment or a resolution for an alert. These are new,
  // additive records (migration 086) written straight to the events
  // table by supervisors and up — the same roles that can acknowledge.
  // They never touch the acknowledge path above, and a failed record
  // changes nothing on the alert itself.
  async function recordEvent(alertRow, eventType) {
    setRecordBusy(alertRow.id);
    try {
      const okWrite = await recordEmergencyAlertEvent(supabase(), {
        alertId: alertRow.id,
        companyId: company.id,
        actorId: member?.id || null,
        eventType,
        assigneeMemberId:
          eventType === "assigned" ? assignPick[alertRow.id] || null : null,
        detail: eventType === "resolved" ? resolutionNote[alertRow.id] || "" : "",
      });
      if (!okWrite) throw new Error("Could not save the record. Try again.");
      if (eventType === "resolved") {
        setResolutionNote((prev) => ({ ...prev, [alertRow.id]: "" }));
      }
      await load();
    } catch (e) {
      alert(e.message);
    }
    setRecordBusy(null);
  }

  if (loading || !company) return <p>Loading…</p>;

  const unacked = alerts.filter((a) => !a.acknowledged_at);
  const nowMs = Date.now();
  const waiting = waitingSummary(alerts, nowMs);
  const resolvedByAlert = latestEventByAlert(events, "resolved");
  const assignedByAlert = latestEventByAlert(events, "assigned");
  const resolvedIds = new Set(resolvedByAlert.keys());
  const categoryOptions = [
    ...new Set(alerts.map((a) => a.category || "emergency")),
  ].sort();
  const visibleAlerts = filterEmergencyAlerts(alerts, {
    category: categoryFilter,
    status: statusFilter,
    when: whenFilter,
    resolvedIds,
    nowMs,
  });
  const filtersActive =
    categoryFilter !== "all" || statusFilter !== "all" || whenFilter !== "all";

  return (
    <div>
      <p className="eyebrow">EMERGENCY</p>
      <h2 style={{ fontSize: "1.8rem" }}>Alert log</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>Acknowledging an alert does not clock you in. Only your own scheduled shift or a separate manager-approved clock-in can create a time entry.</p>
      {unacked.length > 0 && (
        <p style={{ fontWeight: 800, color: "#b3261e" }}>
          {unacked.length} needing a response right now
        </p>
      )}
      {waiting.overHour > 0 && (
        <p style={{ fontWeight: 700, color: "#b3261e", marginTop: 4 }}>
          {waiting.overHour} waiting over an hour · longest wait{" "}
          {alertAgeLabel(new Date(nowMs - waiting.oldestMs).toISOString(), nowMs)}
        </p>
      )}
      {alerts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 700 }}>
            Category{" "}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "0.85rem", fontWeight: 700 }}>
            Status{" "}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All alerts</option>
              <option value="needs_response">Needs a response</option>
              <option value="responded">Responded</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
          <label style={{ fontSize: "0.85rem", fontWeight: 700 }}>
            When{" "}
            <select
              value={whenFilter}
              onChange={(e) => setWhenFilter(e.target.value)}
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {alerts.length === 0 && (
          <p style={{ color: "var(--muted)" }}>No alerts. Hopefully it stays that way.</p>
        )}
        {filtersActive && alerts.length > 0 && visibleAlerts.length === 0 && (
          <p style={{ color: "var(--muted)" }}>No alerts match those filters.</p>
        )}
        {visibleAlerts.map((a) => {
          const resolvedEvent = resolvedByAlert.get(a.id) || null;
          const assignedEvent = assignedByAlert.get(a.id) || null;
          return (
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
                  🚨 {a.company_members?.display_name || "Someone"}{a.category ? ` · ${a.category.replaceAll("_", " ")}` : ""}
                  <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: "0.85rem" }}>
                    {" "}→ {a.audience === "owner" ? "Owner" : "Managers & supervisors"}
                  </span>
                </div>
                <div style={{ marginTop: 4 }}>{a.message}</div>
                {portalMessageId(a) && (
                  <div style={{ marginTop: 6 }}>
                    <Link
                      href={`/app/${company.id}/client-portal?message=${portalMessageId(a)}`}
                      style={{ color: "var(--brand-deep)", fontWeight: 700 }}
                    >
                      Open customer request →
                    </Link>
                  </div>
                )}
                <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4 }}>
                  {new Date(a.created_at).toLocaleString()}
                  {a.acknowledged_at && " • ✅ Responded"}
                  {!a.acknowledged_at && (
                    <span style={{ color: "#b3261e", fontWeight: 700 }}>
                      {" "}• Waiting {alertAgeLabel(a.created_at, nowMs)}
                    </span>
                  )}
                </div>
                {a.location_name && (
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                    📍 {a.location_name}
                  </div>
                )}
                {a.acknowledged_at && a.acknowledged_by && names[a.acknowledged_by] && (
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                    Responded by {names[a.acknowledged_by]}
                  </div>
                )}
                {assignedEvent && names[assignedEvent.assignee_member_id] && (
                  <div style={{ fontSize: "0.85rem", marginTop: 4 }}>
                    Assigned to{" "}
                    <strong>{names[assignedEvent.assignee_member_id]}</strong>
                  </div>
                )}
                {resolvedEvent && (
                  <div style={{ fontSize: "0.85rem", marginTop: 4 }}>
                    ✅ Resolved {new Date(resolvedEvent.created_at).toLocaleString()}
                    {resolvedEvent.actor_id && names[resolvedEvent.actor_id]
                      ? ` by ${names[resolvedEvent.actor_id]}`
                      : ""}
                    {resolvedEvent.detail ? ` — ${resolvedEvent.detail}` : ""}
                  </div>
                )}
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
            {eventsOk && canAck && !resolvedEvent && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                    Assign to{" "}
                    <select
                      value={assignPick[a.id] || ""}
                      onChange={(e) =>
                        setAssignPick((prev) => ({ ...prev, [a.id]: e.target.value }))
                      }
                    >
                      <option value="">Choose a responder…</option>
                      {responders.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() => recordEvent(a, "assigned")}
                    disabled={recordBusy === a.id || !assignPick[a.id]}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: "1px solid var(--line)",
                      background: "#fff",
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {recordBusy === a.id ? "…" : "Assign"}
                  </button>
                </div>
                {a.acknowledged_at && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      value={resolutionNote[a.id] || ""}
                      onChange={(e) =>
                        setResolutionNote((prev) => ({ ...prev, [a.id]: e.target.value }))
                      }
                      placeholder="Resolution note (optional — what was done)"
                      maxLength={500}
                      style={{
                        flex: 1,
                        minWidth: 220,
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        fontFamily: "inherit",
                      }}
                    />
                    <button
                      onClick={() => recordEvent(a, "resolved")}
                      disabled={recordBusy === a.id}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 999,
                        border: "none",
                        background: "#28704a",
                        color: "#fff",
                        fontWeight: 800,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {recordBusy === a.id ? "…" : "Mark resolved"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>
      {alerts.length === limit && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setLimit((l) => l + 50)}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid var(--line)",
              background: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Show more alerts
          </button>
        </div>
      )}
    </div>
  );
}
