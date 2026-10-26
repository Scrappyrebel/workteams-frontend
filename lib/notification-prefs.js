// Per-category phone-notification preferences (migration 068).
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
// pay } } for the members that HAVE a row. Members without a row are simply
// absent from the map and count as all-on (see wantsNotification).
export async function getNotificationPrefs(sb, memberIds) {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (!sb || ids.length === 0) return {};
  try {
    const { data, error } = await sb
      .from("member_notification_preferences")
      .select("member_id, schedule_changes, messages, customer_replies, pay")
      .in("member_id", ids);
    if (error) return {};
    const map = {};
    for (const row of data || []) map[row.member_id] = row;
    return map;
  } catch {
    return {};
  }
}

// Should this member get a phone push for this category?
export function wantsNotification(prefsMap, memberId, category) {
  const row = prefsMap ? prefsMap[memberId] : null;
  if (!row) return true; // no row = all categories on
  return row[category] !== false;
}
