import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Shift offers (POINT 4): agency offers a shift, temp accepts/declines.
// POST: manager creates an offer.
// GET ?companyId=: manager lists all; temp (member token) lists own.
// PATCH: temp accepts/declines; manager cancels.

async function authed(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/, "");
  if (!token) return { error: "Sign in required." };
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Sign in required." };
  return { user, db: createClient(SUPABASE_URL, SERVICE_KEY) };
}

async function isManager(db, companyId, userId) {
  const { data: m } = await db
    .from("company_members")
    .select("id, role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  return m && ["owner", "admin", "manager"].includes(m.role) ? m : null;
}

// Manager creates an offer for a temp.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`temp-offers:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const b = await req.json();
    const { user, db, error } = await authed(req);
    if (error) return NextResponse.json({ error }, { status: 401 });
    const companyId = b.companyId;
    if (!companyId) return NextResponse.json({ error: "companyId required." }, { status: 400 });
    if (!(await isManager(db, companyId, user.id))) {
      return NextResponse.json({ error: "Managers only." }, { status: 403 });
    }
    const required = ["tempMemberId", "clientName", "siteAddress", "shiftDate", "startTime", "endTime", "payRate"];
    for (const k of required) {
      if (!b[k]) return NextResponse.json({ error: `Missing ${k}.` }, { status: 400 });
    }
    const { data, error: insErr } = await db
      .from("temp_shift_offers")
      .insert({
        company_id: companyId,
        request_id: b.requestId || null,
        temp_member_id: b.tempMemberId,
        staffing_type: String(b.staffingType || "cleaning").slice(0, 40),
        client_name: String(b.clientName).slice(0, 200),
        site_address: String(b.siteAddress).slice(0, 500),
        shift_date: b.shiftDate,
        start_time: b.startTime,
        end_time: b.endTime,
        pay_rate: Number(b.payRate),
        respond_by: b.respondBy || null,
        report_to: String(b.reportTo || "").slice(0, 500) || null,
        parking_info: String(b.parkingInfo || "").slice(0, 500) || null,
        access_info: String(b.accessInfo || "").slice(0, 500) || null,
        status: "offered",
      })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ error: "Could not create the offer." }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch {
    return NextResponse.json({ error: "Could not create the offer." }, { status: 500 });
  }
}

// List offers: managers see all for the company; temps see their own.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    if (!companyId) return NextResponse.json({ error: "companyId required." }, { status: 400 });
    const { user, db, error } = await authed(req);
    if (error) return NextResponse.json({ error }, { status: 401 });
    const mgr = await isManager(db, companyId, user.id);
    let q = db.from("temp_shift_offers").select("*").eq("company_id", companyId);
    if (!mgr) {
      const { data: mem } = await db
        .from("company_members")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!mem) return NextResponse.json({ error: "Not a member." }, { status: 403 });
      q = q.eq("temp_member_id", mem.id);
    }
    const { data, error: qErr } = await q.order("shift_date", { ascending: true }).limit(200);
    if (qErr) return NextResponse.json({ error: "Offers unavailable." }, { status: 500 });
    return NextResponse.json({ offers: data || [], isManager: !!mgr });
  } catch {
    return NextResponse.json({ error: "Offers unavailable." }, { status: 500 });
  }
}

// PATCH { id, companyId, action: accepted|declined|cancelled }
export async function PATCH(req) {
  try {
    const b = await req.json();
    const { id, companyId, action } = b;
    if (!id || !companyId || !["accepted", "declined", "cancelled"].includes(action)) {
      return NextResponse.json({ error: "id, companyId and a valid action are required." }, { status: 400 });
    }
    const { user, db, error } = await authed(req);
    if (error) return NextResponse.json({ error }, { status: 401 });
    const { data: offer } = await db
      .from("temp_shift_offers")
      .select("id, temp_member_id, status")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!offer) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
    const mgr = await isManager(db, companyId, user.id);
    if (action === "cancelled") {
      if (!mgr) return NextResponse.json({ error: "Managers only." }, { status: 403 });
    } else {
      // Temp must own the offer.
      const { data: mem } = await db
        .from("company_members")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!mem || mem.id !== offer.temp_member_id) {
        return NextResponse.json({ error: "This offer isn't yours." }, { status: 403 });
      }
      if (offer.status !== "offered") {
        return NextResponse.json({ error: "This offer is no longer open." }, { status: 409 });
      }
    }
    const { error: upErr } = await db
      .from("temp_shift_offers")
      .update({ status: action, responded_at: new Date().toISOString() })
      .eq("id", id);
    if (upErr) return NextResponse.json({ error: "Could not update the offer." }, { status: 500 });

    // On accept, create the assignment so dispatch/payroll pick it up.
    // Only when the offer is tied to a job request (job_request_id is required).
    if (action === "accepted") {
      const { data: full } = await db
        .from("temp_shift_offers")
        .select("request_id, temp_member_id, pay_rate")
        .eq("id", id)
        .single();
      if (full && full.request_id) {
        await db.from("temp_assignments").insert({
          job_request_id: full.request_id,
          member_id: full.temp_member_id,
          status: "accepted",
          pay_rate_cents: Math.round(Number(full.pay_rate) * 100),
        });
      }
    }
    return NextResponse.json({ ok: true, status: action });
  } catch {
    return NextResponse.json({ error: "Could not update the offer." }, { status: 500 });
  }
}
