import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import { TIERS } from "../../../../lib/tiers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The product owner's sign-in email lives ONLY in the Vercel env var
// PRODUCT_OWNER_EMAIL. There is no hard-coded fallback: if it is unset the
// route fails closed (nobody can change prices, nobody is treated as the
// product owner).
function productOwnerEmail() {
  const email = (process.env.PRODUCT_OWNER_EMAIL || "").trim().toLowerCase();
  if (!email) throw new Error("PRODUCT_OWNER_EMAIL is not configured");
  return email;
}

async function callerIsProductOwner(req) {
  const ownerEmail = productOwnerEmail();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
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

// GET -> { prices, isProductOwner }.
// Prices are public (also readable via the product_tiers table policy);
// isProductOwner lets the UI show/hide owner-only controls without ever
// deciding privilege client-side from a hard-coded email.
export async function GET(req) {
  try {
    let isProductOwner = false;
    try {
      const check = await callerIsProductOwner(req);
      isProductOwner = check.ok;
    } catch {
      isProductOwner = false;
    }
    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await db.from("product_tiers").select("tier, price");
    if (error) throw error;
    const prices = {};
    for (const key of Object.keys(TIERS)) prices[key] = TIERS[key].examplePrice;
    for (const row of data || []) {
      if (prices[row.tier] !== undefined) prices[row.tier] = Number(row.price);
    }
    return NextResponse.json({ prices, isProductOwner });
  } catch (e) {
    console.error("tier-prices GET error", e.message);
    return NextResponse.json({ error: "Could not load prices" }, { status: 500 });
  }
}

// POST { prices: { starter, plus, pro } } -> { ok }  (product owner only).
// A price change is one atomic workflow: for every tier whose display
// price changed, create the matching Stripe Price FIRST, then update the
// database row (price + stripe_price_id) only after Stripe succeeds.
// The Plans page displays `price` and checkout charges `stripe_price_id`,
// so they can never diverge: the new display price is never presented
// until its Stripe Price exists.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`tier-prices:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    let check;
    try {
      check = await callerIsProductOwner(req);
    } catch (e) {
      console.error("tier-prices auth misconfigured", e.message);
      return NextResponse.json({ error: "Price management is not configured" }, { status: 500 });
    }
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

    const { prices } = await req.json();
    for (const key of Object.keys(TIERS)) {
      const value = Number(prices?.[key]);
      if (!Number.isFinite(value) || value < 0 || value > 100000) {
        return NextResponse.json({ error: `Bad price for ${key}` }, { status: 400 });
      }
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rows, error: readErr } = await db
      .from("product_tiers")
      .select("tier, price, stripe_price_id");
    if (readErr) throw readErr;
    const current = {};
    for (const row of rows || []) current[row.tier] = row;

    for (const key of Object.keys(TIERS)) {
      const newPrice = Number(prices[key]);
      const row = current[key];
      if (!row) {
        return NextResponse.json({ error: `No product_tiers row for ${key}` }, { status: 500 });
      }
      if (Number(row.price) === newPrice) continue; // unchanged — nothing to sync

      // Never pair a live secret key with a test-mode Price object.
      let productId;
      if (row.stripe_price_id) {
        let existing;
        try {
          existing = await stripe.prices.retrieve(row.stripe_price_id);
        } catch {
          return NextResponse.json(
            { error: `Stripe Price for ${key} not found — fix it in Stripe first` },
            { status: 500 }
          );
        }
        if (existing.livemode !== (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_")) {
          return NextResponse.json(
            { error: `Stripe Price mode mismatch for ${key} — refusing to mix test and live objects` },
            { status: 500 }
          );
        }
        productId = existing.product;
      } else {
        return NextResponse.json(
          { error: `No Stripe Price configured for ${key} — create it in Stripe first` },
          { status: 500 }
        );
      }

      // 1. Create the new Stripe Price first...
      const created = await stripe.prices.create({
        unit_amount: Math.round(newPrice * 100),
        currency: "usd",
        recurring: { interval: "month" },
        product: productId,
      });
      // 2. ...then point the database at it together with the display price.
      const { error: writeErr } = await db
        .from("product_tiers")
        .update({
          price: newPrice,
          stripe_price_id: created.id,
          updated_at: new Date().toISOString(),
        })
        .eq("tier", key);
      if (writeErr) {
        console.error("tier-prices update failed", writeErr.message);
        return NextResponse.json(
          { error: `Stripe Price created (${created.id}) but the database update failed — reconcile manually` },
          { status: 500 }
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("tier-prices error", e);
    return NextResponse.json({ error: "Could not save prices" }, { status: 500 });
  }
}
