import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../../lib/rate-limit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

async function authedUser(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/, "");
  if (!token) return null;
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser();
  return user || null;
}

// POST { companyId, entryId, kind: "walkthrough"|"book", reason }
// Employee override for required end-of-shift proof (spec 2026-10-23):
// persists ONE override row per proof kind per time entry in
// shift_proof_overrides and flags the time entry (proof_override_used).
// Company, member and location are derived server-side from the entry —
// never trusted from the request body — and the reason is REQUIRED.
// The clock-out completion API accepts this persisted row in place of the
// proof row, exactly like the no-communication-book report.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`clock-out-override:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { companyId, entryId, kind, reason } = await req.json();
    if (!companyId || !entryId) {
      return NextResponse.json({ error: "companyId and entryId are required" }, { status: 400 });
    }
    if (kind !== "walkthrough" && kind !== "book") {
      return NextResponse.json({ error: "kind must be walkthrough or book" }, { status: 400 });
    }
    const cleanReason = typeof reason === "string" ? reason.trim() : "";
    if (!cleanReason) {
      return NextResponse.json({ error: "A reason is required to skip this proof." }, { status: 400 });
    }
    if (cleanReason.length > 1000) {
      return NextResponse.json({ error: "Reason is too long (1000 characters max)." }, { status: 400 });
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
      .select("id, member_id, company_id, location_id")
      .eq("id", entryId)
      .maybeSingle();
    if (!entry || entry.company_id !== companyId || entry.member_id !== member.id) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const { data: saved, error: saveError } = await sb
      .from("shift_proof_overrides")
      .upsert(
        {
          company_id: companyId,
          member_id: member.id,
          time_entry_id: entryId,
          location_id: entry.location_id || null,
          proof_kind: kind,
          reason: cleanReason,
        },
        { onConflict: "time_entry_id,proof_kind" }
      )
      .select("id, proof_kind, reason, created_at")
      .single();
    if (saveError) throw saveError;

    // Flag the entry immediately so the override is visible to managers even
    // before clock-out completion runs. Tolerant: if the flag column is not
    // served yet (migration 052 not run), the override row itself still
    // counts — completion derives the same flag from the override rows.
    const { error: flagError } = await sb
      .from("time_entries")
      .update({ proof_override_used: true })
      .eq("id", entryId)
      .eq("company_id", companyId);
    if (flagError) console.warn("proof override flag update skipped:", flagError.message);

    return NextResponse.json({ ok: true, override: saved });
  } catch (e) {
    console.error("clock-out override error", e);
    return NextResponse.json({ error: "Failed to save the override. Try again." }, { status: 500 });
  }
}
