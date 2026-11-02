// Emergency alert record events (D-WT-53 depth) — tolerant helpers.
//
// Migration 086 adds public.emergency_alert_events: an append-only
// record written from the alert log page by supervisors and up (the
// roles that can acknowledge). Each row captures either an assignment
// (the alert handed to a named responder) or a resolution (the alert
// closed, with an optional note saying what was done).
//
// Everything here is fail-soft by design: before migration 086 runs,
// or if the table is unreachable for any reason, loads return
// { ok: false, events: [] } and the log page renders exactly as it did
// before this build — no assignment or resolution controls, no extra
// lines. Recording an event is best-effort and never throws, and it
// never touches the existing acknowledge path: acknowledging an alert
// still happens exactly as before, whether or not an event lands.

export const EMERGENCY_ALERT_EVENT_TYPES = ["assigned", "resolved"];

const EVENT_SELECT =
  "id, alert_id, event_type, assignee_member_id, detail, actor_id, created_at";

// Load the recorded events for a set of alerts, oldest first.
// Returns { ok, events } — ok is false on ANY error (missing table,
// permission, network), with events [] so callers can simply hide the
// assignment/resolution layer.
export async function loadEmergencyAlertEvents(sb, alertIds) {
  try {
    const ids = Array.isArray(alertIds) ? alertIds.filter(Boolean) : [];
    if (ids.length === 0) return { ok: true, events: [] };
    const { data, error } = await sb
      .from("emergency_alert_events")
      .select(EVENT_SELECT)
      .in("alert_id", ids)
      .order("created_at", { ascending: true });
    if (error) return { ok: false, events: [] };
    return { ok: true, events: Array.isArray(data) ? data : [] };
  } catch {
    return { ok: false, events: [] };
  }
}

// Record one event for an alert. 'assigned' rows exist only to name a
// responder, so they require an assignee; 'resolved' rows carry the
// optional resolution note exactly as typed (empty note still closes
// the alert — the closure itself is the record). Returns true when a
// row was written.
export async function recordEmergencyAlertEvent(
  sb,
  { alertId, companyId, actorId, eventType, assigneeMemberId, detail }
) {
  try {
    if (!EMERGENCY_ALERT_EVENT_TYPES.includes(eventType)) return false;
    if (eventType === "assigned" && !assigneeMemberId) return false;
    const text = typeof detail === "string" ? detail.trim() : "";
    const { error } = await sb.from("emergency_alert_events").insert({
      alert_id: alertId,
      company_id: companyId,
      actor_id: actorId || null,
      event_type: eventType,
      assignee_member_id:
        eventType === "assigned" ? assigneeMemberId : null,
      detail: text || null,
    });
    return !error;
  } catch {
    return false;
  }
}

// The most recent event of one type per alert, as a Map of
// alert_id → event. Events are expected oldest-first (the load order),
// so the last row seen for an alert wins.
export function latestEventByAlert(events, eventType) {
  const map = new Map();
  if (!Array.isArray(events)) return map;
  for (const e of events) {
    if (e && e.event_type === eventType && e.alert_id) map.set(e.alert_id, e);
  }
  return map;
}

// How an alert's triage state reads for filtering: an alert with a
// recorded resolution is "resolved"; otherwise its stored
// acknowledged_at decides between "responded" and "needs_response".
export function alertStatusKey(alert, resolvedIds) {
  if (resolvedIds && resolvedIds.has(alert?.id)) return "resolved";
  return alert?.acknowledged_at ? "responded" : "needs_response";
}

// Pure triage filter over the alerts already loaded, using only stored
// fields: category (exact stored value), status (derived above), and
// date (created_at within the chosen window). "today" is the local
// calendar day; "7d"/"30d" are rolling windows ending now.
export function filterEmergencyAlerts(
  alerts,
  { category = "all", status = "all", when = "all", resolvedIds = null, nowMs = Date.now() } = {}
) {
  const rows = Array.isArray(alerts) ? alerts : [];
  return rows.filter((a) => {
    if (!a) return false;
    if (category !== "all" && (a.category || "emergency") !== category) return false;
    if (status !== "all" && alertStatusKey(a, resolvedIds) !== status) return false;
    if (when !== "all") {
      const t = new Date(a.created_at).getTime();
      if (!Number.isFinite(t)) return false;
      if (when === "today") {
        const start = new Date(nowMs);
        start.setHours(0, 0, 0, 0);
        if (t < start.getTime()) return false;
      } else if (when === "7d") {
        if (t < nowMs - 7 * 24 * 60 * 60 * 1000) return false;
      } else if (when === "30d") {
        if (t < nowMs - 30 * 24 * 60 * 60 * 1000) return false;
      }
    }
    return true;
  });
}

// Display-only age of a stored timestamp: "12 min", "3 h 5 min",
// "2 d 4 h". Never negative; under a minute reads "under a minute".
export function alertAgeLabel(createdAt, nowMs = Date.now()) {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.floor((nowMs - t) / 60000));
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) {
    const rest = mins % 60;
    return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const restH = hours % 24;
  return restH > 0 ? `${days} d ${restH} h` : `${days} d`;
}

// Ageing summary over the unacknowledged alerts in a loaded set:
// how many are waiting, how many have waited over an hour, and the
// oldest wait in milliseconds (0 when none). Display-only — computed
// from stored created_at values, nothing is written or sent.
export function waitingSummary(alerts, nowMs = Date.now()) {
  const rows = (Array.isArray(alerts) ? alerts : []).filter(
    (a) => a && !a.acknowledged_at
  );
  let overHour = 0;
  let oldestMs = 0;
  for (const a of rows) {
    const t = new Date(a.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    const age = Math.max(0, nowMs - t);
    if (age >= 60 * 60 * 1000) overHour += 1;
    if (age > oldestMs) oldestMs = age;
  }
  return { waiting: rows.length, overHour, oldestMs };
}
