"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { TIERS } from "../lib/tiers";
import { getTierPrices } from "../lib/product";

// Shared tier-price editor form. Used by /admin/tiers and the in-app
// "Tier Prices" tab. Saves go through /api/admin/tier-prices, which checks
// the product-owner email server-side and writes with the service role —
// clients have no direct write access to product_tiers.
export default function TierPricesEditor() {
  const [prices, setPrices] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    (async () => setPrices(await getTierPrices()))();
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    let failed = null;
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch("/api/admin/tier-prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ prices }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) failed = json.error || "Could not save";
    } catch (err) {
      failed = err.message;
    }
    setSaving(false);
    if (failed) alert("Could not save: " + failed);
    else setSavedAt(new Date().toLocaleTimeString());
  }

  if (!prices) return <p>Loading…</p>;

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 14, marginTop: 16, maxWidth: 440 }}>
      {Object.keys(TIERS).map((key) => (
        <label key={key} style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>
            {TIERS[key].name} — $/month
          </span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={prices[key]}
            onChange={(e) => setPrices({ ...prices, [key]: e.target.value })}
            style={{ padding: 12, borderRadius: 10, border: "1px solid var(--line)", fontSize: "1.1rem" }}
          />
        </label>
      ))}
      <button
        type="submit"
        disabled={saving}
        style={{
          background: "var(--brand)",
          color: "#fff",
          fontWeight: 800,
          padding: "12px 26px",
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
        }}
      >
        {saving ? "Saving…" : "Save prices"}
      </button>
      {savedAt && (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Saved at {savedAt}. New prices show on the Plans page right away.
        </p>
      )}
    </form>
  );
}
