// Per-company sales commission / bonus settings (WorkTeams).
//
// Source of truth (once Wendy runs migration 052) is the
// `company_commission_settings` table. Every read in the app MUST go
// through `loadCommissionSettings` (or the client hook built on it),
// which tolerates the table being absent and falls back to
// mode "off" + the documented defaults. Nobody is locked out before
// the migration runs, and no rate is hard-coded in UI copy:
// employee-visible plan wording is generated from these settings.
//
// WorkTeams membership shape: a `company_members` row
// ({ role: 'owner' | 'admin' | 'supervisor' | 'employee', ... }).
// The UI calls `admin` "Manager". Bids & proposals — the sales area
// this tool belongs to — are manager-and-up surfaces, so in 'team'
// mode "salespeople" here means managers and the owner.

export const DEFAULT_COMMISSION_SETTINGS = {
  mode: "off",
  salespersonRatePercent: 8.5,
  companyRatePercent: 4.25,
  payoutMonths: 12,
  flatMonthlyAmount: null,
};

/** The app's existing owner detection: the company owner role. */
export function isCompanyOwner(member) {
  if (!member) return false;
  return member.role === "owner";
}

/** Managers and up: owner + admin (shown as "Manager" in the UI). */
export function isCompanyManagement(member) {
  if (!member) return false;
  return member.role === "owner" || member.role === "admin" || member.role === "manager";
}

/**
 * Who may see commission surfaces at all:
 * - off: nobody, not even the owner.
 * - owner: only the company owner.
 * - team: managers and up (the roles that can already see bids).
 */
export function canViewCommission(settings, member) {
  if (!settings || settings.mode === "off") return false;
  if (settings.mode === "owner") return isCompanyOwner(member);
  return isCompanyManagement(member);
}

/** Owner-only calculators (commission modeler + wage-% bonus modeler). */
export function canUseOwnerCalculator(settings, member) {
  return !!settings && settings.mode !== "off" && isCompanyOwner(member);
}

export function normalizeCommissionSettings(row) {
  if (!row) return { ...DEFAULT_COMMISSION_SETTINGS };
  const mode = row.commission_mode === "owner" || row.commission_mode === "team" ? row.commission_mode : "off";
  const pct = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
  };
  const monthsRaw = Number(row.payout_months);
  const flatRaw = row.flat_monthly_amount;
  const flat = flatRaw === null || flatRaw === undefined || flatRaw === "" ? null : Number(flatRaw);
  return {
    mode,
    salespersonRatePercent: pct(row.salesperson_rate_percent, DEFAULT_COMMISSION_SETTINGS.salespersonRatePercent),
    companyRatePercent: pct(row.company_rate_percent, DEFAULT_COMMISSION_SETTINGS.companyRatePercent),
    payoutMonths: Number.isFinite(monthsRaw) && monthsRaw >= 1 && monthsRaw <= 120 ? Math.round(monthsRaw) : 12,
    flatMonthlyAmount: flat !== null && Number.isFinite(flat) && flat >= 0 ? flat : null,
  };
}

/**
 * Tolerant loader: works with the browser Supabase client from
 * lib/supabase.js. Any error (table missing before migration 052,
 * RLS, network) resolves to mode "off" + defaults.
 */
export async function loadCommissionSettings(sb, companyId) {
  if (!sb || !companyId) return { ...DEFAULT_COMMISSION_SETTINGS };
  try {
    const { data, error } = await sb
      .from("company_commission_settings")
      .select("commission_mode,salesperson_rate_percent,company_rate_percent,payout_months,flat_monthly_amount")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_COMMISSION_SETTINGS };
    return normalizeCommissionSettings(data);
  } catch {
    return { ...DEFAULT_COMMISSION_SETTINGS };
  }
}

export function commissionRateFraction(settings, source) {
  if (source === "salesperson_generated") return settings.salespersonRatePercent / 100;
  if (source === "company_generated") return settings.companyRatePercent / 100;
  return 0;
}

/** Monthly commission for one account, honouring the flat alternative. */
export function monthlyCommission(settings, source, monthlyCollectedRevenue) {
  const rate = commissionRateFraction(settings, source);
  if (rate <= 0) return 0;
  if (settings.flatMonthlyAmount !== null) return settings.flatMonthlyAmount;
  return Number(monthlyCollectedRevenue || 0) * rate;
}

export const formatPercent = (percent) =>
  `${Number(percent).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

export const formatMoney = (n) =>
  Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

/**
 * Employee-visible plan wording, GENERATED from the owner's settings.
 * Never replace this with hard-coded rate strings.
 */
export function commissionPlanWording(settings) {
  if (settings.flatMonthlyAmount !== null) {
    return [
      `Salesperson-generated business earns a flat ${formatMoney(settings.flatMonthlyAmount)} per month under the current company plan.`,
      `Company-generated business assigned to the salesperson earns the same flat monthly amount under the current company plan.`,
      `Commission is paid over the first ${settings.payoutMonths} service months and is not earned on uncollected revenue or canceled months.`,
      "Renewals and add-on work do not earn a new commission unless the company changes the plan in writing.",
    ];
  }
  return [
    `Salesperson-generated business earns ${formatPercent(settings.salespersonRatePercent)} commission under the current company plan.`,
    `Company-generated business assigned to the salesperson earns ${formatPercent(settings.companyRatePercent)} under the current company plan.`,
    `Commission is paid over the first ${settings.payoutMonths} service months and is not earned on uncollected revenue or canceled months.`,
    "Renewals and add-on work do not earn a new commission unless the company changes the plan in writing.",
  ];
}
