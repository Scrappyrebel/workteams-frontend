import { sendPush, pushConfigured } from "./push";

const APP_URL = process.env.WORKTEAMS_APP_URL || "https://app.lillybsjanitorial.com";

export async function sendOwnerAlert(sb, {
  companyId,
  senderMemberId,
  category = "emergency",
  message,
  locationName = null,
  title = "WorkTeams alert",
  tag,
  url,
  dedupeKey = null,
}) {
  let alertId = null;
  if (dedupeKey) {
    const existing = await sb
      .from("emergency_alerts")
      .select("id")
      .eq("company_id", companyId)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (existing.data?.id) return { ok: true, duplicate: true, pushed: 0, alertId: existing.data.id };
  }

  const { data: alert, error } = await sb
    .from("emergency_alerts")
    .insert({
      company_id: companyId,
      sender_member_id: senderMemberId,
      audience: "owner",
      category,
      message: String(message || "").slice(0, 500),
      location_name: locationName ? String(locationName).slice(0, 120) : null,
      dedupe_key: dedupeKey,
    })
    .select("id")
    .single();
  if (error) throw error;
  alertId = alert.id;

  const { data: owners } = await sb
    .from("company_members")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", "owner");
  const ownerIds = (owners || []).map((x) => x.id);
  if (!ownerIds.length || !pushConfigured()) return { ok: true, pushed: 0, alertId };

  const { data: subs } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("member_id", ownerIds);

  let pushed = 0;
  const dead = [];
  for (const sub of subs || []) {
    const result = await sendPush(sub, {
      title,
      body: String(message || "").slice(0, 180),
      tag: tag || `owner-alert-${alertId}`,
      url: url || `${APP_URL}/app/${companyId}/emergency`,
    });
    if (result.ok) pushed++;
    else if (result.dead) dead.push(sub.id);
  }
  if (dead.length) await sb.from("push_subscriptions").delete().in("id", dead);
  return { ok: true, pushed, alertId };
}
