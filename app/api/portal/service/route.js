import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Public: active signed contract for this portal link's location — terms
// summary, scope of work, and extra-clean pricing for the client to reference.
export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const client = sb();
  const { data: pt } = await client
    .from("portal_tokens")
    .select("id, company_id, location_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!pt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pt.expires_at && new Date(pt.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 });
  }
  const { data: c } = await client
    .from("contracts")
    .select("client_name, start_date, end_date, visits_per_week, price_per_visit, yearly_increase_pct, extra_clean_price, heavy_clean_price, scope_of_work, terms_text, signed_at")
    .eq("company_id", pt.company_id)
    .eq("location_id", pt.location_id)
    .eq("status", "signed")
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!c) return NextResponse.json({ contract: null });
  return NextResponse.json({ contract: c });
}

// Public: client requests an extra or heavy clean. Creates a work order for
// the company to approve/schedule, priced from the signed contract.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`portal-clean:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

    const { token, kind, date, notes } = await req.json();
    if (!token || !["extra", "heavy"].includes(kind) || !date) {
      return NextResponse.json({ error: "Service type and date are required." }, { status: 400 });
    }
    const client = sb();
    const { data: pt } = await client
      .from("portal_tokens")
      .select("id, company_id, location_id, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (!pt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (pt.expires_at && new Date(pt.expires_at) < new Date()) {
      return NextResponse.json({ error: "This link has expired." }, { status: 410 });
    }
    const { data: c } = await client
      .from("contracts")
      .select("extra_clean_price, heavy_clean_price")
      .eq("company_id", pt.company_id)
      .eq("location_id", pt.location_id)
      .eq("status", "signed")
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const price = kind === "extra" ? c?.extra_clean_price : c?.heavy_clean_price;
    const { error } = await client.from("work_orders").insert({
      company_id: pt.company_id,
      location_id: pt.location_id,
      title: `Client request: ${kind === "extra" ? "Extra" : "Heavy"} clean`,
      description: `Requested through the client portal for ${date}.${notes?.trim() ? ` Notes: ${notes.trim()}` : ""}`,
      due_date: date,
      source: "portal",
      agreed_price: price,
      status: "open",
      priority: "normal",
    });
    if (error) return NextResponse.json({ error: "Could not submit request." }, { status: 500 });
    return NextResponse.json({ ok: true, price });
  } catch (e) {
    console.error("portal request-clean error", e);
    return NextResponse.json({ error: "Could not submit request." }, { status: 500 });
  }
}
