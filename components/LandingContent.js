"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TIERS } from "../lib/tiers";
import { getTierPrices } from "../lib/product";

export default function LandingContent() {
  const tierKeys = ["starter", "plus", "pro"];
  const [prices, setPrices] = useState(null);

  useEffect(() => {
    getTierPrices().then(setPrices);
  }, []);
  return (
    <main className="site-shell">
      <section className="hero panel">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">WT</div>
          <div>
            <p className="eyebrow">WORKTEAMS</p>
            <h1>Run your cleaning business from your pocket.</h1>
          </div>
        </div>
        <p className="hero-copy">
          WorkTeams gives cleaning crews one simple home for shift schedules, a GPS time
          clock, and payroll-ready hour reports — built mobile-first for the people
          doing the work.
        </p>
        <div style={{ marginLeft: 76, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="/login"
            style={{
              background: "var(--brand)",
              color: "#fff",
              fontWeight: 800,
              padding: "12px 26px",
              borderRadius: 999,
            }}
          >
            Sign in
          </Link>
          <Link
            href="/login"
            style={{
              border: "1px solid var(--line)",
              background: "#fff",
              fontWeight: 800,
              padding: "12px 26px",
              borderRadius: 999,
            }}
          >
            Get started free
          </Link>
        </div>
      </section>

      <section aria-label="Plans" style={{ margin: "34px 0" }}>
        <p className="eyebrow">PLANS</p>
        <h2 style={{ fontSize: "1.9rem", margin: "6px 0 18px" }}>Three simple tiers. Pick your fit.</h2>
        <div className="portal-grid">
          {tierKeys.map((key) => {
            const tier = TIERS[key];
            return (
              <div className="portal-card" key={key}>
                <span className="card-kicker">{tier.name}</span>
                <h2>${prices ? prices[key] : tier.examplePrice}<span style={{ fontSize: "1rem", fontWeight: 400, color: "var(--muted)" }}>/mo</span></h2>
                <p style={{ fontStyle: "italic", fontSize: "0.85rem", color: "var(--muted)" }}>Example pricing</p>
                <p>{tier.tagline}</p>
                <ul style={{ paddingLeft: 20, margin: "10px 0 20px", color: "var(--ink)" }}>
                  {tier.features.map((f) => (
                    <li key={f} style={{ marginBottom: 6 }}>{f}</li>
                  ))}
                </ul>
                <span className="card-link">Sign in to choose →</span>
              </div>
            );
          })}
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Starter covers the everyday essentials — scheduling, the time clock, hour
          reports, and alerts. Plus adds quality and communication tools. Pro unlocks
          bidding, work orders, supplies, and client tools.
        </p>
      </section>

      <section className="panel foundation-panel">
        <div>
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>Built for crews, not desks.</h2>
        </div>
        <div className="chip-row">
          <span>Schedule shifts</span>
          <span>Clock in with GPS</span>
          <span>Get hour reports</span>
          <span>Spot late & no-shows</span>
          <span>Manage locations</span>
        </div>
      </section>
    </main>
  );
}
