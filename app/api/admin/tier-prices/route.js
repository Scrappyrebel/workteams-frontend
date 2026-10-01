import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import { TIERS } from "../../../../lib/tiers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Server-side product-owner check. Set in Vercel env vars.
const PRODUCT_OWNER_EMAIL = (process.env.PRODUCT_OWNER_EMAIL || "lillybsjanitorial@gmail.com").toLowerCase();

// GET -> { prices } (public read stays via the product_tiers table policy)
// POST { prices: { starter, plus, pro } } -> { ok }  (product owner only,
// writes with the service role — clients have no direct write access)
export async function POST(req) {
  try {
    const rl = checkRateLimit(`tier-prices:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    if (!token) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const sb = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user || (user.email || "").toLowerCase() !== PRODUCT_OWNER_EMAIL) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { prices } = await req.json();
    for (const key of Object.keys(TIERS)) {
      const value = Number(prices?.[key]);
      if (!Number.isFinite(value) || value < 0 || value > 100000) {
        return NextResponse.json({ error: `Bad price for ${key}` }, { status: 400 });
      }
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const key of Object.keys(TIERS)) {
      const { error } = await db
        .from("product_tiers")
        .update({ price: Number(prices[key]), updated_at: new Date().toISOString() })
        .eq("tier", key);
      if (error) {
        console.error("tier-prices update failed", error.message);
        return NextResponse.json({ error: "Could not save prices" }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("tier-prices error", e);
    return NextResponse.json({ error: "Could not save prices" }, { status: 500 });
  }
}
