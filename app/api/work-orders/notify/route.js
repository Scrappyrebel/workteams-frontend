import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush, pushConfigured } from "../../../../lib/push";
import {
  getNotificationPrefs,
  getCompanyTimezone,
  pushHeldByQuietHours,
} from "../../../../lib/notification-prefs";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function notifyMember(client, memberId, title, body) {
  if (!pushConfigured()) return 0;
  const { data: subs } = await client
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("member_id", memberId);
  let sent = 0;
  for (const s of subs || []) {
    const r = await sendPush(s, { title, body, tag: `wo-${Date.now()}` });
    if (r.ok) sent++;
    if (r.dead) await client.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
  }
  return sent;
}

// Called after a work order is created/assigned or completed.
// Body: { work_order_id, event: "assigned" | "completed", actor_member_id }
export async function POST(req) {
  try {
    const { work_order_id, event, actor_member_id } = await req.json();
    if (!work_order_id || !["assigned", "completed"].includes(event)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const client = sb();
    const { data: wo } = await client
      .from("work_orders")
      .select("id, title, company_id, assigned_to, location_id")
      .eq("id", work_order_id)
      .maybeSingle();
    if (!wo) return NextResponse.json({ error: "Work order not found." }, { status: 404 });

    const { data: loc } = wo.location_id
      ? await client.from("locations").select("name").eq("id", wo.location_id).maybeSingle()
      : { data: null };
    const where = loc?.name ? ` at ${loc.name}` : "";

    // Quiet hours (migration 072): a work-order push is non-urgent, so a
    // member inside their saved quiet-hours window is not buzzed — the
    // one shared check in lib/notification-prefs.js decides. The work
    // order itself is already saved in the app; only the push is held,
    // and nothing is queued or re-sent later. Members with no window
    // set (or before migration 072 runs) are never held, so behavior
    // is unchanged for them. The response counts held members honestly.
    const held = new Set();
    async function loadQuietHeld(memberIds) {
      const ids = [...new Set((memberIds || []).filter(Boolean))];
      if (ids.length === 0) return;
      const prefs = await getNotificationPrefs(client, ids);
      const timeZone = await getCompanyTimezone(client, wo.company_id);
      for (const id of ids) {
        if (pushHeldByQuietHours(prefs, id, timeZone)) held.add(id);
      }
    }

    if (event === "assigned" && wo.assigned_to && wo.assigned_to !== actor_member_id) {
      await loadQuietHeld([wo.assigned_to]);
      if (!held.has(wo.assigned_to)) {
        await notifyMember(client, wo.assigned_to, "🔧 New work order", `"${wo.title}"${where} — assigned to you.`);
      }
    }
    if (event === "completed") {
      // Notify managers/owners (except the person who completed it).
      const { data: managers } = await client
        .from("company_members")
        .select("id")
        .eq("company_id", wo.company_id)
        .in("role", ["owner", "admin"]);
      const managerIds = (managers || []).map((m) => m.id).filter((id) => id !== actor_member_id);
      await loadQuietHeld(managerIds);
      for (const id of managerIds) {
        if (held.has(id)) continue;
        await notifyMember(client, id, "✅ Work order completed", `"${wo.title}"${where} is done.`);
      }
    }
    return NextResponse.json({ ok: true, held: held.size });
  } catch (e) {
    console.error("work order notify error", e);
    return NextResponse.json({ error: "Could not send notifications." }, { status: 500 });
  }
}
