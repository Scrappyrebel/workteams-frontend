import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import { sendPush, pushConfigured } from "../../../../lib/push";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP_URL = process.env.WORKTEAMS_APP_URL || "https://app.lillybsjanitorial.com";

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

// POST { companyId, audience: 'owner'|'leaders', message, locationName? }
// Creates the alert and pushes it to every subscribed device of the audience.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`emergency:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { companyId, audience, category, message, locationName } = await req.json();
    if (!companyId || !["owner", "leaders"].includes(audience) || !message?.trim()) {
      return NextResponse.json({ error: "companyId, audience and message are required" }, { status: 400 });
    }

    const sb = admin();
    const { data: sender } = await sb
      .from("company_members")
      .select("id, display_name")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!sender) return NextResponse.json({ error: "Not a member" }, { status: 403 });

    const { data: alert, error: insertErr } = await sb
      .from("emergency_alerts")
      .insert({
        company_id: companyId,
        sender_member_id: sender.id,
        audience,
        category: String(category || "emergency").slice(0, 40),
        message: message.trim().slice(0, 500),
        location_name: locationName?.trim().slice(0, 120) || null,
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    // Who gets woken up?
    const roles = audience === "owner" ? ["owner"] : ["owner", "admin", "supervisor"];
    const { data: targets } = await sb
      .from("company_members")
      .select("id")
      .eq("company_id", companyId)
      .in("role", roles);
    const targetIds = (targets || []).map((t) => t.id).filter((id) => id !== sender.id);
    // The sender's own alert shows in their app; they don't need a push.
    if (targetIds.length === 0 && audience === "owner") {
      // Owner alerting themselves — still fine, just no push targets.
    }

    let pushed = 0;
    if (targetIds.length > 0 && pushConfigured()) {
      const { data: subs } = await sb
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .in("member_id", targetIds);
      const categoryLabels = {
        clock_issue: "Clock-in / clock-out problem",
        safety: "Safety alert",
        customer_issue: "Customer / communication-book issue",
        schedule_coverage: "Schedule / coverage issue",
        proof_upload: "Proof / upload problem",
        equipment: "Equipment / supply issue",
        emergency: "Urgent employee alert",
      };
      const payload = {
        title: `🚨 ${categoryLabels[category] || categoryLabels.emergency} — ${sender.display_name}`,
        body: `${message.trim().slice(0, 140)}${locationName ? ` (${locationName.trim().slice(0, 60)})` : ""}`,
        tag: `emergency-${alert.id}`,
        url: `${APP_URL}/app/${companyId}/emergency`,
      };
      const deadIds = [];
      for (const s of subs || []) {
        const r = await sendPush(s, payload);
        if (r.ok) pushed++;
        else if (r.dead) deadIds.push(s.id);
      }
      if (deadIds.length > 0) {
        await sb.from("push_subscriptions").delete().in("id", deadIds);
      }
    }

    return NextResponse.json({ ok: true, alertId: alert.id, pushed, pushReady: pushConfigured() });
  } catch (e) {
    console.error("emergency send error", e);
    return NextResponse.json({ error: "Could not send the alert. Try again." }, { status: 500 });
  }
}
