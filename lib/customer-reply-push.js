import { sendPush, pushConfigured } from "./push";
import {
  getNotificationPrefs,
  wantsNotification,
  getCompanyTimezone,
  pushHeldByQuietHours,
} from "./notification-prefs";
import { APP_URL } from "./app-url";

// Member phone push for a CUSTOMER reply in the portal conversation —
// the opposite direction of migration 071 (which emails the customer
// when management replies). Until this helper existed, the saved
// "customer_replies" preference (migration 068) had no send path at
// all: a customer reply raised the in-app management alert and the
// inbox unread flag (migration 065), but no manager's phone buzzed.
//
// Recipients mirror exactly who sees those 065 unread flags: the
// client-portal inbox is owner/admin only, and so is this push. Each
// recipient's saved "customer_replies" preference is honored, then
// quiet hours (migration 072) through the same shared check the other
// non-urgent send paths use — a customer reply is not urgent, and the
// emergency channel is untouched. Held means the push is not sent at
// that moment; the reply and the in-app alert are already saved, and
// nothing is queued or re-sent.
//
// Privacy: the payload says a customer replied and names the location
// only. It never contains the reply text (this helper never reads the
// replies table at all) and never names the customer — the deep link
// opens the exact conversation in the management inbox.
//
// Server-side only: callers pass a service-role Supabase client.
// Fully fail-soft: any failure returns { pushed: 0 } and can never
// affect the customer's reply, which is already saved before this runs.
export async function pushCustomerReplyToManagement(sb, { messageId, replyId, baseUrl }) {
  try {
    if (!sb || !messageId) return { pushed: 0, held: 0 };

    const { data: msg } = await sb
      .from("portal_messages")
      .select("id, company_id, location_id")
      .eq("id", messageId)
      .maybeSingle();
    if (!msg?.company_id) return { pushed: 0, held: 0 };

    if (!pushConfigured()) return { pushed: 0, held: 0 };

    // The 065 audience: the owners and managers who work the inbox.
    const { data: memberRows } = await sb
      .from("company_members")
      .select("id")
      .eq("company_id", msg.company_id)
      .in("role", ["owner", "admin"]);
    const recipientIds = (memberRows || []).map((m) => m.id);
    if (recipientIds.length === 0) return { pushed: 0, held: 0 };

    // Honor per-category preferences (missing table / no row = all on),
    // then quiet hours: a recipient inside their saved window is not
    // buzzed. The reply itself is already saved in the app — only the
    // push is held, and nothing is queued or re-sent.
    const prefs = await getNotificationPrefs(sb, recipientIds);
    const timeZone = await getCompanyTimezone(sb, msg.company_id);
    const wants = recipientIds.filter((id) => wantsNotification(prefs, id, "customer_replies"));
    const targets = wants.filter((id) => !pushHeldByQuietHours(prefs, id, timeZone));
    const held = wants.length - targets.length;
    if (targets.length === 0) return { pushed: 0, held };

    let locationName = null;
    if (msg.location_id) {
      const { data: loc } = await sb
        .from("locations")
        .select("name")
        .eq("id", msg.location_id)
        .maybeSingle();
      locationName = loc?.name || null;
    }

    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, member_id, endpoint, p256dh, auth")
      .in("member_id", targets);

    const body = locationName
      ? `A customer replied to a service request at ${locationName}.`
      : "A customer replied to a service request.";
    let pushed = 0;
    const dead = [];
    for (const s of subs || []) {
      const r = await sendPush(s, {
        title: "💬 Customer reply",
        body: body.slice(0, 180),
        tag: `customer-reply-${replyId || messageId}`,
        url: `${baseUrl || APP_URL}/app/${msg.company_id}/client-portal?message=${messageId}`,
      });
      if (r.ok) pushed++;
      else if (r.dead) dead.push(s.id);
    }
    if (dead.length) await sb.from("push_subscriptions").delete().in("id", dead);
    return { pushed, held };
  } catch {
    return { pushed: 0, held: 0 };
  }
}
