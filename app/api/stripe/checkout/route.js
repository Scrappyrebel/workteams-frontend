import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import { getAppUrl } from "../../../../lib/app-url";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

function authedClient(token) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// POST { companyId, tier } -> { url }  (owner only)
export async function POST(req) {
  try {
    const rl = checkRateLimit(`stripe-checkout:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

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

    // Billing writes go through the service role (a DB trigger blocks
    // client writes to billing columns).
    const db = admin();

    const { data: company, error: companyErr } = await db
      .from("companies")
      .select("id,name,stripe_customer_id,stripe_subscription_id,subscription_status")
      .eq("id", companyId)
      .single();
    if (companyErr || !company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    // Duplicate-subscription guard: an active/trialing subscription means
    // the customer should use the billing portal, not start a second one.
    if (company.stripe_subscription_id) {
      try {
        const existing = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
        if (existing.status === "active" || existing.status === "trialing") {
          return NextResponse.json(
            { error: "This company already has an active subscription. Use “Manage billing” to change plans.", portal: true },
            { status: 409 }
          );
        }
      } catch (e) {
        // If Stripe can't find it, treat as stale and continue.
        console.error("checkout: existing subscription lookup failed", e.message);
      }
    }

    const { data: priceRow } = await db
      .from("product_tiers")
      .select("stripe_price_id")
      .eq("tier", tier)
      .single();
    if (!priceRow?.stripe_price_id) {
      return NextResponse.json({ error: "Price not configured yet" }, { status: 400 });
    }

    let customerId = company.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: company.name,
        metadata: { company_id: companyId },
      });
      customerId = customer.id;
      const { error: custErr } = await db
        .from("companies")
        .update({ stripe_customer_id: customerId })
        .eq("id", companyId);
      if (custErr) {
        console.error("checkout: could not save customer id", custErr.message);
        return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
      }
    }

    // Idempotency: rapid double-taps reuse the same open checkout session
    // instead of creating duplicates. If the old session was completed or
    // expired, a fresh session is created (a fixed per-day idempotency key
    // would have handed back a dead link).
    const openSessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 10 });
    const reusable = openSessions.data.find(
      (s) => s.status === "open" && s.metadata?.company_id === companyId && s.metadata?.tier === tier
    );
    if (reusable?.url) {
      return NextResponse.json({ url: reusable.url });
    }

    // Redirects are built only from the validated WORKTEAMS_APP_URL origin
    // plus fixed in-app paths — the client can never influence the domain.
    const APP_URL = getAppUrl();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceRow.stripe_price_id, quantity: 1 }],
        subscription_data: {
          metadata: { company_id: companyId, tier },
          trial_period_days: 7,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        },
        metadata: { company_id: companyId, tier },
        success_url: `${APP_URL}/app/${companyId}/plans/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/app/${companyId}/plans`,
      },
      { idempotencyKey: `wt-checkout-${companyId}-${tier}-${Date.now()}` }
    );

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("stripe checkout error", e);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
