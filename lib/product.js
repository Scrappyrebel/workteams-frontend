import { supabase } from "./supabase";
import { TIERS } from "./tiers";

// Whether the signed-in user is the product owner. Answered by the
// server (/api/admin/tier-prices checks PRODUCT_OWNER_EMAIL, which has no
// hard-coded fallback) — the UI never decides privilege from an email
// constant. Result is cached per page load.
let ownerCheckCache = null;
export async function isProductOwner() {
  if (ownerCheckCache !== null) return ownerCheckCache;
  try {
    const { data: { session } } = await supabase().auth.getSession();
    if (!session?.access_token) {
      ownerCheckCache = false;
      return false;
    }
    const res = await fetch("/api/admin/tier-prices", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    ownerCheckCache = res.ok && json.isProductOwner === true;
  } catch {
    ownerCheckCache = false;
  }
  return ownerCheckCache;
}

// Tier prices, from the database when available, falling back to the
// example prices in lib/tiers.js (e.g. before the SQL has been run).
// Returns { starter: 30, plus: 150, pro: 225 } shape.
export async function getTierPrices() {
  const fallback = {};
  for (const key of Object.keys(TIERS)) fallback[key] = TIERS[key].examplePrice;
  try {
    const { data, error } = await supabase().from("product_tiers").select("tier, price");
    if (error || !data || data.length === 0) return fallback;
    const prices = { ...fallback };
    for (const row of data) {
      if (prices[row.tier] !== undefined) prices[row.tier] = Number(row.price);
    }
    return prices;
  } catch {
    return fallback;
  }
}
