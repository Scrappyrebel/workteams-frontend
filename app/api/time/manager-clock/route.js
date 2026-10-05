import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Manager clocks another member in/out.
// Body: { company_id, target_member_id, action: "in" | "out", actor_member_id }
export async function POST(req) {
  try {
    const { company_id, target_member_id, action, actor_member_id } = await req.json();
    if (!company_id || !target_member_id || !["in", "out"].includes(action) || !actor_member_id) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const client = sb();
    // Verify actor is owner/admin of the company.
    const { data: actor } = await client
      .from("company_members")
      .select("role")
      .eq("id", actor_member_id)
      .eq("company_id", company_id)
      .maybeSingle();
    if (!actor || !["owner", "admin"].includes(actor.role)) {
      return NextResponse.json({ error: "Managers only." }, { status: 403 });
    }
    // Verify target is a member of the same company.
    const { data: target } = await client
      .from("company_members")
      .select("id")
      .eq("id", target_member_id)
      .eq("company_id", company_id)
      .maybeSingle();
    if (!target) return NextResponse.json({ error: "Member not found." }, { status: 404 });

    if (action === "in") {
      // Don't double-clock-in.
      const { data: existing } = await client
        .from("time_entries")
        .select("id")
        .eq("company_id", company_id)
        .eq("member_id", target_member_id)
        .is("clock_out", null)
        .limit(1)
        .maybeSingle();
      if (existing) return NextResponse.json({ error: "Already clocked in." }, { status: 409 });
      const { error } = await client.from("time_entries").insert({
        company_id,
        member_id: target_member_id,
        clock_in: new Date().toISOString(),
        notes: `Clocked in by manager`,
      });
      if (error) throw error;
    } else {
      const { data: open } = await client
        .from("time_entries")
        .select("id")
        .eq("company_id", company_id)
        .eq("member_id", target_member_id)
        .is("clock_out", null)
        .limit(1)
        .maybeSingle();
      if (!open) return NextResponse.json({ error: "Not clocked in." }, { status: 409 });
      const { error } = await client
        .from("time_entries")
        .update({ clock_out: new Date().toISOString(), notes: `Clocked out by manager` })
        .eq("id", open.id);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("manager clock error", e);
    return NextResponse.json({ error: "Could not update clock." }, { status: 500 });
  }
}
