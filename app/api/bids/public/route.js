import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import { chicagoToday } from "../../../../lib/dates";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Public: fetch a bid by its approval token for client review.
// Rate-limited by IP (same pattern as the other public routes). Expired
// approval links are rejected before any bid details are returned. The
// response carries only the fields the client review page renders — no
// internal ids, tokens, or timestamps.
export async function GET(req) {
  try {
    const rl = checkRateLimit(`bid-public:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const token = new URL(req.url).searchParams.get("token");
    if (!token || typeof token !== "string" || token.length > 128) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }
    const client = sb();
    const { data: bid, error } = await client
      .from("bids")
      .select("id, title, client_name, description, status, frequency, job_type, valid_until, companies(name)")
      .eq("approve_token", token)
      .maybeSingle();
    if (error || !bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });
    if (bid.valid_until && bid.valid_until < chicagoToday()) {
      return NextResponse.json({ error: "This proposal has expired." }, { status: 410 });
    }
    const { data: items } = await client
      .from("bid_items")
      .select("description, quantity, unit_price")
      .eq("bid_id", bid.id)
      .order("created_at");
    // Total depends on the pricing mode, not just line items.
    let total = 0;
    let totalLabel = "";
    const pm = bid.pricing_mode;
    if (pm === "hourly" && bid.hours && bid.hourly_rate) {
      total = Number(bid.hours) * Number(bid.hourly_rate);
      totalLabel = "per visit";
    } else if (pm === "sqft" && bid.square_footage && bid.rate_per_sqft) {
      total = Number(bid.square_footage) * Number(bid.rate_per_sqft);
      totalLabel = "per visit";
    } else if (pm === "base_rate" && bid.base_rate) {
      total = Number(bid.base_rate);
      totalLabel = "per visit";
    } else {
      total = (items || []).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
    }
    // Add monthly estimate for recurring frequencies.
    let monthlyNote = "";
    const freq = (bid.frequency || "").toLowerCase();
    if (total > 0 && totalLabel === "per visit") {
      const mult = freq.includes("week") ? 4.33 : freq.includes("month") ? 1 : 0;
      if (mult) monthlyNote = ` (~$${(total * mult).toFixed(2)}/mo)`;
    }
    return NextResponse.json({ bid, items: items || [], total, totalLabel, monthlyNote });
  } catch (e) {
    console.error("bid public lookup error", e);
    return NextResponse.json({ error: "Could not load the proposal." }, { status: 500 });
  }
}
