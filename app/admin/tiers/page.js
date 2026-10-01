"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { getUser } from "../../../lib/session";
import { TIERS } from "../../../lib/tiers";
import { PRODUCT_OWNER_EMAIL, getTierPrices } from "../../../lib/product";

// Product-owner-only page for editing tier prices.
// Not linked in the app nav — bookmark /admin/tiers.
export default function TierPricesAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [prices, setPrices] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getUser();
      if (!u || u.email !== PRODUCT_OWNER_EMAIL) {
        router.replace("/login");
        return;
      }
      setAllowed(true);
      setPrices(await getTierPrices());
    })();
  }, [router]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    const sb = supabase();
    let failed = null;
    for (const key of Object.keys(TIERS)) {
      const { error } = await sb
        .from("product_tiers")
        .update({ price: Number(prices[key]), updated_at: new Date().toISOString() })
        .eq("tier", key);
      if (error) failed = error.message;
    }
    setSaving(false);
    if (failed) alert("Could not save: " + failed);
    else alert("Prices updated.");
  }

  if (!allowed || !prices) return <p>Loading…</p>;

  return (
    <main className="site-shell" style={{ maxWidth: 480 }}>
      <p className="eyebrow">ADMIN</p>
      <h2>Tier prices</h2>
      <p style={{ color: "var(--muted)" }}>
        These show on the landing page and the Plans page. Changes go live immediately.
      </p>
      <form onSubmit={save} style={{ display: "grid", gap: 14, marginTop: 16 }}>
        {Object.keys(TIERS).map((key) => (
          <label key={key} style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>{TIERS[key].name} — $/month</span>
            <input
              type="number"
              min="0"
              step="1"
              value={prices[key]}
              onChange={(e) => setPrices({ ...prices, [key]: e.target.value })}
              style={{ padding: 12, borderRadius: 10, border: "1px solid var(--line)", fontSize: "1.1rem" }}
            />
          </label>
        ))}
        <button
          type="submit"
          disabled={saving}
          style={{ background: "var(--brand)", color: "#fff", fontWeight: 800, padding: "12px 26px", borderRadius: 999, border: "none" }}
        >
          {saving ? "Saving…" : "Save prices"}
        </button>
      </form>
    </main>
  );
}
