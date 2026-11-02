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
  // Depth D-WT-42/43 (additive display only — the save path below is
  // unchanged): the prices as last read from storage, each tier's
  // last-changed time, and the before → after list from the most
  // recent save, so the owner can see what is saved, what a save
  // changed, and when each price last moved.
  const [savedPrices, setSavedPrices] = useState(null);
  const [savedUpdated, setSavedUpdated] = useState(null);
  const [lastSaveChanges, setLastSaveChanges] = useState(null);

  // product_tiers.updated_at is stamped by the save route on every
  // price change. Tolerant read: any failure (table or column not
  // there yet, RLS, offline) simply hides the last-changed lines —
  // a missing timestamp must never block or misstate a price.
  async function loadLastChanged() {
    try {
      const { data, error } = await supabase()
        .from("product_tiers")
        .select("tier, updated_at");
      if (error || !data) return;
      const map = {};
      for (const row of data) {
        if (row && row.tier && row.updated_at) map[row.tier] = row.updated_at;
      }
      setSavedUpdated(map);
    } catch {
      // leave savedUpdated as-is; the lines just don't render
    }
  }

  useEffect(() => {
    (async () => {
      const loaded = await getTierPrices();
      setPrices(loaded);
      setSavedPrices(loaded);
      await loadLastChanged();
    })();
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
    else {
      setSavedAt(new Date().toLocaleTimeString());
      // Read-out of what this save actually changed (before → after),
      // from the pre-save snapshot. The route skips tiers whose price
      // did not change, so an unchanged tier never appears here.
      if (savedPrices) {
        const changes = [];
        for (const key of Object.keys(TIERS)) {
          const before = Number(savedPrices[key]);
          const after = Number(prices[key]);
          if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
            changes.push({ key, before, after });
          }
        }
        setLastSaveChanges(changes);
        const snapshot = {};
        for (const key of Object.keys(TIERS)) snapshot[key] = Number(prices[key]);
        setSavedPrices(snapshot);
      }
      loadLastChanged();
    }
  }

  if (!prices) return <p>Loading…</p>;

  const hasUnsaved =
    !!savedPrices &&
    Object.keys(TIERS).some((key) => Number(prices[key]) !== Number(savedPrices[key]));

  const lastChangedFor = (key) => {
    const raw = savedUpdated && savedUpdated[key];
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
  };

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 14, marginTop: 16, maxWidth: 440 }}>
      {savedPrices && (
        <section
          aria-label="Prices currently saved"
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "12px 14px",
            display: "grid",
            gap: 6,
          }}
        >
          <span style={{ fontWeight: 700 }}>Prices currently saved</span>
          {Object.keys(TIERS).map((key) => (
            <span key={key} style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
              {TIERS[key].name}: ${Number(savedPrices[key])}/month
              {lastChangedFor(key) ? ` · Last changed ${lastChangedFor(key)}` : ""}
            </span>
          ))}
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            This is what the Plans page shows and new checkouts charge right now.
          </span>
        </section>
      )}
      {Object.keys(TIERS).map((key) => (
        <label key={key} style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>
            {TIERS[key].name} — $/month
          </span>
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            {TIERS[key].tagline} Includes: {TIERS[key].features.join(", ")}.
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
      {hasUnsaved && (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>
          You have unsaved changes. The saved prices at the top stay in effect until you save.
        </p>
      )}
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
      {savedAt && lastSaveChanges && (
        <section
          aria-label="What this save changed"
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "12px 14px",
            display: "grid",
            gap: 6,
          }}
        >
          <span style={{ fontWeight: 700 }}>What this save changed</span>
          {lastSaveChanges.length === 0 ? (
            <span style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
              No prices changed — the saved prices are the same as before.
            </span>
          ) : (
            lastSaveChanges.map((c) => (
              <span key={c.key} style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
                {TIERS[c.key].name}: ${c.before}/month → ${c.after}/month
              </span>
            ))
          )}
        </section>
      )}
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        How saving works: for each price you changed, the matching Stripe price is created
        first and the displayed price is updated only after that succeeds, so what the
        Plans page shows and what a new checkout charges can&apos;t drift apart.
        Subscriptions already running keep the Stripe price they started on — a change
        here applies to new checkouts.
      </p>
    </form>
  );
}
