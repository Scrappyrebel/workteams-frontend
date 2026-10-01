"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { TIERS } from "../../../../lib/tiers";
import { getTierPrices } from "../../../../lib/product";

export default function PlansPage() {
  const { company, member, loading } = useCompany();
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState(null);
  const [billing, setBilling] = useState(null);

  useEffect(() => {
    getTierPrices().then(setPrices);
  }, []);

  useEffect(() => {
    if (!company?.id) return;
    supabase()
      .from("companies")
      .select("tier,subscription_status")
      .eq("id", company.id)
      .single()
      .then(({ data }) => setBilling(data));
  }, [company?.id]);

  const isOwner = member && member.role === "owner";
  const tier = billing?.tier || company?.tier || "starter";
  // A live billing relationship exists when Stripe reports one; the raw
  // Stripe subscription ID is never sent to the browser.
  const hasSubscription = !!billing?.subscription_status && billing.subscription_status !== "none";
  const status = billing?.subscription_status || "none";

  async function api(path, body) {
    const { data: { session } } = await supabase().auth.getSession();
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  async function subscribe(key) {
    if (!isOwner || key === tier) return;
    if (!confirm(`Subscribe ${company.name} to the ${TIERS[key].name} tier? You'll check out with Stripe.`)) return;
    setBusy(true);
    try {
      const { url } = await api("/api/stripe/checkout", { companyId: company.id, tier: key });
      window.location.href = url;
    } catch (e) {
      alert("Could not start checkout: " + e.message);
      setBusy(false);
    }
  }

  async function manageBilling() {
    setBusy(true);
    try {
      const { url } = await api("/api/stripe/portal", { companyId: company.id });
      window.location.href = url;
    } catch (e) {
      alert("Could not open billing: " + e.message);
      setBusy(false);
    }
  }

  if (loading || !company) return <p>Loading…</p>;

  return (
    <div>
      <p className="eyebrow">PLANS</p>
      <h2 style={{ fontSize: "1.8rem" }}>Choose your tier</h2>
      <p style={{ color: "var(--muted)" }}>
        {hasSubscription
          ? `Subscription status: ${status}. Manage or change your plan through billing.`
          : "Pick a tier to subscribe. You'll check out securely with Stripe."}
      </p>
      {isOwner && hasSubscription && (
        <button onClick={manageBilling} disabled={busy} style={{ ...button, width: "auto", padding: "12px 28px", marginTop: 8 }}>
          {busy ? "Opening…" : "Manage billing"}
        </button>
      )}

      <div className="portal-grid" style={{ marginTop: 20 }}>
        {Object.keys(TIERS).map((key) => {
          const t = TIERS[key];
          const isCurrent = tier === key;
          return (
            <div
              className="portal-card"
              key={key}
              style={isCurrent ? { border: "2px solid var(--brand)", minHeight: 0 } : { minHeight: 0 }}
            >
              <span className="card-kicker">{t.name}{isCurrent && " • CURRENT"}</span>
              <h2 style={{ margin: "8px 0" }}>
                ${prices ? prices[key] : t.examplePrice}
                <span style={{ fontSize: "1rem", fontWeight: 400, color: "var(--muted)" }}>/mo</span>
              </h2>
              <p>{t.tagline}</p>
              <ul style={{ paddingLeft: 20, margin: "10px 0 20px" }}>
                {t.features.map((f) => (
                  <li key={f} style={{ marginBottom: 6 }}>{f}</li>
                ))}
              </ul>
              {isOwner ? (
                hasSubscription ? (
                  <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
                    {isCurrent ? "This is your current plan." : "Change plans through Manage billing."}
                  </p>
                ) : (
                  <button
                    onClick={() => subscribe(key)}
                    disabled={busy || isCurrent}
                    style={isCurrent ? disabledButton : button}
                  >
                    {isCurrent ? "Current tier" : `Subscribe to ${t.name}`}
                  </button>
                )
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>Only an owner can change the tier.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const button = {
  width: "100%",
  padding: "12px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const disabledButton = {
  ...button,
  background: "#e8ebf3",
  color: "var(--muted)",
  cursor: "default",
};
