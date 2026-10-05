import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendOwnerAlert } from "../../../../lib/owner-alerts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

function offsetMinutesAt(date, timeZone) {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).find((x) => x.type === "timeZoneName")?.value || "GMT+00:00";
  const match = part.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function localShiftToUtc(dateText, timeText, timeZone = "America/Chicago") {
  const [y,m,d] = String(dateText).split("-").map(Number);
  const [hh,mm,ss=0] = String(timeText).split(":").map(Number);
  const probe = new Date(Date.UTC(y,m-1,d,hh,mm,ss));
  const offset = offsetMinutesAt(probe, timeZone);
  return new Date(Date.UTC(y,m-1,d,hh,mm,ss) - offset * 60000);
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = admin();
  const now = new Date();
  const earliest = new Date(now.getTime() - 6 * 3600000);
  const chicagoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const yesterday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now.getTime() - 24 * 3600000));

  const { data: shifts, error } = await sb
    .from("shifts")
    .select("id, company_id, member_id, location_id, shift_date, start_time, locations(name), company_members!shifts_member_id_fkey(display_name)")
    .not("member_id", "is", null)
    .gte("shift_date", yesterday)
    .lte("shift_date", chicagoDate);
  if (error) throw error;

  const ids = (shifts || []).map((s) => s.id);
  const { data: entries } = ids.length
    ? await sb.from("time_entries").select("shift_id").in("shift_id", ids)
    : { data: [] };
  const clocked = new Set((entries || []).map((x) => x.shift_id));

  let alerts = 0;
  for (const shift of shifts || []) {
    if (clocked.has(shift.id)) continue;
    const scheduled = localShiftToUtc(shift.shift_date, shift.start_time);
    if (scheduled > now || scheduled < earliest) continue;
    const lateMinutes = Math.floor((now - scheduled) / 60000);
    if (lateMinutes < 10) continue;
    const critical = lateMinutes >= 30;
    const memberName = shift.company_members?.display_name || "Employee";
    const locationName = shift.locations?.name || "assigned location";
    const result = await sendOwnerAlert(sb, {
      companyId: shift.company_id,
      senderMemberId: shift.member_id,
      category: "schedule_coverage",
      title: critical ? `🚨 Possible no-show — ${memberName}` : `⚠️ Missing clock-in — ${memberName}`,
      message: `${memberName} has not clocked in at ${locationName} and is ${lateMinutes} minutes past the scheduled start.`,
      locationName,
      dedupeKey: `${critical ? "no-show" : "missing-clock"}:${shift.id}`,
      tag: `${critical ? "no-show" : "missing-clock"}-${shift.id}`,
      url: `${process.env.WORKTEAMS_APP_URL || "https://app.lillybsjanitorial.com"}/app/${shift.company_id}/emergency`,
    });
    if (!result.duplicate) alerts++;
  }

  return NextResponse.json({ ok: true, alerts });
}
