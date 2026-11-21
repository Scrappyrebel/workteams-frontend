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

// GET ?companyId= -> the in-app billing summary (owner only): status,
// period end, the card on file, and the next charge — everything the
// Plans page shows so the owner never has to leave the app to see or
// manage billing (Wendy, 2026-11-06: plan and payment changes happen
// inside the app's own billing section, never off-site).
export async function GET(req) {
  try {
    const companyId = new URL(req.url).searchParams.get("companyId");
    if (!companyId) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const v = await verifyOwner(req, companyId);
    if (v.error) return v.error;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sub = await stripe.subscriptions.retrieve(v.company.stripe_subscription_id, {
      expand: ["default_payment_method"],
    });

    let pm = sub.default_payment_method && typeof sub.default_payment_method === "object"
      ? sub.default_payment_method
      : null;
    if (!pm) {
      const customer = await stripe.customers.retrieve(v.company.stripe_customer_id);
      const defaultPmId = customer && !customer.deleted
        ? customer.invoice_settings?.default_payment_method
        : null;
      if (defaultPmId) {
        pm = await stripe.paymentMethods.retrieve(
          typeof defaultPmId === "string" ? defaultPmId : defaultPmId.id
        );
      }
    }

    const item = sub.items?.data?.[0] || null;
    const price = item?.price || null;
    const nextCharge = !sub.cancel_at_period_end && (sub.status === "active" || sub.status === "trialing") && price
      ? {
          amountCents: price.unit_amount ?? null,
          currency: price.currency || "usd",
          date: sub.status === "trialing" && sub.trial_end ? sub.trial_end : sub.current_period_end || null,
        }
      : null;

    return NextResponse.json({
      status: sub.status,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      currentPeriodEnd: sub.current_period_end || null,
      trialEnd: sub.trial_end || null,
      card: cardSummary(pm),
      nextCharge,
    });
  } catch (e) {
    console.error("stripe billing summary error", e);
    return NextResponse.json({ error: "Could not load billing" }, { status: 500 });
  }
}
