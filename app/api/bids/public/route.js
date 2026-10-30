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
      .select("id, company_id, title, client_name, description, status, frequency, job_type, valid_until, pricing_mode, hours, hourly_rate, square_footage, rate_per_sqft")
      .eq("approve_token", token)
      .maybeSingle();
    if (error) {
      console.error("bid public lookup db error", error);
      return NextResponse.json({ error: "Could not load the proposal." }, { status: 500 });
    }
    if (!bid) {
      return NextResponse.json({ error: "Bid not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    // Fetch company name separately (avoids join issues)
    const { data: company } = await client.from("companies").select("name, timezone").eq("id", bid.company_id).maybeSingle();
    if (bid.valid_until && bid.valid_until < chicagoToday(company?.timezone)) {
      return NextResponse.json({ error: "This proposal has expired." }, { status: 410 });
    }
    const { data: items } = await client
      .from("bid_items")
      .select("description, quantity, unit_price")
      .eq("bid_id", bid.id)
      .order("created_at");
    // Total depends on the pricing mode, not just line items.
    // Pricing modes: line_items, hourly, sqft (no base_rate — not in the live schema).
    let total = 0;
    const pm = bid.pricing_mode;
    if (pm === "hourly" && bid.hours && bid.hourly_rate) {
      total = Number(bid.hours) * Number(bid.hourly_rate);
    } else if (pm === "sqft" && bid.square_footage && bid.rate_per_sqft) {
      total = Number(bid.square_footage) * Number(bid.rate_per_sqft);
    } else {
      total = (items || []).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
    }
    // The price basis comes from the bid's own frequency, for every pricing
    // mode — the same presentation the internal bid pages use: a one-time
    // bid's total is the whole price; any other bid's total is per visit.
    // (Previously only hourly/sqft bids got a basis label — a line-item bid
    // showed a bare total the prospect could read as the whole contract
    // price, and its monthly estimate never appeared.)
    const freq = (bid.frequency || "").toLowerCase();
    const totalLabel = freq === "one-time" ? "(one-time)" : "per visit";
    // Frequency wording is the bid form's own option labels.
    const frequencyLabel = { "one-time": "One-time clean", weekly: "Weekly (1×/week)", "2x-week": "Twice a week", "3x-week": "3× a week", "5x-week": "Weekdays (5×/week)", biweekly: "Every 2 weeks", monthly: "Monthly" }[freq] || "";
    // Monthly estimate only for recurring frequencies — never for one-time jobs.
    // Multipliers = visits per month for each frequency.
    let monthlyNote = "";
    if (total > 0 && freq !== "one-time") {
      const mult = { weekly: 4.33, "2x-week": 8.67, "3x-week": 13, "5x-week": 21.67, biweekly: 2.17, monthly: 1 }[freq] || 0;
      if (mult) monthlyNote = `~$${(total * mult).toFixed(2)}/mo`;
    }
    return NextResponse.json({ bid: { ...bid, company_name: company?.name }, items: items || [], total, totalLabel, frequencyLabel, monthlyNote }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("bid public lookup error", e);
    return NextResponse.json({ error: "Could not load the proposal." }, { status: 500 });
  }
}
