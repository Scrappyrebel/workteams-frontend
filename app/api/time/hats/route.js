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

// GET ?companyId= -> { hats: [{ key, title }] }
// Tells the time-clock which hats the signed-in member can clock in as.
// Returns titles only — never dollar amounts (pay stays manager-only).
export async function GET(req) {
  try {
    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const companyId = new URL(req.url).searchParams.get("companyId");
    if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

    const sb = admin();
    const { data: member } = await sb
      .from("company_members")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 });

    const { data: pay } = await sb
      .from("member_pay")
      .select("cleaner_hourly_rate, manager_hourly_rate, cleaner_title, manager_title")
      .eq("member_id", member.id)
      .maybeSingle();

    const hats = [];
    if (pay?.cleaner_hourly_rate != null) {
      hats.push({ key: "cleaner", title: pay.cleaner_title || "Cleaner" });
    }
    if (pay?.manager_hourly_rate != null) {
      hats.push({ key: "manager", title: pay.manager_title || "Manager" });
    }
    return NextResponse.json({ hats });
  } catch (e) {
    console.error("hats error", e);
    return NextResponse.json({ error: "Failed to load roles." }, { status: 500 });
  }
}
