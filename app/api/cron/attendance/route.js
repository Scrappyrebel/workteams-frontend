import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendOwnerAlert } from "../../../../lib/owner-alerts";
import { shiftBounds, hasShiftAttendance } from "../../../../lib/attendance-shifts.mjs";
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

// "YYYY-MM-DD" date arithmetic.
function addDays(dateText, n) {
  const [y, m, d] = String(dateText).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = admin();
  const now = new Date();
  const earliest = new Date(now.getTime() - 6 * 3600000);
  // Wide UTC window covering "yesterday..today" in every US timezone
  // (UTC-10..UTC-4); each shift is then filtered by its own company's
  // local date below.
  const utcToday = dateInTz(now, "UTC");
  const wideStart = addDays(utcToday, -2);
  const wideEnd = addDays(utcToday, 1);

  // Do not send false "no-show" notices when the schedule or attendance data
  // is unavailable: fail CLOSED on any read error rather than assume absence.
  const { data: shifts, error: shiftError } = await sb
    .from("shifts")
    .select("id, company_id, member_id, location_id, shift_date, start_time, end_time, locations(name), company_members!shifts_member_id_fkey(display_name)")
    .not("member_id", "is", null)
    .gte("shift_date", wideStart)
    .lte("shift_date", wideEnd);
  if (shiftError) throw shiftError;

  // Per-company timezones for local day boundaries and shift-time math.
  const companyIds = [...new Set((shifts || []).map((s) => s.company_id).filter(Boolean))];
  const { data: companies } = companyIds.length
    ? await sb.from("companies").select("id, timezone").in("id", companyIds)
    : { data: [] };
  const tzOf = Object.fromEntries(
    (companies || []).map((c) => [c.id, c.timezone || DEFAULT_TZ])
  );
  const tzFor = (shift) => tzOf[shift.company_id] || DEFAULT_TZ;

  const candidates = (shifts || []).filter((shift) => {
    if (!shift.location_id || !shift.start_time || !shift.end_time) return false;
    // Company-local day window: only yesterday/today where the company is.
    const localToday = dateInTz(now, tzFor(shift));
    if (shift.shift_date < addDays(localToday, -1) || shift.shift_date > localToday) return false;
    const scheduled = shiftBounds(shift, tzFor(shift)).start;
    return scheduled <= now && scheduled >= earliest;
  });
  if (!candidates.length) return NextResponse.json({ ok: true, alerts: 0 });

  const memberIds = [...new Set(candidates.map((s) => s.member_id))];
  const entries = [];
  // Pagination avoids the Supabase 1,000-row default truncation which could
  // otherwise incorrectly label employees absent in busier companies.
  const PAGE_SIZE = 500;
  for (const batch of chunks(memberIds)) {
    let ended = false;
    for (let page = 0; page < 20; page++) {
      const { data: rows, error } = await sb.from("time_entries")
        .select("id, company_id, member_id, location_id, shift_id, clock_in, clock_out")
        .in("member_id", batch)
        .gte("clock_in", new Date(now.getTime() - 48 * 3600000).toISOString())
        .lte("clock_in", now.toISOString())
        .order("clock_in", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      entries.push(...(rows || []));
      if ((rows || []).length < PAGE_SIZE) { ended = true; break; }
    }
    if (!ended) throw new Error("Attendance query truncated; no false missing-clock alerts sent.");
  }

  // One missing-attendance notification per scheduled shift. Old versions
  // generated TWO (missing-clock at 10 min and no-show at 30 min). Respect
  // both historical keys so the new version doesn't send a THIRD alert.
  const existingKeys = new Set();
  for (const batch of chunks(candidates.map((s) => s.id))) {
    const keys = batch.flatMap((id) => [
      `attendance:${id}`, `missing-clock:${id}`, `no-show:${id}`,
    ]);
    const { data: alerts, error } = await sb.from("emergency_alerts")
      .select("dedupe_key")
      .eq("category", "schedule_coverage")
      .in("dedupe_key", keys);
    if (error) throw error;
    for (const alert of alerts || []) existingKeys.add(alert.dedupe_key);
  }

  let alerts = 0;
  for (const shift of candidates) {
    const tz = tzFor(shift);
    const { start, end } = shiftBounds(shift, tz);
    const onSite = entries.filter((e) =>
      e.company_id === shift.company_id &&
      e.member_id === shift.member_id &&
      e.location_id === shift.location_id
    );

    if (hasShiftAttendance(shift, onSite, now, tz)) {
      // Leave overtime detection intact, but NEVER treat a clock-in linked to
      // an unrelated morning shift as an overtime entry for a later shift.
      const open = onSite.find((e) => e.shift_id === shift.id && !e.clock_out);
      const overMinutes = Math.floor((now.getTime() - end.getTime()) / 60000);
      if (open && overMinutes >= 15 && overMinutes <= 12 * 60) {
        const memberName = shift.company_members?.display_name || "Employee";
        const locationName = shift.locations?.name || "assigned location";
        const result = await sendOwnerAlert(sb, {
          companyId: shift.company_id,
          senderMemberId: shift.member_id,
          category: "schedule_coverage",
          title: `⏰ Overtime — ${memberName}`,
          message: `${memberName} is ${overMinutes} minutes past their scheduled end time at ${locationName}.`,
          locationName,
          dedupeKey: `overtime:${shift.id}`,
          tag: `overtime-${shift.id}`,
          url: `${appUrlFrom(req)}/app/${shift.company_id}/time`,
        });
        if (!result.duplicate) alerts++;
      }
      continue;
    }

    const lateMinutes = Math.floor((now.getTime() - start.getTime()) / 60000);
    if (lateMinutes < 10) continue;
    if ([`attendance:${shift.id}`, `missing-clock:${shift.id}`, `no-show:${shift.id}`]
        .some((key) => existingKeys.has(key))) continue;

    // A mobile employee may have just clocked in while this cron ran. Check
    // fresh database state for THIS person, company, location and work period
    // immediately before sending any notification.
    const { data: recent, error: recentError } = await sb.from("time_entries")
      .select("id, company_id, member_id, location_id, shift_id, clock_in, clock_out")
      .eq("company_id", shift.company_id)
      .eq("member_id", shift.member_id)
      .eq("location_id", shift.location_id)
      .gte("clock_in", new Date(start.getTime() - 60 * 60000).toISOString())
      .lte("clock_in", now.toISOString())
      .order("clock_in", { ascending: false })
      .limit(200);
    if (recentError) throw recentError;
    if (hasShiftAttendance(shift, recent, now, tz)) continue;

    const memberName = shift.company_members?.display_name || "Employee";
    const locationName = shift.locations?.name || "assigned location";
    const dedupeKey = `attendance:${shift.id}`;
    const result = await sendOwnerAlert(sb, {
      companyId: shift.company_id,
      senderMemberId: shift.member_id,
      category: "schedule_coverage",
      title: `⚠️ Missing clock-in — ${memberName}`,
      message: `${memberName} has no confirmed clock-in at ${locationName}, ${lateMinutes} minutes past the scheduled start.`,
      locationName,
      dedupeKey,
      tag: `attendance-${shift.id}`,
      url: `${appUrlFrom(req)}/app/${shift.company_id}/time`,
    });
    existingKeys.add(dedupeKey);
    if (!result.duplicate) alerts++;
  }
  return NextResponse.json({ ok: true, alerts });
}
