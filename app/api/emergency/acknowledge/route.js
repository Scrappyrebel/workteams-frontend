import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

// POST { companyId, alertId } — "I'm on it": marks the alert acknowledged.
// Only supervisors and up can acknowledge (enforced by RLS too).
export async function POST(req) {
  try {
    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { companyId, alertId } = await req.json();
    if (!companyId || !alertId) {
      return NextResponse.json({ error: "companyId and alertId are required" }, { status: 400 });
    }

    const sb = admin();
    const { data: member } = await sb
      .from("company_members")
      .select("id, role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 });
    if (!["owner", "admin", "supervisor"].includes(member.role)) {
      return NextResponse.json({ error: "Only supervisors and up can acknowledge." }, { status: 403 });
    }

    const { error } = await sb
      .from("emergency_alerts")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: member.id })
      .eq("id", alertId)
      .eq("company_id", companyId)
      .is("acknowledged_at", null);
    if (error) throw error;
    // Auto clock-in the responder if they're not already clocked in (emergency = on the clock).
    const { data: open } = await sb
      .from("time_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("member_id", member.id)
      .is("clock_out", null)
      .limit(1)
      .maybeSingle();
    if (!open) {
      await sb.from("time_entries").insert({
        company_id: companyId,
        member_id: member.id,
        clock_in: new Date().toISOString(),
        notes: "Auto clock-in: emergency response",
      });
    }
    return NextResponse.json({ ok: true, autoClockedIn: !open });
  } catch (e) {
    console.error("emergency ack error", e);
    return NextResponse.json({ error: "Could not acknowledge." }, { status: 500 });
  }
}
