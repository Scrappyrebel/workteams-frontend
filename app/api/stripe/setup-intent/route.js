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

// POST { companyId } -> { clientSecret } for a SetupIntent the Plans
// page confirms with Stripe Elements, so the new card is typed into
// a Stripe-hosted field INSIDE the app and never touches our server
// or leaves the page (owner only).
export async function POST(req) {
  try {
    const rl = checkRateLimit(`stripe-setup-intent:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const { companyId } = await req.json();
    if (!companyId) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const v = await verifyOwner(req, companyId, { needSubscription: false });
    if (v.error) return v.error;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.setupIntents.create({
      customer: v.company.stripe_customer_id,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { company_id: companyId },
    });
    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (e) {
    console.error("stripe setup-intent error", e);
    return NextResponse.json({ error: "Could not start card update" }, { status: 500 });
  }
}
