"use client";

import CommissionModeler from "./CommissionModeler";
import { useCommissionSettings } from "../lib/use-commission-settings";
import { formatMoney, formatPercent, monthlyCommission } from "../lib/commission";

/**
 * Estimate/bid commission card for the internal bid detail page.
 *
 * Gating (mirrors Business HQ's estimate commission card):
 * - mode 'off'   -> renders nothing, for any role.
 * - mode 'owner' -> renders only for the company owner.
 * - mode 'team'  -> managers and up see the projected commission.
 * This card lives ONLY on the internal, manager-gated bid page.
 * Client-facing bid/proposal views must never render it — commission
 * and bonus data never appear on client-facing documents.
 */
export default function BidCommissionCard({ monthlyRevenue }) {
  const { loading, settings, visible } = useCommissionSettings();
  if (loading || !visible) return null;

  const revenue = Number(monthlyRevenue) || 0;
  const spMonthly = monthlyCommission(settings, "salesperson_generated", revenue);
  const coMonthly = monthlyCommission(settings, "company_generated", revenue);

  return (
    <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
      <h3 style={{ marginTop: 0 }}>Commission on this bid (internal only)</h3>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Projected from this bid&apos;s monthly revenue of {formatMoney(revenue)}/mo, paid only on revenue actually
        collected over the first {settings.payoutMonths} service months. This never appears on the client-facing bid.
      </p>
      {settings.flatMonthlyAmount !== null ? (
        <p style={{ fontWeight: 700 }}>
          Flat plan: {formatMoney(settings.flatMonthlyAmount)} per month · {formatMoney(settings.flatMonthlyAmount * settings.payoutMonths)} over {settings.payoutMonths} months
        </p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0 }}>
            <strong>Salesperson-generated ({formatPercent(settings.salespersonRatePercent)}):</strong>{" "}
            {formatMoney(spMonthly)}/mo · {formatMoney(spMonthly * settings.payoutMonths)} over {settings.payoutMonths} months
          </p>
          <p style={{ margin: 0 }}>
            <strong>Company-generated ({formatPercent(settings.companyRatePercent)}):</strong>{" "}
            {formatMoney(coMonthly)}/mo · {formatMoney(coMonthly * settings.payoutMonths)} over {settings.payoutMonths} months
          </p>
        </div>
      )}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--brand-deep)" }}>
          Try different numbers
        </summary>
        <div style={{ marginTop: 12 }}>
          <CommissionModeler settings={settings} initialMonthlyRevenue={revenue || ""} />
        </div>
      </details>
    </section>
  );
}
