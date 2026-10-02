"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { isProductOwner } from "../../../../lib/product";
import { TIERS } from "../../../../lib/tiers";

const TIER_ORDER = ["starter", "plus", "pro"];

export default function SalesPage() {
  const { company, loading } = useCompany();
  const [owner, setOwner] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    isProductOwner().then(setOwner);
  }, []);

  useEffect(() => {
    if (owner !== true) return;
    (async () => {
      try {
        const { data: { session } } = await supabase().auth.getSession();
        const res = await fetch("/api/admin/sales", {
          headers: { Authorization: `Bearer ${session?.access_token || ""}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Could not load sales data.");
        setData(json);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [owner]);

  if (loading || owner === null) return <p>Loading…</p>;
  if (owner === false) return <p>Not authorized.</p>;

  return (
    <div>
      <p className="eyebrow">PRODUCT OWNER</p>
      <h2 style={{ fontSize: "1.8rem" }}>Sales dashboard</h2>
      <p style={{ color: "var(--muted)" }}>
        Subscriptions sold and monthly recurring revenue. Customer identities stay in Stripe — this page shows totals only.
      </p>

      {error && <p style={{ color: "#a33", fontWeight: 700 }}>{error}</p>}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "18px 0" }}>
            <section className="panel" style={{ padding: 22, textAlign: "center" }}>
              <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 800 }}>MONTHLY RECURRING REVENUE</div>
              <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "var(--brand-deep)" }}>
                ${data.mrr.toFixed(2)}
              </div>
            </section>
            <section className="panel" style={{ padding: 22, textAlign: "center" }}>
              <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 800 }}>ACTIVE SUBSCRIPTIONS</div>
              <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "var(--brand-deep)" }}>
                {data.totalActive}
              </div>
            </section>
          </div>

          <h3 style={{ margin: "18px 0 10px" }}>By tier</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {TIER_ORDER.map((key) => {
              const t = data.byTier[key] || { count: 0, mrr: 0 };
              return (
                <div key={key} className="portal-card" style={{ minHeight: 0, padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <strong>{TIERS[key]?.name || key}</strong>
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                        {t.count} active • ${t.mrr.toFixed(2)}/mo
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <h3 style={{ margin: "22px 0 10px" }}>Recent payments</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {data.recent.length === 0 && <p style={{ color: "var(--muted)" }}>No payments yet.</p>}
            {data.recent.map((r, i) => (
              <div key={i} className="portal-card" style={{ minHeight: 0, padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <strong>{TIERS[r.tier]?.name || r.tier}</strong>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{r.date}</div>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>${r.amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 18 }}>
            Need customer names or receipts? Those live in your{" "}
            <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
              Stripe dashboard
            </a>
            .
          </p>
        </>
      )}
    </div>
  );
}
