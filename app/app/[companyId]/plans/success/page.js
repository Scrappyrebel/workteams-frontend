import Link from "next/link";
import Stripe from "stripe";
import { TIERS } from "../../../../../lib/tiers";

// The checkout route puts ?session_id={CHECKOUT_SESSION_ID} on this URL.
// Read the purchase back from Stripe (the source of truth for what was
// actually bought) so the customer sees their real plan, price, and the
// date that matters — trial end while trialing, next billing date once
// active. Any failure (no session id, a session for another company, a
// Stripe hiccup) falls back to the plain confirmation below: the page
// only states facts it could verify.
async function loadPurchaseFacts(companyId, sessionId) {
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) return null;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.mode !== "subscription") return null;
    if (session.metadata?.company_id !== companyId) return null;
    const subId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
    if (!subId) return null;
    const sub = await stripe.subscriptions.retrieve(subId, {
      expand: ["items.data.price"],
    });
    const item = sub.items?.data?.[0];
    const price = item?.price;
    const periodEndRaw = sub.current_period_end ?? item?.current_period_end ?? null;
    return {
      planName: TIERS[session.metadata?.tier]?.name || null,
      amountCents: typeof price?.unit_amount === "number" ? price.unit_amount : null,
      currency: price?.currency || "usd",
      interval: price?.recurring?.interval || "month",
      status: sub.status || null,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      periodEnd: periodEndRaw ? new Date(periodEndRaw * 1000) : null,
    };
  } catch {
    return null;
  }
}

function formatAmount(cents, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: String(currency).toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function formatDate(d) {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_LABELS = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Setting up",
  unpaid: "Unpaid",
  paused: "Paused",
};

export default async function PlanSuccess({ params, searchParams }) {
  const { companyId } = await params;
  const sp = (await searchParams) || {};
  const facts = await loadPurchaseFacts(companyId, sp.session_id);
  return (
    <div style={{ maxWidth: 560, margin: "60px auto", textAlign: "center" }}>
      <p className="eyebrow">PLANS</p>
      <h2 style={{ fontSize: "1.8rem" }}>You're subscribed!</h2>
      <p style={{ color: "var(--muted)" }}>
        Your payment went through. Your new tier activates in a moment —
        if it doesn't show right away, give it a few seconds and refresh.
      </p>
      {facts && (
        <div
          style={{
            textAlign: "left",
            border: "1px solid var(--line, #ddd)",
            borderRadius: 12,
            padding: "16px 20px",
            marginTop: 20,
          }}
        >
          {facts.planName && (
            <p style={{ margin: "6px 0" }}>
              <strong>Plan:</strong> {facts.planName}
              {facts.amountCents != null &&
                ` — ${formatAmount(facts.amountCents, facts.currency)} / ${facts.interval}`}
            </p>
          )}
          {!facts.planName && facts.amountCents != null && (
            <p style={{ margin: "6px 0" }}>
              <strong>Price:</strong>{" "}
              {formatAmount(facts.amountCents, facts.currency)} / {facts.interval}
            </p>
          )}
          {facts.status && (
            <p style={{ margin: "6px 0" }}>
              <strong>Status:</strong>{" "}
              {STATUS_LABELS[facts.status] || facts.status}
            </p>
          )}
          {facts.status === "trialing" && facts.trialEnd && (
            <p style={{ margin: "6px 0" }}>
              <strong>Trial ends:</strong> {formatDate(facts.trialEnd)} — that's
              when your plan price starts unless you cancel before then.
            </p>
          )}
          {facts.status === "active" && facts.periodEnd && (
            <p style={{ margin: "6px 0" }}>
              <strong>Next billing date:</strong> {formatDate(facts.periodEnd)}
            </p>
          )}
        </div>
      )}
      <Link
        href={`/app/${companyId}/plans`}
        style={{
          display: "inline-block",
          marginTop: 20,
          padding: "12px 28px",
          borderRadius: 999,
          background: "var(--brand)",
          color: "#fff",
          fontWeight: 800,
          textDecoration: "none",
        }}
      >
        Back to Plans
      </Link>
    </div>
  );
}
