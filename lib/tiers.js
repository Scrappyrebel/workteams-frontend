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
  bidding: "pro",
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
