// Per-state cleaning rate GUIDANCE (reference figures only — never defaults).
//
// Sources: US national baselines from ~/workspace/per-state-pricing/research-data.json
// (per_hour: $25–$50–$75, HispanosEmprendedores 2026 + AllBetterApp 2026;
//  per_sqft: $0.15–$0.20–$0.30, HispanosEmprendedores 2026 + AllBetterApp 2026 +
//  GetWeCycle). Vintage: BEA Regional Price Parities, 2024 reference year,
// released February 19, 2026 (BEA 26-10).
//
// Per-state range = national baseline × (state RPP / 100). RPP is an all-items
// price-level index (US = 100), so this is a rough adjustment for local price
// levels, not a survey of what cleaners actually charge in that state.
//
// Every figure this module produces is labeled "reference". Nothing here ever
// writes into a bid/pricing form — the company's own entered rates always win.

export const REFERENCE_NOTICE =
  "These ranges are reference market pricing only, adjusted from US national figures by each state's price level. Your local market will differ. Your own entered rates always take priority — nothing here fills your fields for you.";

export const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export const US_STATES = Object.keys(STATE_NAMES)
  .sort()
  .map((code) => ({ code, name: STATE_NAMES[code] }));

// BEA Regional Price Parities (2024 reference year), all-items index, US = 100.
export const STATE_RPP = {
  AK: 102.4, AL: 88.8, AR: 86.9, AZ: 100.7, CA: 110.7, CO: 103.1, CT: 103.6,
  DC: 109.9, DE: 99.8, FL: 103.4, GA: 96.3, HI: 110.0, IA: 87.8, ID: 95.5,
  IL: 100.0, IN: 93.3, KS: 90.1, KY: 90.2, LA: 88.2, MA: 105.8, MD: 105.0,
  ME: 97.1, MI: 96.2, MN: 98.6, MO: 90.8, MS: 87.0, MT: 94.6, NC: 94.3,
  ND: 89.0, NE: 90.1, NH: 104.2, NJ: 108.8, NM: 92.2, NV: 100.0, NY: 107.9,
  OH: 92.8, OK: 87.8, OR: 103.4, PA: 97.6, RI: 102.3, SC: 93.8, SD: 88.6,
  TN: 91.9, TX: 97.1, UT: 98.9, VA: 101.1, VT: 98.0, WA: 107.0, WI: 94.1,
  WV: 89.5, WY: 92.7,
};

// National cleaning baselines (2025–2026 US national cost guides; see sources above).
const BASELINES = {
  hour: { low: 25, typical: 50, high: 75, unit: "/hr" },
  sqft: { low: 0.15, typical: 0.2, high: 0.3, unit: "/sq ft" },
};

function formatRate(kind, value) {
  if (kind === "hour") return "$" + Math.round(value); // whole dollars
  return "$" + (Math.round(value * 100) / 100).toFixed(2); // keep cents
}

/**
 * State-adjusted cleaning rate guidance.
 *
 * @param {string|null} stateCode 2-letter state code from companies.state; may be null/unset.
 * @param {"hour"|"sqft"} kind which rate kind to describe.
 * @returns {{kind, stateCode, stateName, isNational, low, typical, high, unit, notice}}
 *   All figures are strings like "$23"/"$0.18" — every one is a reference figure.
 */
export function getCleaningRateGuidance(stateCode, kind) {
  const base = kind === "sqft" ? BASELINES.sqft : BASELINES.hour;
  const code = String(stateCode || "").toUpperCase();
  const rpp = STATE_RPP[code];
  const factor = rpp != null ? rpp / 100 : 1;
  const scale = (v) => formatRate(kind, v * factor);
  return {
    kind,
    stateCode: rpp != null ? code : null,
    stateName: rpp != null ? STATE_NAMES[code] : null,
    isNational: rpp == null,
    low: scale(base.low),
    typical: scale(base.typical),
    high: scale(base.high),
    unit: base.unit,
    notice: REFERENCE_NOTICE,
  };
}

/**
 * Fetch a company's state tolerantly.
 *
 * Deliberately does NOT rely on the app layout's company query: it selects
 * columns explicitly (no `state` until the migration is run), so this separate
 * query returns null when the column is missing/unset instead of breaking
 * anything. Safe to call before and after the migration.
 *
 * @returns {Promise<string|null>} 2-letter state code, or null if unset or unknown.
 */
export async function fetchCompanyState(sb, companyId) {
  try {
    const { data, error } = await sb
      .from("companies")
      .select("state")
      .eq("id", companyId)
      .single();
    if (error || !data) return null;
    const code = String(data.state || "").toUpperCase();
    return STATE_RPP[code] != null ? code : null;
  } catch {
    return null;
  }
}

/**
 * One-line reference text for display next to a rate input.
 * e.g. "📊 Reference: $23–$68/hr in Missouri (typical $45/hr) — reference only."
 */
export function guidanceLine(stateCode, kind) {
  const g = getCleaningRateGuidance(stateCode, kind);
  const where = g.isNational
    ? "US national reference market rates"
    : `reference market rates for ${g.stateName}`;
  return `📊 ${g.isNational ? "US national reference" : "Reference"} market rates${g.isNational ? "" : ` for ${g.stateName}`}: ${g.low}–${g.high}${g.unit} (typical ${g.typical}${g.unit}) — reference only; your own rate always wins.`;
}
