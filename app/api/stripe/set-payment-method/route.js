import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function authedClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

// Verify the caller is an owner of the company. Returns { user, company }
// (company carries the Stripe ids) or { error }.
async function verifyOwner(req, companyId, { needSubscription = true } = {}) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const sb = authedClient(token);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };

  const { data: member } = await sb
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .single();
  if (!member || member.role !== "owner") {
    return { error: NextResponse.json({ error: "Only the owner can manage billing" }, { status: 403 }) };
  }

  // Stripe IDs are hidden from browser-role reads (column-level grants),
  // so this read uses the service role. The caller was already verified
  // as an owner of this company above via their own member row.
  const { data: company } = await serviceClient()
    .from("companies")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", companyId)
    .single();
  if (!company?.stripe_customer_id) {
    return { error: NextResponse.json({ error: "No billing account yet" }, { status: 400 }) };
  }
  if (needSubscription && !company?.stripe_subscription_id) {
    return { error: NextResponse.json({ error: "No active subscription" }, { status: 400 }) };
  }
  return { user, company };
}

function cardSummary(pm) {
  if (!pm || pm.type !== "card" || !pm.card) return null;
  return {
    brand: pm.card.brand || "card",
    last4: pm.card.last4 || "",
    expMonth: pm.card.exp_month || null,
    expYear: pm.card.exp_year || null,
  };
}

// POST { companyId, paymentMethodId } -> make this card the default
// for the customer and the subscription (owner only). Called after
// Elements confirms the SetupIntent in the browser.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`stripe-set-payment-method:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const { companyId, paymentMethodId } = await req.json();
    if (!companyId || !paymentMethodId) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const v = await verifyOwner(req, companyId, { needSubscription: false });
    if (v.error) return v.error;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    let pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== v.company.stripe_customer_id) {
      pm = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: v.company.stripe_customer_id,
      });
    }
    await stripe.customers.update(v.company.stripe_customer_id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    if (v.company.stripe_subscription_id) {
      await stripe.subscriptions.update(v.company.stripe_subscription_id, {
        default_payment_method: paymentMethodId,
      });
    }
    return NextResponse.json({ ok: true, card: cardSummary(pm) });
  } catch (e) {
    console.error("stripe set-payment-method error", e);
    return NextResponse.json({ error: "Could not save the card" }, { status: 500 });
  }
}
