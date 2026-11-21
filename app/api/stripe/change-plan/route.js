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

// POST { companyId, tier } -> switch the subscription to the tier's
// price, in-app (owner only). Prorations are created by Stripe so a
// mid-period switch is charged/credited fairly. The companies row is
// updated here so the app reflects the switch at once; the webhook
// re-derives the same tier from the price and confirms it.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`stripe-change-plan:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const { companyId, tier } = await req.json();
    if (!companyId || !tier) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const v = await verifyOwner(req, companyId);
    if (v.error) return v.error;

    const db = serviceClient();
    const { data: priceRow } = await db
      .from("product_tiers")
      .select("stripe_price_id")
      .eq("tier", tier)
      .single();
    if (!priceRow?.stripe_price_id) {
      return NextResponse.json({ error: "Price not configured yet" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sub = await stripe.subscriptions.retrieve(v.company.stripe_subscription_id);
    const item = sub.items?.data?.[0];
    if (!item) {
      return NextResponse.json({ error: "Subscription has no plan item to change" }, { status: 400 });
    }
    if (item.price?.id === priceRow.stripe_price_id) {
      return NextResponse.json({ ok: true, alreadyOnPlan: true, tier, status: sub.status, currentPeriodEnd: sub.current_period_end || null });
    }

    const updated = await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: priceRow.stripe_price_id }],
      proration_behavior: "create_prorations",
    });

    const { error: updErr } = await db
      .from("companies")
      .update({ tier })
      .eq("id", companyId);
    if (updErr) {
      // The Stripe switch itself succeeded; the webhook will reconcile
      // the tier from the price. Log and still report success.
      console.error("change-plan: company tier update failed", updErr.message);
    }

    return NextResponse.json({
      ok: true,
      alreadyOnPlan: false,
      tier,
      status: updated.status,
      currentPeriodEnd: updated.current_period_end || null,
    });
  } catch (e) {
    console.error("stripe change-plan error", e);
    return NextResponse.json({ error: "Could not change plan" }, { status: 500 });
  }
}
