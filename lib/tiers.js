// Original tier definitions for WorkTeams. Example prices only — the owner sets real pricing.
export const TIERS = {
  starter: {
    name: "Starter",
    tagline: "Get your crew scheduled and your hours counted.",
    examplePrice: 30,
    features: [
      "Locations",
      "Scheduling",
      "GPS time clock",
      "Payroll-ready hour reports",
      "Late & no-show alerts",
    ],
  },
  plus: {
    name: "Plus",
    tagline: "Add quality checks and team communication.",
    examplePrice: 150,
    features: [
      "Everything in Starter",
      "Inspections with photos",
      "Crew messaging",
      "Geofenced clock-in",
    ],
  },
  pro: {
    name: "Pro",
    tagline: "Run the whole business — from bid to paid invoice.",
    examplePrice: 225,
    features: [
      "Everything in Plus",
      "Bids & proposals",
      "Room-by-room walkthroughs",
      "Work orders",
      "Supply tracking",
      "Client portal",
      "Job profitability",
      "Payroll provider + QuickBooks connections",
    ],
  },
};

export const tierRank = { starter: 0, plus: 1, pro: 2 };

// Which tier unlocks each feature group.
export const featureTier = {
  locations: "starter",
  scheduling: "starter",
  timeclock: "starter",
  payroll: "starter",
  alerts: "starter",
  plans: "starter",
  connections: "starter",
  inspections: "plus",
  messaging: "plus",
  geofencing: "plus",
  bidding: "pro",
  walkthroughs: "pro",
  workorders: "pro",
  supplies: "pro",
  portal: "pro",
  profitability: "pro",
};

export function canUse(companyTier, featureKey) {
  const required = featureTier[featureKey] || "starter";
  const have = tierRank[companyTier] ?? 0;
  return have >= tierRank[required];
}

export function tierLabel(tier) {
  return TIERS[tier] ? TIERS[tier].name : "Starter";
}

// Paid entitlement derived from the trusted subscription record, not from
// the tier label alone. `tier` can only be changed by the billing webhook /
// service role (database trigger blocks client writes), and
// `subscription_status` is written by the Stripe webhook from live Stripe
// state. A company whose subscription lapses loses paid features even if
// the tier label has not been downgraded yet.
//
// Rules (mirrored by company_tier_meets() in the database, which enforces
// the same rule in RLS so the UI and the DB can never disagree):
//   - starter tier            -> starter (nothing paid to grant)
//   - is_complimentary        -> trust the tier (owner-granted, e.g. the
//                                product owner's own company; only the
//                                service role can set this flag)
//   - active / trialing       -> paid tier applies
//   - past_due, unpaid, canceled, incomplete, incomplete_expired,
//     paused, none, anything else -> starter (no paid access)
export const PAID_SUBSCRIPTION_STATUSES = ["active", "trialing"];

export function entitledTier(company) {
  if (!company) return "starter";
  const tier = company.tier || "starter";
  if (tier !== "plus" && tier !== "pro") return "starter";
  if (company.is_complimentary) return tier;
  return PAID_SUBSCRIPTION_STATUSES.includes(company.subscription_status) ? tier : "starter";
}
