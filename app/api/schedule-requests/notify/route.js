import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush, pushConfigured } from "../../../../lib/push";
import { getNotificationPrefs, wantsNotification } from "../../../../lib/notification-prefs";
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

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}

// POST { companyId, requestId, event: "created" | "decided" | "swap_answered" }
// Pushes about schedule requests (migration 067), honoring each recipient's
// per-category preferences (migration 068, read tolerantly — missing table
// means everyone is all-on). Requests themselves are records; this route
// only notifies. The actual schedule is never changed here.
export async function POST(req) {
  try {
    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { companyId, requestId, event } = await req.json();
    if (!companyId || !requestId || !["created", "decided", "swap_answered"].includes(event)) {
      return NextResponse.json({ error: "companyId, requestId and a valid event are required" }, { status: 400 });
    }

    const sb = admin();
    const { data: actor } = await sb
      .from("company_members")
      .select("id, display_name, role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!actor) return NextResponse.json({ error: "Not a member" }, { status: 403 });

    const { data: request } = await sb
      .from("schedule_requests")
      .select("id, company_id, member_id, request_type, shift_id, swap_with_member_id, swap_status, start_date, end_date, status, decision_note")
      .eq("id", requestId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    const { data: memberRows } = await sb
      .from("company_members")
      .select("id, display_name, role")
      .eq("company_id", companyId);
    const byId = {};
    for (const m of memberRows || []) byId[m.id] = m;
    const requester = byId[request.member_id];
    const requesterName = requester?.display_name || "A teammate";
    const isManager = actor.role === "owner" || actor.role === "admin";

    // Shift details for swap messages.
    let shiftText = "a shift";
    if (request.shift_id) {
      const { data: shift } = await sb
        .from("shifts")
        .select("shift_date, start_time, end_time, locations(name)")
        .eq("id", request.shift_id)
        .maybeSingle();
      if (shift) {
        shiftText = `the ${fmtDate(shift.shift_date)} ${fmtTime(shift.start_time)}–${fmtTime(shift.end_time)} shift${shift.locations?.name ? ` at ${shift.locations.name}` : ""}`;
      }
    }
    const whenText = request.request_type === "time_off"
      ? `${fmtDate(request.start_date)} – ${fmtDate(request.end_date)}`
      : shiftText;

    // Who gets a push: [{ memberId, title, body, url }]
    const outbox = [];
    const managerIds = (memberRows || [])
      .filter((m) => m.role === "owner" || m.role === "admin")
      .map((m) => m.id);

    if (event === "created") {
      if (actor.id !== request.member_id) {
        return NextResponse.json({ error: "Only the requester can announce a new request" }, { status: 403 });
      }
      const title = request.request_type === "time_off" ? "📅 New time-off request" : "🔁 New shift-swap request";
      const body = request.request_type === "time_off"
        ? `${requesterName} asked for time off ${whenText}.`
        : `${requesterName} asked to swap ${shiftText}.`;
      for (const id of managerIds) {
        if (id === actor.id) continue;
        outbox.push({ memberId: id, title, body, url: `${appUrlFrom(req)}/app/${companyId}/schedule` });
      }
      if (request.request_type === "swap" && request.swap_with_member_id) {
        outbox.push({
          memberId: request.swap_with_member_id,
          title: "🔁 Shift swap request",
          body: `${requesterName} asked if you can take ${shiftText}. Tap to answer.`,
          url: `${appUrlFrom(req)}/app/${companyId}/my-schedule`,
        });
      }
    } else if (event === "decided") {
      if (!isManager) {
        return NextResponse.json({ error: "Only a manager can announce a decision" }, { status: 403 });
      }
      if (request.status !== "approved" && request.status !== "denied") {
        return NextResponse.json({ ok: true, pushed: 0 });
      }
      const approved = request.status === "approved";
      outbox.push({
        memberId: request.member_id,
        title: approved ? "✅ Request approved" : "❌ Request denied",
        body: request.request_type === "time_off"
          ? `Your time off ${whenText} was ${approved ? "approved" : "denied"}${request.decision_note ? ` — ${request.decision_note}` : ""}.`
          : `Your swap request for ${shiftText} was ${approved ? "approved" : "denied"}${request.decision_note ? ` — ${request.decision_note}` : ""}.`,
        url: `${appUrlFrom(req)}/app/${companyId}/my-schedule`,
      });
    } else if (event === "swap_answered") {
      if (actor.id !== request.swap_with_member_id) {
        return NextResponse.json({ error: "Only the teammate asked can announce a swap answer" }, { status: 403 });
      }
      const accepted = request.swap_status === "accepted";
      const answerText = `${actor.display_name || "Your teammate"} ${accepted ? "accepted" : "declined"} the swap for ${shiftText}.`;
      outbox.push({
        memberId: request.member_id,
        title: accepted ? "🔁 Swap accepted" : "🔁 Swap declined",
        body: answerText,
        url: `${appUrlFrom(req)}/app/${companyId}/my-schedule`,
      });
      for (const id of managerIds) {
        if (id === actor.id || id === request.member_id) continue;
        outbox.push({
          memberId: id,
          title: accepted ? "🔁 Swap accepted" : "🔁 Swap declined",
          body: answerText,
          url: `${appUrlFrom(req)}/app/${companyId}/schedule`,
        });
      }
    }

    if (outbox.length === 0 || !pushConfigured()) {
      return NextResponse.json({ ok: true, pushed: 0 });
    }

    // Honor per-category preferences (missing table / no row = all on).
    const prefs = await getNotificationPrefs(sb, outbox.map((o) => o.memberId));
    const targets = outbox.filter((o) => wantsNotification(prefs, o.memberId, "schedule_changes"));
    if (targets.length === 0) return NextResponse.json({ ok: true, pushed: 0 });

    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, member_id, endpoint, p256dh, auth")
      .in("member_id", [...new Set(targets.map((t) => t.memberId))]);
    const subsByMember = {};
    for (const s of subs || []) (subsByMember[s.member_id] ||= []).push(s);

    let pushed = 0;
    const dead = [];
    for (const t of targets) {
      for (const s of subsByMember[t.memberId] || []) {
        const r = await sendPush(s, {
          title: t.title,
          body: String(t.body).slice(0, 180),
          tag: `schedule-request-${request.id}`,
          url: t.url,
        });
        if (r.ok) pushed++;
        else if (r.dead) dead.push(s.id);
      }
    }
    if (dead.length) await sb.from("push_subscriptions").delete().in("id", dead);
    return NextResponse.json({ ok: true, pushed });
  } catch (e) {
    console.error("schedule request notify error", e);
    return NextResponse.json({ error: "Could not send notifications." }, { status: 500 });
  }
}
