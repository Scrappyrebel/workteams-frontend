import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../../lib/rate-limit";
import { NO_COMMUNICATION_BOOK_NOTE } from "../../../../../lib/no-book-proof";
import { proofRequired } from "../../../../../lib/proof-policy";

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

// POST { companyId, entryId }
// Finalizes end-of-shift proof server-side:
// 1. Authenticates the user and verifies the entry belongs to them.
// 2. Reads the COMPANY's proof requirements server-side (never trusts the client).
// 3. Confirms required proof exists — a real proof row, the persisted
//    no-communication-book report, or a persisted employee override with a
//    reason (shift_proof_overrides, migration 052) each satisfy their kind.
// 4. Clears upload_pending and flags the entry when an override was used.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`clock-out-complete:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { companyId, entryId } = await req.json();
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
      .select("id, member_id, company_id, clock_out, upload_pending")
      .eq("id", entryId)
      .maybeSingle();
    if (!entry || entry.company_id !== companyId || entry.member_id !== member.id) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Company proof policy — read server-side, never from the client.
    // Tolerant read (spec 2026-10-23): if the policy columns cannot be
    // served yet, company stays null and lib/proof-policy resolves every
    // missing value to ON — required by default, never a lockout.
    // A kind is required only when its feature is enabled AND its
    // requirement flag is on (feature-off companies need no proof).
    const { data: company, error: companyError } = await sb
      .from("companies")
      .select("require_walkthrough_video, require_book_photo, enable_shift_videos, enable_comm_book")
      .eq("id", companyId)
      .maybeSingle();
    if (companyError) console.warn("proof policy read fell back to defaults:", companyError.message);
    const requireVideo = proofRequired(companyError ? null : company, "walkthrough");
    const requirePhoto = proofRequired(companyError ? null : company, "book");

    // Persisted employee overrides for this entry (migration 052). One row
    // per proof kind; a row satisfies its kind exactly like a proof row.
    // Tolerant: before the migration runs the table is absent — treat as
    // no overrides rather than failing clock-out.
    let overrideKinds = new Set();
    {
      const { data: rows, error: overrideError } = await sb
        .from("shift_proof_overrides")
        .select("proof_kind")
        .eq("company_id", companyId)
        .eq("member_id", member.id)
        .eq("time_entry_id", entryId);
      if (!overrideError) overrideKinds = new Set((rows || []).map((r) => r.proof_kind));
    }

    if (requireVideo) {
      const { data: vid } = await sb
        .from("shift_videos")
        .select("id")
        .eq("time_entry_id", entryId)
        .limit(1)
        .maybeSingle();
      if (!vid && !overrideKinds.has("walkthrough")) {
        return NextResponse.json(
          { error: "Required walkthrough video has not finished uploading.", pending: "walkthrough" },
          { status: 409 }
        );
      }
    }

    if (requirePhoto) {
      // Accept a real photo OR an authenticated no-communication-book report,
      // tied to this company, worker and time entry. Never trust a bare
      // checkbox/body flag as a substitute for persisted proof.
      const { data: book, error: bookError } = await sb
        .from("comm_book")
        .select("id")
        .eq("company_id", companyId)
        .eq("member_id", member.id)
        .eq("time_entry_id", entryId)
        .not("photo_url", "is", null)
        .limit(1)
        .maybeSingle();
      if (bookError) throw bookError;
      if (!book) {
        const { data: noBook, error: noBookError } = await sb
          .from("comm_book")
          .select("id")
          .eq("company_id", companyId)
          .eq("member_id", member.id)
          .eq("time_entry_id", entryId)
          .eq("category", "note")
          .eq("message", NO_COMMUNICATION_BOOK_NOTE)
          .is("photo_url", null)
          .limit(1)
          .maybeSingle();
        if (noBookError) throw noBookError;
        if (!noBook) {
          // A persisted employee override with a reason also satisfies the
          // book requirement (migration 052) — same acceptance pattern.
          if (!overrideKinds.has("book")) {
            return NextResponse.json(
              { error: "Required book proof is pending: upload a book photo or save the No communication book report.", pending: "book" },
              { status: 409 }
            );
          }
        }
      }
    }

    // Finalize: clear pending and stamp the override flag from the persisted
    // override rows, so the entry is visibly flagged wherever managers
    // review it. Tolerant: if the flag column is not served yet (migration
    // 052 not run), fall back to clearing pending only.
    const { error: finalError } = await sb
      .from("time_entries")
      .update({ upload_pending: false, proof_override_used: overrideKinds.size > 0 })
      .eq("id", entryId)
      .eq("company_id", companyId);
    if (finalError) {
      await sb
        .from("time_entries")
        .update({ upload_pending: false })
        .eq("id", entryId)
        .eq("company_id", companyId);
    }

    return NextResponse.json({ ok: true, overrideUsed: overrideKinds.size > 0 });
  } catch (e) {
    console.error("clock-out complete error", e);
    return NextResponse.json({ error: "Failed to finalize proof." }, { status: 500 });
  }
}
