import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const APP_URL = "https://app.lillybsjanitorial.com";

function authedClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// POST { companyId, tier } -> { url }  (owner only)
export async function POST(req) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { companyId, tier } = await req.json();
    if (!companyId || !["starter", "plus", "pro"].includes(tier)) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

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
      return NextResponse.json({ error: "Only the owner can subscribe" }, { status: 403 });
    }

    const { data: priceRow } = await sb
      .from("product_tiers")
      .select("stripe_price_id")
      .eq("tier", tier)
      .single();
    if (!priceRow?.stripe_price_id) {
      return NextResponse.json({ error: "Price not configured yet" }, { status: 400 });
    }

    const { data: company } = await sb
      .from("companies")
      .select("id,name,stripe_customer_id")
      .eq("id", companyId)
      .single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    let customerId = company.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: company.name,
        metadata: { company_id: companyId },
      });
      customerId = customer.id;
      await sb.from("companies").update({ stripe_customer_id: customerId }).eq("id", companyId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceRow.stripe_price_id, quantity: 1 }],
      subscription_data: { metadata: { company_id: companyId, tier } },
      success_url: `${APP_URL}/app/${companyId}/plans/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/app/${companyId}/plans`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("stripe checkout error", e);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
