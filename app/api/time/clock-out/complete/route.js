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

// POST { companyId, entryId }
// Finalizes end-of-shift proof server-side:
// 1. Authenticates the user and verifies the entry belongs to them.
// 2. Reads the COMPANY's proof requirements server-side (never trusts the client).
// 3. Confirms required proof exists; clears upload_pending.
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
    const { data: company } = await sb
      .from("companies")
      .select("require_walkthrough_video, require_book_photo")
      .eq("id", companyId)
      .maybeSingle();
    const requireVideo = !!company?.require_walkthrough_video;
    const requirePhoto = !!company?.require_book_photo;

    if (requireVideo) {
      const { data: vid } = await sb
        .from("shift_videos")
        .select("id")
        .eq("time_entry_id", entryId)
        .limit(1)
        .maybeSingle();
      if (!vid) {
        return NextResponse.json(
          { error: "Required walkthrough video has not finished uploading.", pending: "walkthrough" },
          { status: 409 }
        );
      }
    }

    if (requirePhoto) {
      const { data: book } = await sb
        .from("comm_book")
        .select("id")
        .eq("time_entry_id", entryId)
        .not("photo_url", "is", null)
        .limit(1)
        .maybeSingle();
      if (!book) {
        return NextResponse.json(
          { error: "Required book photo has not finished uploading.", pending: "book" },
          { status: 409 }
        );
      }
    }

    await sb
      .from("time_entries")
      .update({ upload_pending: false })
      .eq("id", entryId)
      .eq("company_id", companyId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("clock-out complete error", e);
    return NextResponse.json({ error: "Failed to finalize proof." }, { status: 500 });
  }
}
