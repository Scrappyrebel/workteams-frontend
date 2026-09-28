"use client";

import { useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { TIERS } from "../../../../lib/tiers";

export default function PlansPage() {
  const { company, member, loading } = useCompany();
  const [switching, setSwitching] = useState(false);
  const [current, setCurrent] = useState(null);

  const isOwner = member && member.role === "owner";
  const tier = current || company?.tier || "starter";

  async function switchTier(key) {
    if (!isOwner || key === tier) return;
    if (!confirm(`Switch ${company.name} to the ${TIERS[key].name} tier?`)) return;
    setSwitching(true);
    const { error } = await supabase().from("companies").update({ tier: key }).eq("id", company.id);
    setSwitching(false);
    if (error) alert("Could not switch tier: " + error.message);
    else setCurrent(key);
  }

  if (loading || !company) return <p>Loading…</p>;

  return (
    <div>
      <p className="eyebrow">PLANS</p>
      <h2 style={{ fontSize: "1.8rem" }}>Choose your tier</h2>
      <p style={{ color: "var(--muted)" }}>
        Billing is not connected yet — tiers can be switched freely during this preview.
      </p>

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
                ${t.examplePrice}
                <span style={{ fontSize: "1rem", fontWeight: 400, color: "var(--muted)" }}>/mo</span>
              </h2>
              <p style={{ fontStyle: "italic", fontSize: "0.85rem", color: "var(--muted)" }}>Example pricing</p>
              <p>{t.tagline}</p>
              <ul style={{ paddingLeft: 20, margin: "10px 0 20px" }}>
                {t.features.map((f) => (
                  <li key={f} style={{ marginBottom: 6 }}>{f}</li>
                ))}
              </ul>
              {isOwner ? (
                <button
                  onClick={() => switchTier(key)}
                  disabled={switching || isCurrent}
                  style={isCurrent ? disabledButton : button}
                >
                  {isCurrent ? "Current tier" : `Switch to ${t.name}`}
                </button>
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
