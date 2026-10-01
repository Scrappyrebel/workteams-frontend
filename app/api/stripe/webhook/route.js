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
  const { data, error } = await sb
    .from("companies")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  if (error) throw new Error("company lookup failed: " + error.message);
  return data?.id || null;
}

// Authoritative tier comes from the actual Stripe Price ID on the
// subscription's line item, looked up in product_tiers. Subscription
// metadata is NOT trusted (it can go stale after portal plan changes).
async function tierForPriceId(priceId, sb) {
  if (!priceId) return null;
  const { data, error } = await sb
    .from("product_tiers")
    .select("tier")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (error) throw new Error("tier lookup failed: " + error.message);
  return data?.tier || null;
}

async function tierForSubscription(subscription, sb, stripe) {
  let sub = subscription;
  // Make sure line items (with prices) are present.
  if (!sub.items?.data?.length) {
    sub = await stripe.subscriptions.retrieve(sub.id, { expand: ["items.data.price"] });
  }
  const priceId =
    sub.items?.data?.[0]?.price?.id ||
    (typeof sub.items?.data?.[0]?.price === "string" ? sub.items.data[0].price : null);
  const tier = await tierForPriceId(priceId, sb);
  if (!tier) {
    console.error(`stripe webhook: unknown price id ${priceId} on subscription ${sub.id}; tier NOT changed`);
  }
  return tier;
}

function statusFor(stripeStatus) {
  if (stripeStatus === "trialing") return "trialing";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") return "past_due";
  if (stripeStatus === "active") return "active";
  return stripeStatus;
}

async function updateCompany(sb, companyId, patch) {
  const { error } = await sb.from("companies").update(patch).eq("id", companyId);
  if (error) throw new Error("companies update failed: " + error.message);
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

  // Idempotency, done safely: the event row is inserted with processed_at
  // NULL *before* handling. Only after the handler succeeds do we stamp
  // processed_at. If the handler throws (500 below), Stripe retries and the
  // retry finds processed_at still NULL, so it processes for real instead of
  // being wrongly skipped as a "duplicate". All company patches are
  // idempotent (set-field-to-X), so a rare concurrent double-delivery is
  // harmless.
  const { data: existing, error: logErr } = await sb
    .from("stripe_webhook_events")
    .upsert(
      { event_id: event.id, type: event.type, processed_at: null },
      { onConflict: "event_id", ignoreDuplicates: true }
    )
    .select("event_id, processed_at");
  if (logErr) {
    console.error("stripe webhook event-log failed", logErr);
    return NextResponse.json({ error: "Event log failed" }, { status: 500 });
  }
  if (existing && existing.length > 0 && existing[0].processed_at) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  // Also handle the case where the row already existed from an earlier
  // attempt: fetch its state (the upsert above returns nothing for it).
  if (!existing || existing.length === 0) {
    const { data: prior, error: priorErr } = await sb
      .from("stripe_webhook_events")
      .select("processed_at")
      .eq("event_id", event.id)
      .maybeSingle();
    if (priorErr) {
      console.error("stripe webhook event-log read failed", priorErr);
      return NextResponse.json({ error: "Event log failed" }, { status: 500 });
    }
    if (prior?.processed_at) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (!session.subscription) break;
        const subscription = await stripe.subscriptions.retrieve(session.subscription, {
          expand: ["items.data.price"],
        });
        const companyId = subscription.metadata?.company_id || session.metadata?.company_id;
        const tier = await tierForSubscription(subscription, sb, stripe);
        if (companyId && tier) {
          await updateCompany(sb, companyId, {
            tier,
            stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
            stripe_subscription_id: subscription.id,
            subscription_status: "active",
          });
        } else if (companyId) {
          console.error(`stripe webhook: checkout.session.completed for company ${companyId} with unresolvable tier`);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const companyId = await companyIdFor(subscription, sb);
        if (companyId) {
          const tier = await tierForSubscription(subscription, sb, stripe);
          const patch = { subscription_status: statusFor(subscription.status) };
          if (tier) patch.tier = tier;
          await updateCompany(sb, companyId, patch);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const companyId = await companyIdFor(subscription, sb);
        if (companyId) {
          await updateCompany(sb, companyId, {
            tier: "starter",
            stripe_subscription_id: null,
            subscription_status: "canceled",
          });
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
            await updateCompany(sb, companyId, { subscription_status: "past_due" });
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
            await updateCompany(sb, companyId, { subscription_status: "active" });
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // Non-2xx so Stripe retries. processed_at stays NULL, so the retry
    // will actually process instead of being skipped as a duplicate.
    console.error("stripe webhook handler error", e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  const { error: markErr } = await sb
    .from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", event.id);
  if (markErr) {
    // The company update already succeeded; log loudly so a retry (which
    // will now look like a duplicate) can be reconciled by hand if needed.
    console.error("stripe webhook processed_at update failed for", event.id, markErr);
  }

  return NextResponse.json({ received: true });
}
