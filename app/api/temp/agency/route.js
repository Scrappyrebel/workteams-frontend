import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// GET ?companyId= -> { isAgency: bool }
// Requires the caller to be a member of the company.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    if (!companyId) return NextResponse.json({ isAgency: false });

    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/, "");
    if (!token) return NextResponse.json({ isAgency: false }, { status: 401 });
    const sb = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ isAgency: false }, { status: 401 });

    const { data: member } = await sb
      .from("company_members")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ isAgency: false }, { status: 403 });

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: cfg } = await db
      .from("temp_agency_config")
      .select("company_id")
      .eq("company_id", companyId)
      .eq("enabled", true)
      .maybeSingle();
    return NextResponse.json({ isAgency: !!cfg });
  } catch {
    return NextResponse.json({ isAgency: false });
  }
}
