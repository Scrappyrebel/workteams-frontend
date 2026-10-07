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

// POST { companyId, entryId, kind: "walkthrough"|"book", storagePath }
// Attaches a proof upload to the time entry. The shift_videos / comm_book row
// is the record of truth; this is a best-effort linkage call.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`clock-out-proof:${clientIp(req)}`, { limit: 60, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { companyId, entryId, kind, storagePath } = await req.json();
    if (!companyId || !entryId || !storagePath) {
      return NextResponse.json({ error: "companyId, entryId and storagePath are required" }, { status: 400 });
    }
    if (kind !== "walkthrough" && kind !== "book") {
      return NextResponse.json({ error: "kind must be walkthrough or book" }, { status: 400 });
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
      .select("id, member_id, company_id")
      .eq("id", entryId)
      .maybeSingle();
    if (!entry || entry.company_id !== companyId || entry.member_id !== member.id) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Proof rows are created client-side in shift_videos / comm_book with
    // time_entry_id set. This endpoint confirms the linkage exists.
    const table = kind === "walkthrough" ? "shift_videos" : "comm_book";
    const pathCol = kind === "walkthrough" ? "video_url" : "photo_url";
    const { data: proof } = await sb
      .from(table)
      .select("id")
      .eq("time_entry_id", entryId)
      .eq(pathCol, storagePath)
      .maybeSingle();

    return NextResponse.json({ ok: true, linked: !!proof });
  } catch (e) {
    console.error("clock-out proof error", e);
    return NextResponse.json({ error: "Failed to attach proof." }, { status: 500 });
  }
}
