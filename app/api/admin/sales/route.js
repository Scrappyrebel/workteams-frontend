import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

function productOwnerEmail() {
  const email = (process.env.PRODUCT_OWNER_EMAIL || "").trim().toLowerCase();
  if (!email) throw new Error("PRODUCT_OWNER_EMAIL is not configured");
  return email;
}

async function callerIsProductOwner(req) {
  const ownerEmail = productOwnerEmail();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/, "");
  if (!token) return { ok: false, status: 401, error: "Sign in required" };
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user || (user.email || "").toLowerCase() !== ownerEmail) {
    return { ok: false, status: 403, error: "Not authorized" };
  }
  return { ok: true, user };
}

// GET -> sales dashboard data for the product owner only.
// { mrr, totalActive, byTier: { starter: {count, mrr}, ... }, recent: [{date, tier, amount, status}] }
// No customer names or emails ever leave this route.
export async function GET(req) {
  try {
    const rl = checkRateLimit(`admin-sales:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

    const auth = await callerIsProductOwner(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (!STRIPE_KEY) {
      return NextResponse.json({ error: "Stripe is not connected yet." }, { status: 503 });
    }
    const stripe = new Stripe(STRIPE_KEY);
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Map Stripe price IDs -> tier keys, same as the webhook does.
    const { data: tierRows } = await sb.from("product_tiers").select("tier, stripe_price_id");
    const priceToTier = {};
    for (const r of tierRows || []) {
      if (r.stripe_price_id) priceToTier[r.stripe_price_id] = r.tier;
    }
    const tierOf = (priceId) => priceToTier[priceId] || "unknown";

    // Active subscriptions -> MRR + per-tier counts.
    const subs = await stripe.subscriptions.list({
      status: "active",
      limit: 100,
      expand: ["data.items.data.price"],
    });
    const byTier = {};
    let mrr = 0;
    for (const s of subs.data) {
      for (const item of s.items.data) {
        const price = item.price;
        const tier = tierOf(price.id);
        const monthly = ((price.unit_amount || 0) / 100) * (item.quantity || 1) *
          (price.recurring?.interval === "year" ? 1 / 12 : 1);
        mrr += monthly;
        byTier[tier] = byTier[tier] || { count: 0, mrr: 0 };
        byTier[tier].count += 1;
        byTier[tier].mrr += monthly;
      }
    }

    // Recent paid invoices -> "what sold when".
    const invoices = await stripe.invoices.list({
      limit: 25,
      status: "paid",
      expand: ["data.lines.data.price"],
    });
    const recent = [];
    for (const inv of invoices.data) {
      const line = inv.lines?.data?.[0];
      recent.push({
        date: new Date(inv.created * 1000).toISOString().slice(0, 10),
        tier: tierOf(line?.price?.id),
        amount: (inv.amount_paid || 0) / 100,
        status: inv.status,
      });
    }

    return NextResponse.json({
      mrr: Math.round(mrr * 100) / 100,
      totalActive: subs.data.length,
      byTier,
      recent,
    });
  } catch (e) {
    console.error("admin sales error", e);
    return NextResponse.json({ error: "Could not load sales data." }, { status: 500 });
  }
}
