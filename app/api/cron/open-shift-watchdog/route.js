import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendOwnerAlert } from "../../../../lib/owner-alerts";
import { sendPush, pushConfigured } from "../../../../lib/push";
import { shiftBounds } from "../../../../lib/attendance-shifts.mjs";
import {
  watchdogPlan,
  stageDedupeKey,
  autoCloseDedupeKey,
  autoCloseNote,
  overdueText,
} from "../../../../lib/open-shift-watchdog.mjs";
import { dateInTz, DEFAULT_TZ } from "../../../../lib/dates";
import { appUrlFrom } from "../../../../lib/app-url";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = () => createClient(SUPABASE_URL, SERVICE_KEY);

function chunks(values, n = 75) {
  const out = [];
  for (let i = 0; i < values.length; i += n) out.push(values.slice(i, i + n));
  return out;
}

// Open-shift watchdog sweep (runs every 5 minutes via vercel.json).
//
// The attendance cron alerts ONCE when a shift-linked entry runs 15 min–12 h
// past its scheduled end, then goes silent forever — on Nov 8, 2026 a shift
// ran 56.16 hours unnoticed. This sweep is the backstop behind the punch
// outbox: it watches EVERY still-open entry (linked or not), alerts the
// employee and the owner on a repeating stage schedule (lib/open-shift-
// watchdog.mjs), and at a hard cap (16 h after clock-in, or 12 h past the
// scheduled end, whichever is first) closes the entry AT the cap time with
// an unmistakable AUTO-CLOSED note and an owner alert demanding review
// before payroll. It never touches the punch write path — it only reads
// open entries and closes ones that have passed the cap.
export async function GET(req) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = admin();
  const now = new Date();
  const nowMs = now.getTime();
  // The cap is 16 h after clock-in, so any entry older than 7 days that is
  // somehow still open is legacy residue; the bounded window keeps the
  // sweep cheap while still catching everything the cap can act on.
  const windowStart = new Date(nowMs - 7 * 24 * 3600000).toISOString();

  const entries = [];
  const PAGE_SIZE = 500;
  for (let page = 0; page < 20; page++) {
    const { data: rows, error } = await sb
      .from("time_entries")
      .select("id, company_id, member_id, location_id, shift_id, clock_in, clock_out, notes")
      .is("clock_out", null)
      .gte("clock_in", windowStart)
      .lte("clock_in", now.toISOString())
      .order("clock_in", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    entries.push(...(rows || []));
    if ((rows || []).length < PAGE_SIZE) break;
  }
  if (!entries.length) {
    return NextResponse.json({ ok: true, checked: 0, alerts: 0, autoclose: 0 });
  }

  // Supporting lookups: shifts (scheduled end), company timezones, names.
  const shiftIds = [...new Set(entries.map((e) => e.shift_id).filter(Boolean))];
  const shiftsById = {};
  for (const batch of chunks(shiftIds)) {
    const { data, error } = await sb
      .from("shifts")
      .select("id, company_id, shift_date, start_time, end_time")
      .in("id", batch);
    if (error) throw error;
    for (const s of data || []) shiftsById[s.id] = s;
  }
  const companyIds = [...new Set(entries.map((e) => e.company_id).filter(Boolean))];
  const tzOf = {};
  for (const batch of chunks(companyIds)) {
    const { data, error } = await sb.from("companies").select("id, timezone").in("id", batch);
    if (error) throw error;
    for (const c of data || []) tzOf[c.id] = c.timezone || DEFAULT_TZ;
  }
  const memberIds = [...new Set(entries.map((e) => e.member_id).filter(Boolean))];
  const nameOf = {};
  for (const batch of chunks(memberIds)) {
    const { data, error } = await sb
      .from("company_members")
      .select("id, display_name")
      .in("id", batch);
    if (error) throw error;
    for (const m of data || []) nameOf[m.id] = m.display_name || "Employee";
  }
  const locationIds = [...new Set(entries.map((e) => e.location_id).filter(Boolean))];
  const locationOf = {};
  for (const batch of chunks(locationIds)) {
    const { data, error } = await sb.from("locations").select("id, name").in("id", batch);
    if (error) throw error;
    for (const l of data || []) locationOf[l.id] = l.name || "assigned location";
  }

  // Direct Web Push to the employee's own subscribed devices — the same
  // transport the crew-chat and owner alerts already use. The employee has
  // no emergency_alerts audience, so the push is gated on the stage-1 owner
  // alert being newly created (exactly once per entry).
  async function pushEmployee(entry, { title, body }) {
    if (!pushConfigured()) return 0;
    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("member_id", entry.member_id);
    let pushed = 0;
    const dead = [];
    for (const sub of subs || []) {
      const result = await sendPush(sub, {
        title,
        body: String(body).slice(0, 180),
        tag: `open-shift-${entry.id}`,
        url: `${appUrlFrom(req)}/app/${entry.company_id}/time`,
      });
      if (result.ok) pushed++;
      else if (result.dead) dead.push(sub.id);
    }
    if (dead.length) await sb.from("push_subscriptions").delete().in("id", dead);
    return pushed;
  }

  let alerts = 0;
  let autoclose = 0;
  for (const entry of entries) {
    const shift = entry.shift_id ? shiftsById[entry.shift_id] : null;
    const tz = tzOf[entry.company_id] || DEFAULT_TZ;
    const scheduledEndMs = shift ? shiftBounds(shift, tz).end.getTime() : null;
    const plan = watchdogPlan({
      clockInMs: new Date(entry.clock_in).getTime(),
      scheduledEndMs,
      nowMs,
    });
    if (plan.state === "ok") continue;

    const memberName = nameOf[entry.member_id] || "Employee";
    const locationName = locationOf[entry.location_id] || "assigned location";

    if (plan.state === "autoclose") {
      const capAt = new Date(plan.capAtMs);
      // Close ONLY if the entry is still open — a real clock-out landing
      // during this sweep always wins, and the update reports whether it
      // actually closed anything.
      const { data: closed, error } = await sb
        .from("time_entries")
        .update({
          clock_out: capAt.toISOString(),
          notes: autoCloseNote(entry.notes, { capAt, clockIn: new Date(entry.clock_in) }),
        })
        .eq("id", entry.id)
        .is("clock_out", null)
        .select("id");
      if (error) throw error;
      if (!closed?.length) continue; // employee clocked out first — no alert
      autoclose++;
      const result = await sendOwnerAlert(sb, {
        companyId: entry.company_id,
        senderMemberId: entry.member_id,
        category: "schedule_coverage",
        title: `🛑 Shift auto-closed — ${memberName}`,
        message:
          `${memberName}'s shift at ${locationName} was still open at the safety cap, ` +
          `so the watchdog auto-closed it. These hours were NOT an employee clock-out — ` +
          `review and correct them before payroll.`,
        locationName,
        dedupeKey: autoCloseDedupeKey(entry.id),
        tag: `open-shift-autoclose-${entry.id}`,
        url: `${appUrlFrom(req)}/app/${entry.company_id}/time`,
      });
      if (!result.duplicate) alerts++;
      await pushEmployee(entry, {
        title: "Your shift was auto-closed",
        body: `WorkTeams auto-closed your open shift at ${locationName} because no clock-out was recorded. Tell your manager if the time is wrong.`,
      });
      continue;
    }

    // Escalating alert stage. The dedupe key carries the stage number, so
    // each stage fires once and the NEXT stage fires later — the alerts
    // repeat and widen until the entry closes or hits the cap.
    const result = await sendOwnerAlert(sb, {
      companyId: entry.company_id,
      senderMemberId: entry.member_id,
      category: "schedule_coverage",
      title: `⏰ Still clocked in — ${memberName}`,
      message:
        `${memberName} is still clocked in at ${locationName}, ${overdueText(plan)}. ` +
        `If they finished, they need to clock out; the shift auto-closes at the safety cap if it stays open.`,
      locationName,
      dedupeKey: stageDedupeKey(entry.id, plan.stage),
      tag: `open-shift-${entry.id}`,
      url: `${appUrlFrom(req)}/app/${entry.company_id}/time`,
    });
    if (!result.duplicate) {
      alerts++;
      if (plan.stage === 1) {
        await pushEmployee(entry, {
          title: "You're still clocked in",
          body: `WorkTeams still shows you clocked in at ${locationName}. If you finished your shift, please clock out now.`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, checked: entries.length, alerts, autoclose });
}
