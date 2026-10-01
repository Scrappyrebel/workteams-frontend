import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function companyIdFor(subscription, sb) {
  const metaId = subscription?.metadata?.company_id;
  if (metaId) return metaId;
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;
  if (!customerId) return null;
  const { data } = await sb
    .from("companies")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  return data?.id || null;
}

function statusFor(stripeStatus) {
  if (stripeStatus === "trialing") return "trialing";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") return "past_due";
  if (stripeStatus === "active") return "active";
  return stripeStatus;
}

export async function POST(req) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error("stripe webhook signature failed", e.message);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  const sb = admin();
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const companyId = subscription.metadata?.company_id || session.metadata?.company_id;
        const tier = subscription.metadata?.tier;
        if (companyId && tier) {
          await sb.from("companies").update({
            tier,
            stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
            stripe_subscription_id: subscription.id,
            subscription_status: "active",
          }).eq("id", companyId);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const companyId = await companyIdFor(subscription, sb);
        if (companyId) {
          const tier = subscription.metadata?.tier;
          const patch = { subscription_status: statusFor(subscription.status) };
          if (tier && ["starter", "plus", "pro"].includes(tier)) patch.tier = tier;
          await sb.from("companies").update(patch).eq("id", companyId);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const companyId = await companyIdFor(subscription, sb);
        if (companyId) {
          await sb.from("companies").update({
            tier: "starter",
            stripe_subscription_id: null,
            subscription_status: "canceled",
          }).eq("id", companyId);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const companyId = await companyIdFor(subscription, sb);
          if (companyId) {
            await sb.from("companies").update({ subscription_status: "past_due" }).eq("id", companyId);
          }
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subscriptionId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const companyId = await companyIdFor(subscription, sb);
          if (companyId) {
            await sb.from("companies").update({ subscription_status: "active" }).eq("id", companyId);
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("stripe webhook handler error", e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
