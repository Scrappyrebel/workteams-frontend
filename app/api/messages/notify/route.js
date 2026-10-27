import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush, pushConfigured } from "../../../../lib/push";
import {
  getNotificationPrefs,
  wantsNotification,
  getCompanyTimezone,
  pushHeldByQuietHours,
} from "../../../../lib/notification-prefs";
import { appUrlFrom } from "../../../../lib/app-url";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

async function authedUser(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser();
  return user || null;
}

// POST { companyId, messageId }
// Pushes a crew-chat message (table: messages) to the rest of the company,
// honoring each recipient's "messages" preference (migration 068, read
// tolerantly — missing table / no row means all-on, exactly like the
// schedule-request notifications). The message itself is already saved by
// the chat page; this route only notifies. Until this route existed the
// saved Messages & announcements preference sent nothing at all.
export async function POST(req) {
  try {
    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { companyId, messageId } = await req.json();
    if (!companyId || !messageId) {
      return NextResponse.json({ error: "companyId and messageId are required" }, { status: 400 });
    }

    const sb = admin();
    const { data: actor } = await sb
      .from("company_members")
      .select("id, display_name")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!actor) return NextResponse.json({ error: "Not a member" }, { status: 403 });

    const { data: message } = await sb
      .from("messages")
      .select("id, company_id, sender_id, content")
      .eq("id", messageId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    // Only the sender can announce their own message — the same discipline
    // as the schedule-request "created" event.
    if (message.sender_id !== actor.id) {
      return NextResponse.json({ error: "Only the sender can announce a message" }, { status: 403 });
    }

    if (!pushConfigured()) {
      return NextResponse.json({ ok: true, pushed: 0 });
    }

    const { data: memberRows } = await sb
      .from("company_members")
      .select("id")
      .eq("company_id", companyId);
    const recipientIds = (memberRows || [])
      .map((m) => m.id)
      .filter((id) => id !== actor.id);
    if (recipientIds.length === 0) return NextResponse.json({ ok: true, pushed: 0 });

    // Honor per-category preferences (missing table / no row = all on),
    // then quiet hours (migration 072): a recipient inside their saved
    // window is not buzzed. The message itself is already saved in the
    // app — only the push is held, and nothing is queued or re-sent.
    const prefs = await getNotificationPrefs(sb, recipientIds);
    const timeZone = await getCompanyTimezone(sb, companyId);
    const wants = recipientIds.filter((id) => wantsNotification(prefs, id, "messages"));
    const targets = wants.filter((id) => !pushHeldByQuietHours(prefs, id, timeZone));
    const held = wants.length - targets.length;
    if (targets.length === 0) return NextResponse.json({ ok: true, pushed: 0, held });

    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, member_id, endpoint, p256dh, auth")
      .in("member_id", targets);

    const senderName = actor.display_name || "A teammate";
    const preview = String(message.content || "").replace(/\s+/g, " ").trim();
    let pushed = 0;
    const dead = [];
    for (const s of subs || []) {
      const r = await sendPush(s, {
        title: "💬 Crew chat",
        body: `${senderName}: ${preview}`.slice(0, 180),
        tag: `crew-message-${message.id}`,
        url: `${appUrlFrom(req)}/app/${companyId}/messages`,
      });
      if (r.ok) pushed++;
      else if (r.dead) dead.push(s.id);
    }
    if (dead.length) await sb.from("push_subscriptions").delete().in("id", dead);
    return NextResponse.json({ ok: true, pushed, held });
  } catch (e) {
    console.error("message notify error", e);
    return NextResponse.json({ error: "Could not send notifications." }, { status: 500 });
  }
}
