import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

async function authedUser(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!token) return null;
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser();
  return user || null;
}

// POST { companyId, entryId, lat, lng } -> { entry }
// Server-issued timestamp; only the member's own open entry can be closed.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`clock-out:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { companyId, entryId, lat, lng } = await req.json();
    if (!companyId || !entryId) {
      return NextResponse.json({ error: "companyId and entryId are required" }, { status: 400 });
    }

    const sb = admin();

    const { data: member } = await sb
      .from("company_members")
      .select("id, company_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "No access to this company" }, { status: 403 });

    const { data: entry } = await sb
      .from("time_entries")
      .select("id, member_id, company_id, clock_out")
      .eq("id", entryId)
      .maybeSingle();
    if (!entry || entry.company_id !== companyId || entry.member_id !== member.id) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    if (entry.clock_out) {
      // Idempotent: a retry after a successful clock-out returns success with
      // the SAME entry — never a second timestamp, never a failure that
      // forces the employee to start over.
      return NextResponse.json({ entry, alreadyClosed: true });
    }

    const { data: updated, error } = await sb
      .from("time_entries")
      .update({
        clock_out: new Date().toISOString(), // server time, not client time
        clock_out_lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
        clock_out_lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
        upload_pending: true, // proof uploads finish after the timestamp saves
      })
      .eq("id", entryId)
      .select()
      .single();
    if (error) {
      console.error("clock-out update failed", error.message);
      return NextResponse.json({ error: "Clock-out failed. Try again." }, { status: 500 });
    }
    return NextResponse.json({ entry: updated });
  } catch (e) {
    console.error("clock-out error", e);
    return NextResponse.json({ error: "Clock-out failed. Try again." }, { status: 500 });
  }
}
