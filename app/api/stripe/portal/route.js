import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import { getAppUrl } from "../../../../lib/app-url";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function authedClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// POST { companyId } -> { url }  (owner only) — manage/cancel/change plan
export async function POST(req) {
  try {
    const rl = checkRateLimit(`stripe-portal:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { companyId } = await req.json();
    if (!companyId) return NextResponse.json({ error: "Bad request" }, { status: 400 });

    const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    if (!token) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const sb = authedClient(token);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { data: member } = await sb
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single();
    if (!member || member.role !== "owner") {
      return NextResponse.json({ error: "Only the owner can manage billing" }, { status: 403 });
    }

    // Stripe IDs are hidden from browser-role reads (column-level grants),
    // so this read uses the service role. The caller was already verified
    // as an owner of this company above via their own member row.
    const { data: company } = await createClient(SUPABASE_URL, SERVICE_KEY)
      .from("companies")
      .select("stripe_customer_id")
      .eq("id", companyId)
      .single();
    if (!company?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account yet" }, { status: 400 });
    }

    const APP_URL = getAppUrl();
    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${APP_URL}/app/${companyId}/plans`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("stripe portal error", e);
    return NextResponse.json({ error: "Could not open billing portal" }, { status: 500 });
  }
}
