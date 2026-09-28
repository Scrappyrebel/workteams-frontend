"use client";

import { useCompany } from "../../../../lib/company-context";

const PAYROLL_PROVIDERS = [
  { name: "Gusto", url: "https://gusto.com", blurb: "Hand off your hour reports for payroll runs." },
  { name: "ADP", url: "https://www.adp.com", blurb: "Send hours to your ADP payroll account." },
  { name: "Paychex", url: "https://www.paychex.com", blurb: "Sync hours with Paychex payroll." },
  { name: "QuickBooks Payroll", url: "https://quickbooks.intuit.com/payroll/", blurb: "Use QuickBooks for payroll alongside your hours." },
];

export default function ConnectionsPage() {
  const { company, loading } = useCompany();

  if (loading || !company) return <p>Loading…</p>;

  return (
    <div>
      <p className="eyebrow">CONNECTIONS</p>
      <h2 style={{ fontSize: "1.8rem" }}>Payroll & accounting links</h2>
      <p style={{ color: "var(--muted)" }}>
        WorkTeams doesn't run payroll. These links take you to the providers so you can
        connect your own account and hand off hour reports.
      </p>

      <h3 style={{ marginTop: 26 }}>Payroll providers</h3>
      <div className="portal-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {PAYROLL_PROVIDERS.map((p) => (
          <div className="portal-card" key={p.name} style={{ minHeight: 0, padding: 22 }}>
            <span className="card-kicker">{p.name}</span>
            <p style={{ marginTop: 8 }}>{p.blurb}</p>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginTop: 10,
                padding: "10px 20px",
                borderRadius: 999,
                background: "var(--brand)",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              Connect ↗
            </a>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 30 }}>QuickBooks</h3>
      <section className="panel" style={{ padding: 24 }}>
        <p className="eyebrow">QUICKBOOKS ONLINE SYNC</p>
        <p>
          Automatic sync with QuickBooks Online needs your QuickBooks app credentials —
          that's coming next. Meanwhile you can open QuickBooks in a new tab and match
          up your hour reports by hand.
        </p>
        <a
          href="https://quickbooks.intuit.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 6,
            padding: "10px 20px",
            borderRadius: 999,
            border: "1px solid var(--line)",
            background: "#fff",
            fontWeight: 800,
          }}
        >
          Open QuickBooks ↗
        </a>
      </section>
    </div>
  );
}
