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

// Verify the caller is an owner of the company. Returns { user, company }
// or a NextResponse error.
async function verifyOwner(req, companyId) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
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
  const { data: company } = await createClient(SUPABASE_URL, SERVICE_KEY)
    .from("companies")
    .select("stripe_subscription_id")
    .eq("id", companyId)
    .single();
  if (!company?.stripe_subscription_id) {
    return { error: NextResponse.json({ error: "No active subscription" }, { status: 400 }) };
  }
  return { company };
}

// GET ?companyId= -> { cancelAtPeriodEnd, currentPeriodEnd } (owner only)
export async function GET(req) {
  try {
    const companyId = new URL(req.url).searchParams.get("companyId");
    if (!companyId) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const v = await verifyOwner(req, companyId);
    if (v.error) return v.error;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sub = await stripe.subscriptions.retrieve(v.company.stripe_subscription_id);
    return NextResponse.json({
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      currentPeriodEnd: sub.current_period_end || null,
      status: sub.status,
    });
  } catch (e) {
    console.error("stripe cancel status error", e);
    return NextResponse.json({ error: "Could not check subscription" }, { status: 500 });
  }
}

// POST { companyId } -> schedules cancellation at the end of the billing
// period (owner only). Idempotent: if already scheduled, returns the
// existing end date.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`stripe-cancel:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { companyId } = await req.json();
    if (!companyId) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const v = await verifyOwner(req, companyId);
    if (v.error) return v.error;

    const sub = await stripe.subscriptions.retrieve(v.company.stripe_subscription_id);
    if (!sub.cancel_at_period_end) {
      const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      return NextResponse.json({
        ok: true,
        alreadyScheduled: false,
        currentPeriodEnd: updated.current_period_end || null,
      });
    }
    return NextResponse.json({
      ok: true,
      alreadyScheduled: true,
      currentPeriodEnd: sub.current_period_end || null,
    });
  } catch (e) {
    console.error("stripe cancel error", e);
    return NextResponse.json({ error: "Could not cancel subscription" }, { status: 500 });
  }
}
