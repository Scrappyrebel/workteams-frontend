import { supabase } from "./supabase";
import { TIERS } from "./tiers";

// The product owner's sign-in email. Only this account can change tier prices.
// If you sign in with a different email, update this.
export const PRODUCT_OWNER_EMAIL = "lillybsjanitorial@gmail.com";

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
