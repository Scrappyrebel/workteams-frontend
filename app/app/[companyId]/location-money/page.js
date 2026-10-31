"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";

function money(n) {
  const v = Number(n) || 0;
  return `$${v.toFixed(2)}`;
}

function counted(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function LocationMoneyPage() {
  const { company, member, loading } = useCompany();
  const [rows, setRows] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [computing, setComputing] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    setComputing(true);
    // Migration 077 creates the rollup function. Until the owner runs
    // it, the call errors — show a calm "not switched on yet" state
    // instead of breaking the page (the same posture as Invoices/061).
    const { data, error } = await supabase().rpc("workteams_location_money_rollup", {
      p_company_id: company.id,
    });
    if (error) {
      setUnavailable(true);
      setComputing(false);
      return;
    }
    setUnavailable(false);
    setRows((data || []).map((r) => ({
      id: r.location_id || "__unallocated",
      name: r.location_name || "No location",
      unallocated: !r.location_id,
      acceptedBids: Number(r.accepted_bids) || 0,
      estimated: Number(r.estimated) || 0,
      issuedInvoices: Number(r.issued_invoices) || 0,
      invoiced: Number(r.invoiced) || 0,
      paid: Number(r.paid) || 0,
      balance: Number(r.balance_due) || 0,
    })));
    setComputing(false);
  }

  useEffect(() => {
    if (!loading && company && member && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member]);

  if (loading || !company) return <p>Loading…</p>;

  if (!isManager) {
    return (
      <div>
        <p className="eyebrow">MONEY BY LOCATION</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Money by Location</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p style={{ margin: 0 }}>
            Billing totals are a financial record — owners and managers only.
          </p>
        </section>
      </div>
    );
  }

  // The totals are the plain sum of the rows on screen — including the
  // "No location" row — so the company total reconciles with its parts
  // by construction.
  const totals = rows.reduce(
    (s, r) => ({
      estimated: s.estimated + r.estimated,
      invoiced: s.invoiced + r.invoiced,
      paid: s.paid + r.paid,
      balance: s.balance + r.balance,
    }),
    { estimated: 0, invoiced: 0, paid: 0, balance: 0 }
  );

  return (
    <div>
      <p className="eyebrow">MONEY BY LOCATION</p>
      <h2 style={{ fontSize: "1.8rem" }}>Money by location</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Every location is a client. <strong>Estimated</strong> = accepted bids, valued the
        same way Profitability values them. <strong>Invoiced</strong> = issued invoices
        only (drafts are not billed yet; voided invoices are not counted).{" "}
        <strong>Paid</strong> = payments recorded against those invoices.{" "}
        <strong>Balance due</strong> = invoiced − paid. WorkTeams does not issue
        credit notes — an issued invoice is corrected by voiding it and issuing a new
        one. This page is read-only;
        it changes nothing. See also{" "}
        <Link href={`/app/${company.id}/invoices`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
          Invoices
        </Link>{" "}
        and{" "}
        <Link href={`/app/${company.id}/profitability`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
          Profitability
        </Link>
        .
      </p>

      {unavailable ? (
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <p style={{ margin: 0 }}>
            <strong>This view isn't switched on yet.</strong>
          </p>
          <p style={{ color: "var(--muted)", marginBottom: 0 }}>
            This view turns on with the latest WorkTeams update. Until then, this page
            stays empty — nothing else in the app is affected, and Invoices and
            Profitability keep working as they do today.
          </p>
        </section>
      ) : computing ? (
        <p>Crunching numbers…</p>
      ) : (
        <>
          <section className="panel" style={{ padding: 22, marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Stat label="Estimated" value={totals.estimated} />
              <Stat label="Invoiced" value={totals.invoiced} />
              <Stat label="Paid" value={totals.paid} />
              <Stat label="Balance due" value={totals.balance} highlight />
            </div>
          </section>

          <div style={{ display: "grid", gap: 10 }}>
            {rows.length === 0 && <p style={{ color: "var(--muted)" }}>No locations yet.</p>}
            {rows.map((r) => (
              <div key={r.id} className="portal-card" style={{ minHeight: 0, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <strong style={{ flex: 1 }}>{r.name}</strong>
                  <span style={{ fontWeight: 800, color: r.balance > 0 ? "#b3261e" : "var(--success-ink)" }}>
                    {money(r.balance)} due
                  </span>
                </div>
                <div style={{ fontSize: "0.88rem", color: "var(--muted)", marginTop: 6 }}>
                  Estimated {money(r.estimated)} • Invoiced {money(r.invoiced)} • Paid{" "}
                  {money(r.paid)} • Balance {money(r.balance)}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                  {counted(r.acceptedBids, "accepted bid", "accepted bids")} •{" "}
                  {counted(r.issuedInvoices, "issued invoice", "issued invoices")}
                </div>
                {r.unallocated && (
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                    Bids and invoices with no location assigned — a typed-in client name, or
                    a location that was later removed. Counted here in full and included in
                    the totals above, never spread across real locations.
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 700 }}>{label.toUpperCase()}</div>
      <div
        style={{
          fontSize: "1.5rem",
          fontWeight: 800,
          color: highlight ? (value > 0 ? "#b3261e" : "var(--success-ink)") : "var(--ink)",
        }}
      >
        {money(value)}
      </div>
    </div>
  );
}
