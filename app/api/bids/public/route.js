import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Public: fetch a bid by its approval token for client review.
export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const client = sb();
  const { data: bid, error } = await client
    .from("bids")
    .select("id, title, client_name, description, status, frequency, job_type, valid_until, companies(name)")
    .eq("approve_token", token)
    .maybeSingle();
  if (error || !bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });
  const { data: items } = await client
    .from("bid_items")
    .select("description, quantity, unit_price")
    .eq("bid_id", bid.id)
    .order("created_at");
  const total = (items || []).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  return NextResponse.json({ bid, items: items || [], total });
}
