// Per-category phone-notification preferences (migration 068), plus the
// quiet-hours window and its shared send-path check (migration 072).
//
// A member with no preference row has every category ON — that was the
// behavior before preferences existed, and it is also the fallback whenever
// the preferences table cannot be read (for example before migration 068
// has been run). Send paths therefore never break and never silently mute
// anyone just because the table is missing: a read failure means all-on.
//
// Server-side only: callers pass a service-role Supabase client.

export const NOTIFICATION_CATEGORIES = [
  "schedule_changes",
  "messages",
  "customer_replies",
  "pay",
];

// Returns { [memberId]: { schedule_changes, messages, customer_replies,
// pay, quiet_hours_start, quiet_hours_end } } for the members that HAVE a
// row. Members without a row are simply absent from the map and count as
// all-on (see wantsNotification).
export async function getNotificationPrefs(sb, memberIds) {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (!sb || ids.length === 0) return {};
  let map;
  try {
    const { data, error } = await sb
      .from("member_notification_preferences")
      .select("member_id, schedule_changes, messages, customer_replies, pay")
      .in("member_id", ids);
    if (error) return {};
    map = {};
    for (const row of data || []) map[row.member_id] = row;
  } catch {
    return {};
  }
  // Quiet hours (migration 072) ride in a SEPARATE probe: until that
  // migration runs, the columns do not exist, the probe errors, and the
  // map simply carries no quiet-hours fields — which every check below
  // reads as "no window set" (never held). The category read above is
  // never put at risk by the newer columns.
  try {
    const { data, error } = await sb
      .from("member_notification_preferences")
      .select("member_id, quiet_hours_start, quiet_hours_end")
      .in("member_id", ids);
    if (!error) {
      for (const row of data || []) {
        if (map[row.member_id]) {
          map[row.member_id].quiet_hours_start = row.quiet_hours_start;
          map[row.member_id].quiet_hours_end = row.quiet_hours_end;
        }
      }
    }
  } catch {
    // No quiet-hours columns yet — everyone counts as no window set.
  }
  return map;
}

// Should this member get a phone push for this category?
export function wantsNotification(prefsMap, memberId, category) {
  const row = prefsMap ? prefsMap[memberId] : null;
  if (!row) return true; // no row = all categories on
  return row[category] !== false;
}

// ---------------------------------------------------------------------------
// Quiet hours (migration 072) — the ONE shared check every non-urgent push
// send path uses (crew-chat messages, schedule-request notifications,
// work-order notices). Parity with Workforce's quiet hours (its migration
// 266), in this app's own shape:
//
//   * A member may save a quiet-hours window (start/end) on their
//     preferences row. Both unset = no window = today's behavior exactly.
//   * The window is read in the COMPANY's timezone (companies.timezone,
//     migration 041). A window whose end is earlier than its start wraps
//     past midnight; start equal to end counts as off.
//   * While a member is inside their window, non-urgent pushes are HELD:
//     the underlying message/request/work order is already saved in the
//     app as usual — only the phone push is not sent at that moment.
//     There is deliberately no queue and no scheduler: a held push is
//     simply not sent, never re-sent later.
//   * URGENT always passes: pushHeldByQuietHours(..., urgent = true)
//     never holds. This app's urgent class is the emergency / help
//     channel (the emergency send route and the owner alerts) — it never
//     consulted preferences at all and still never does, so it needs no
//     call here; the flag exists so any future send path states its
//     urgency explicitly instead of re-deriving the rule.
// ---------------------------------------------------------------------------

export const DEFAULT_COMPANY_TIMEZONE = "America/Chicago";

// The company's timezone (migration 041: NOT NULL, default
// 'America/Chicago'). Read tolerantly through the caller's service-role
// client; any failure falls back to the same default the column uses.
export async function getCompanyTimezone(sb, companyId) {
  if (!sb || !companyId) return DEFAULT_COMPANY_TIMEZONE;
  try {
    const { data, error } = await sb
      .from("companies")
      .select("timezone")
      .eq("id", companyId)
      .maybeSingle();
    if (error) return DEFAULT_COMPANY_TIMEZONE;
    const tz = data?.timezone;
    return typeof tz === "string" && tz.trim() ? tz.trim() : DEFAULT_COMPANY_TIMEZONE;
  } catch {
    return DEFAULT_COMPANY_TIMEZONE;
  }
}

// "22:00:00" | "22:00" | "7:05" -> minutes since midnight, or null.
function timeToMinutes(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(mins) ? mins : null;
}

// Minutes since midnight of `date` in `timeZone`, or null if the zone
// cannot be read (an unreadable zone means "not held" — pushes send,
// the safe direction, exactly like a missing preferences table).
function localMinutes(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    let hour = null;
    let minute = null;
    for (const p of parts) {
      if (p.type === "hour") hour = Number(p.value);
      if (p.type === "minute") minute = Number(p.value);
    }
    if (hour == null || minute == null || !Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }
    return (hour % 24) * 60 + minute;
  } catch {
    return null;
  }
}

// Is `prefsRow`'s saved window active at `now`, read in `timeZone`?
// Pure and exported so checks/tests can pin the semantics.
export function inQuietHours(prefsRow, timeZone, now = new Date()) {
  const start = timeToMinutes(prefsRow?.quiet_hours_start);
  const end = timeToMinutes(prefsRow?.quiet_hours_end);
  if (start == null || end == null || start === end) return false;
  const cur = localMinutes(now, timeZone || DEFAULT_COMPANY_TIMEZONE);
  if (cur == null) return false;
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

// Should this member's push be held by quiet hours right now?
export function pushHeldByQuietHours(prefsMap, memberId, timeZone, urgent = false) {
  if (urgent) return false; // urgent pushes are never held
  const row = prefsMap ? prefsMap[memberId] : null;
  if (!row) return false; // no row = no window set
  return inQuietHours(row, timeZone);
}
