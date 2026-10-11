import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function authedUser(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error } = await client.auth.getUser();
  return error ? null : user;
}

// Separate, deliberate manager override. An ordinary time-clock request MUST
// have the authenticated employee's own shift. Manager override must verify
// the actual logged-in owner/admin and write an auditable reason.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`manager-clock:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in as a manager first." }, { status: 401 });

    const { company_id, target_member_id, action, reason } = await req.json();
    if (!company_id || !target_member_id || !["in", "out"].includes(action)) {
      return NextResponse.json({ error: "Invalid manager override request." }, { status: 400 });
    }
    const explanation = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
    if (action === "in" && explanation.length < 3) {
      return NextResponse.json({ error: "A manager override reason is required." }, { status: 400 });
    }

    const client = sb();
    const { data: actor, error: actorError } = await client
      .from("company_members")
      .select("id, role, display_name")
      .eq("user_id", user.id)
      .eq("company_id", company_id)
      .maybeSingle();
    if (actorError || !actor || !["owner", "admin", "manager"].includes(actor.role)) {
      return NextResponse.json({ error: "Verified owner/manager approval required." }, { status: 403 });
    }

    const { data: target, error: targetError } = await client
      .from("company_members")
      .select("id")
      .eq("id", target_member_id)
      .eq("company_id", company_id)
      .maybeSingle();
    if (targetError || !target) return NextResponse.json({ error: "Member not found in company." }, { status: 404 });

    const actorName = (actor.display_name || "Manager").replace(/[\r\n]/g, " ").slice(0, 80);
    if (action === "in") {
      const { data: existing, error: openError } = await client
        .from("time_entries")
        .select("id")
        .eq("company_id", company_id)
        .eq("member_id", target_member_id)
        .is("clock_out", null)
        .limit(1)
        .maybeSingle();
      if (openError) throw openError;
      if (existing) return NextResponse.json({ error: "Already clocked in." }, { status: 409 });
      const { error } = await client.from("time_entries").insert({
        company_id,
        member_id: target_member_id,
        clock_in: new Date().toISOString(),
        notes: `Unscheduled clock-in APPROVED by ${actorName} (${actor.id}). Reason: ${explanation}`,
      });
      if (error) throw error;
    } else {
      const { data: open, error: openError } = await client
        .from("time_entries")
        .select("id")
        .eq("company_id", company_id)
        .eq("member_id", target_member_id)
        .is("clock_out", null)
        .limit(1)
        .maybeSingle();
      if (openError) throw openError;
      if (!open) return NextResponse.json({ error: "Not clocked in." }, { status: 409 });
      const { error } = await client
        .from("time_entries")
        .update({
          clock_out: new Date().toISOString(),
          upload_pending: true, // manager does not silently claim missing proof was submitted
          notes: `Clocked out by ${actorName} (${actor.id}); video/book proof pending manager review.`,
        })
        .eq("id", open.id)
        .eq("company_id", company_id)
        .is("clock_out", null);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("manager clock error", e);
    return NextResponse.json({ error: "Could not update clock." }, { status: 500 });
  }
}
