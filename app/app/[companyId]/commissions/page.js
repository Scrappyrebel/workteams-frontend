"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCommissionSettings } from "../../../../lib/use-commission-settings";
import { canUseWithRole } from "../../../../lib/tiers";
import {
  commissionPlanWording,
  formatMoney,
  formatPercent,
  monthlyCommission,
} from "../../../../lib/commission";
import CommissionModeler from "../../../../components/CommissionModeler";
import WageBonusModeler from "../../../../components/WageBonusModeler";

// Billing-period math matches the Bids pages: totals are per visit,
// commission is modeled on the monthly collected equivalent.
const VISITS_PER_MONTH = { weekly: 4.33, "2x-week": 8.67, "3x-week": 13, "5x-week": 21.67, biweekly: 2.17, monthly: 1 };

function modeTotal(b) {
  const mode = b.pricing_mode || "line_items";
  if (mode === "hourly") return Number(b.hours || 0) * Number(b.hourly_rate || 0);
  if (mode === "sqft") return Number(b.square_footage || 0) * Number(b.rate_per_sqft || 0);
  return 0;
}

function monthlyRevenueFor(bid) {
  if (!bid.frequency || bid.frequency === "one-time") return Number(bid.total || 0);
  const vpm = VISITS_PER_MONTH[bid.frequency];
  if (!vpm) return Number(bid.total || 0);
  return Number(bid.total || 0) * vpm;
}

export default function CommissionsPage() {
  const { loading, company, member, settings, visible, ownerCalculator, isOwner } = useCommissionSettings();
  const [bids, setBids] = useState([]);
  const [bidsLoading, setBidsLoading] = useState(true);

  const biddingAllowed = canUseWithRole(company?.effectiveTier || company?.tier, "bidding", member?.role);

  useEffect(() => {
    if (loading || !company || !visible || !biddingAllowed) {
      setBidsLoading(false);
      return;
    }
    (async () => {
      const sb = supabase();
      const { data } = await sb
        .from("bids")
        .select("id, client_name, title, status, pricing_mode, hours, hourly_rate, square_footage, rate_per_sqft, frequency")
        .eq("company_id", company.id)
        .eq("status", "accepted")
        .order("created_at", { ascending: false });
      const rows = data || [];
      const lineIds = rows.filter((r) => (r.pricing_mode || "line_items") === "line_items").map((r) => r.id);
      let totals = {};
      if (lineIds.length > 0) {
        const { data: items } = await sb.from("bid_items").select("bid_id, quantity, unit_price").in("bid_id", lineIds);
        for (const it of items || []) {
          totals[it.bid_id] = (totals[it.bid_id] || 0) + Number(it.quantity) * Number(it.unit_price);
        }
      }
      setBids(
        rows.map((r) => ({
          ...r,
          total: (r.pricing_mode || "line_items") === "line_items" ? totals[r.id] || 0 : modeTotal(r),
        }))
      );
      setBidsLoading(false);
    })();
  }, [loading, company, visible, biddingAllowed]);

  if (loading) return <p>Loading…</p>;

  if (!visible || !biddingAllowed) {
    return (
      <div>
        <p className="eyebrow">SALES</p>
        <h2 style={{ fontSize: "1.8rem" }}>Sales Commissions</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>This page is not available for your company or your role.</p>
          <Link href={`/app/${company?.id}/bids`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            ← Back to Bids
          </Link>
        </section>
      </div>
    );
  }

  const rows = bids.map((b) => {
    const monthlyRevenue = monthlyRevenueFor(b);
    return {
      bid: b,
      monthlyRevenue,
      spMonthly: monthlyCommission(settings, "salesperson_generated", monthlyRevenue),
      coMonthly: monthlyCommission(settings, "company_generated", monthlyRevenue),
    };
  });
  const projectedSpMonthly = rows.reduce((a, x) => a + x.spMonthly, 0);
  const projectedCoMonthly = rows.reduce((a, x) => a + x.coMonthly, 0);

  return (
    <div>
      <p className="eyebrow">SALES</p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "1.8rem", margin: "4px 0" }}>Sales Commissions</h2>
        {isOwner && (
          <Link
            href={`/app/${company.id}/settings/commission`}
            style={{ marginLeft: "auto", color: "var(--brand-deep)", fontWeight: 700 }}
          >
            Commission Settings →
          </Link>
        )}
      </div>
      <p style={{ color: "var(--muted)" }}>
        Projected commission from accepted bids, paid only on revenue actually collected during the first{" "}
        {settings.payoutMonths} service months.
      </p>

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>Collected-Revenue Rule</h3>
        <div style={{ display: "grid", gap: 6 }}>
          {settings.flatMonthlyAmount !== null ? (
            <span>
              <strong>Plan type:</strong> Flat {formatMoney(settings.flatMonthlyAmount)} per month instead of a
              percentage of revenue.
            </span>
          ) : (
            <>
              <span>
                <strong>Salesperson-generated:</strong> {formatPercent(settings.salespersonRatePercent)} of collected
                eligible revenue.
              </span>
              <span>
                <strong>Company-generated:</strong> {formatPercent(settings.companyRatePercent)} of collected eligible
                revenue.
              </span>
            </>
          )}
          <span>
            <strong>Term:</strong> First {settings.payoutMonths} service months only.
          </span>
          <span>
            <strong>Corrections:</strong> Uncollected, voided, canceled, or refunded revenue does not earn commission.
            Renewals and add-on work do not earn a new commission unless the owner changes the settings.
          </span>
        </div>
      </section>

      {settings.mode === "team" && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Commission Plan</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {commissionPlanWording(settings).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </section>
      )}

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>Commission Summary — Accepted Bids</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="portal-card" style={{ minHeight: 0, padding: "14px 18px", flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 800 }}>
              PROJECTED MONTHLY (SALESPERSON-GENERATED)
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--brand-deep)" }}>
              {formatMoney(projectedSpMonthly)}
            </div>
          </div>
          <div className="portal-card" style={{ minHeight: 0, padding: "14px 18px", flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 800 }}>
              PROJECTED MONTHLY (COMPANY-GENERATED)
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--brand-deep)" }}>
              {formatMoney(projectedCoMonthly)}
            </div>
          </div>
          <div className="portal-card" style={{ minHeight: 0, padding: "14px 18px", flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 800 }}>
              OVER {settings.payoutMonths} MONTHS (SP / CO)
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "var(--brand-deep)" }}>
              {formatMoney(projectedSpMonthly * settings.payoutMonths)} /{" "}
              {formatMoney(projectedCoMonthly * settings.payoutMonths)}
            </div>
          </div>
        </div>
        {bidsLoading ? (
          <p style={{ color: "var(--muted)" }}>Loading accepted bids…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No accepted bids are available for commission calculation yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {rows.map(({ bid, monthlyRevenue, spMonthly, coMonthly }) => (
              <div
                key={bid.id}
                className="portal-card"
                style={{ minHeight: 0, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong>{bid.title}</strong>
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                    {bid.client_name} · {formatMoney(monthlyRevenue)}/mo collected revenue basis
                  </div>
                </div>
                <span style={{ fontSize: "0.9rem" }}>
                  SP {formatMoney(spMonthly)}/mo · CO {formatMoney(coMonthly)}/mo
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>Commission Modeler</h3>
        <CommissionModeler settings={settings} />
      </section>

      {ownerCalculator && <WageBonusModeler />}
    </div>
  );
}
