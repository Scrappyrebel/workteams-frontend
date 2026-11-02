// Work order record events (D-WT-30 depth) — tolerant helpers.
//
// Migration 085 adds public.work_order_events: an append-only record
// written ALONGSIDE the work order page's existing updates. Each row
// captures a status change (from/to), an optional completion record
// (a customer sign-off name and/or completion note typed by the person
// completing the order), or an optional cancellation reason.
//
// Everything here is fail-soft by design: before migration 085 runs,
// or if the table is unreachable for any reason, loads return
// { ok: false, events: [] } and the detail page renders exactly as it
// did before this build. Recording an event is best-effort and never
// throws — a status change that succeeded is never affected by whether
// its history row landed.

export const WORK_ORDER_EVENT_TYPES = ["status", "completion", "cancellation"];

const EVENT_SELECT = "id, event_type, from_status, to_status, detail, actor_id, created_at";

// Load the recorded events for one work order, oldest first.
// Returns { ok, events } — ok is false on ANY error (missing table,
// permission, network), with events [] so callers can simply hide the
// history/completion panels.
export async function loadWorkOrderEvents(sb, orderId) {
  try {
    const { data, error } = await sb
      .from("work_order_events")
      .select(EVENT_SELECT)
      .eq("work_order_id", orderId)
      .order("created_at", { ascending: true });
    if (error) return { ok: false, events: [] };
    return { ok: true, events: Array.isArray(data) ? data : [] };
  } catch {
    return { ok: false, events: [] };
  }
}

// Record one event alongside an update that has ALREADY succeeded.
// detail is free text exactly as typed (a sign-off name, a completion
// note, or a cancellation reason). Empty text records nothing for the
// 'completion'/'cancellation' types — those rows exist only to carry
// what someone actually wrote. Returns true when a row was written.
export async function recordWorkOrderEvent(sb, { orderId, companyId, actorId, eventType, fromStatus, toStatus, detail }) {
  try {
    const text = typeof detail === "string" ? detail.trim() : "";
    if (!WORK_ORDER_EVENT_TYPES.includes(eventType)) return false;
    if ((eventType === "completion" || eventType === "cancellation") && !text) return false;
    const { error } = await sb.from("work_order_events").insert({
      work_order_id: orderId,
      company_id: companyId,
      actor_id: actorId || null,
      event_type: eventType,
      from_status: fromStatus || null,
      to_status: toStatus || null,
      detail: text || null,
    });
    return !error;
  } catch {
    return false;
  }
}

// The stored completion record for an order: the most recent
// 'completion' event, or null when none was recorded (including every
// order completed before this record existed).
export function latestCompletionRecord(events) {
  if (!Array.isArray(events)) return null;
  const rows = events.filter((e) => e && e.event_type === "completion");
  return rows.length ? rows[rows.length - 1] : null;
}

// The stored cancellation reason: the most recent 'cancellation'
// event, or null when none was recorded.
export function latestCancellationRecord(events) {
  if (!Array.isArray(events)) return null;
  const rows = events.filter((e) => e && e.event_type === "cancellation");
  return rows.length ? rows[rows.length - 1] : null;
}
