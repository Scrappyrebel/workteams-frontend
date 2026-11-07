// Per-state pricing data layer for the temp staffing service.
//
// WHY THIS EXISTS: the temp service sells nationally, and the numbers
// under a temp quote — minimum wage, unemployment insurance, workers'
// comp — are set by the state where the temp works. Pricing a job in
// another state off Missouri's numbers would be wrong, and wrong
// numbers are a lawsuit waiting to happen. So every state has its own
// row, and a state is either VERIFIED (figures researched, dated, and
// reviewed) or it is UNVERIFIED and the estimator refuses to price
// from it. There is deliberately NO fallback to Missouri.
//
// Missouri is state #1 of 50, verified 2026-11-07 from the Missouri
// staffing legal research (Missouri Dept. of Labor / DES published
// figures). The workers' comp figures are Missouri assigned-risk
// (ARM Plan) benchmarks per $100 of payroll — a public yardstick, not
// a quote; a real carrier rate is set per account. Refresh cadence:
// re-verify each verified state at least every 6 months and whenever
// a state announces a rate change.

const MO = {
  code: "MO",
  name: "Missouri",
  verified: true,
  verifiedOn: "2026-11-07",
  source:
    "Missouri Dept. of Labor (DES tax rates; Division of Workers' Compensation) — researched 2026-11-07",
  minWage: 15.0, // §290.502 RSMo, effective 2026-01-01
  minWageEffective: "2026-01-01",
  uiNewEmployerRate: 2.376, // percent, new-employer rate 2026
  uiWageBase: 9000, // first $9,000 of wages per worker per year
  // Workers' comp benchmark per $100 of payroll (assigned-risk, 2026).
  compPer100: { clerical: 0.2, janitorial: 3.31, machineShop: 5.09 },
  compNote:
    "Assigned-risk benchmarks. Factory is not one rate — price by the actual job's class code; never default factory work to the clerical rate.",
  finalPayDischarged:
    "Due the day of discharge (Mo. Rev. Stat. § 290.110); unpaid wages keep accruing as a penalty if not paid within 7 days of written demand.",
  paySchedule: "At least semimonthly, within 16 days of the pay period (§ 290.080).",
};

function unverified(code, name) {
  return {
    code,
    name,
    verified: false,
    verifiedOn: null,
    source: null,
    minWage: null,
    minWageEffective: null,
    uiNewEmployerRate: null,
    uiWageBase: null,
    compPer100: null,
    compNote: null,
    finalPayDischarged: null,
    paySchedule: null,
  };
}

export const STATE_PRICING = [
  MO,
  unverified("AL", "Alabama"),
  unverified("AK", "Alaska"),
  unverified("AZ", "Arizona"),
  unverified("AR", "Arkansas"),
  unverified("CA", "California"),
  unverified("CO", "Colorado"),
  unverified("CT", "Connecticut"),
  unverified("DE", "Delaware"),
  unverified("FL", "Florida"),
  unverified("GA", "Georgia"),
  unverified("HI", "Hawaii"),
  unverified("ID", "Idaho"),
  unverified("IL", "Illinois"),
  unverified("IN", "Indiana"),
  unverified("IA", "Iowa"),
  unverified("KS", "Kansas"),
  unverified("KY", "Kentucky"),
  unverified("LA", "Louisiana"),
  unverified("ME", "Maine"),
  unverified("MD", "Maryland"),
  unverified("MA", "Massachusetts"),
  unverified("MI", "Michigan"),
  unverified("MN", "Minnesota"),
  unverified("MS", "Mississippi"),
  unverified("MT", "Montana"),
  unverified("NE", "Nebraska"),
  unverified("NV", "Nevada"),
  unverified("NH", "New Hampshire"),
  unverified("NJ", "New Jersey"),
  unverified("NM", "New Mexico"),
  unverified("NY", "New York"),
  unverified("NC", "North Carolina"),
  unverified("ND", "North Dakota"),
  unverified("OH", "Ohio"),
  unverified("OK", "Oklahoma"),
  unverified("OR", "Oregon"),
  unverified("PA", "Pennsylvania"),
  unverified("RI", "Rhode Island"),
  unverified("SC", "South Carolina"),
  unverified("SD", "South Dakota"),
  unverified("TN", "Tennessee"),
  unverified("TX", "Texas"),
  unverified("UT", "Utah"),
  unverified("VT", "Vermont"),
  unverified("VA", "Virginia"),
  unverified("WA", "Washington"),
  unverified("WV", "West Virginia"),
  unverified("WI", "Wisconsin"),
  unverified("WY", "Wyoming"),
];

export const STATE_PRICING_BY_CODE = Object.fromEntries(
  STATE_PRICING.map((s) => [s.code, s])
);

export function getStatePricing(code) {
  return STATE_PRICING_BY_CODE[code] || null;
}

export const COMP_JOB_TYPES = [
  { key: "clerical", label: "Clerical / office" },
  { key: "janitorial", label: "Janitorial / cleaning" },
  { key: "machineShop", label: "Factory / machine shop" },
];

// Estimate a bill rate for ONE hour of temp work in a state.
// Returns { ok: true, ... } only for a VERIFIED state; for anything
// else { ok: false, reason: "unverified" } — callers must show the
// not-verified notice instead of a number. There is no code path
// here that borrows another state's figures.
export function estimateBillRate(code, { payRate, jobType, markupPct }) {
  const st = getStatePricing(code);
  if (!st) return { ok: false, reason: "unknown_state" };
  if (!st.verified) return { ok: false, reason: "unverified", state: st };
  const pay = parseFloat(payRate);
  const markup = parseFloat(markupPct);
  if (!Number.isFinite(pay) || pay <= 0) return { ok: false, reason: "bad_pay" };
  if (pay < st.minWage) {
    return { ok: false, reason: "below_min_wage", state: st, minWage: st.minWage };
  }
  if (!Number.isFinite(markup) || markup < 0) return { ok: false, reason: "bad_markup" };
  const compRate = st.compPer100?.[jobType];
  if (compRate == null) return { ok: false, reason: "bad_job_type", state: st };
  // Loaded cost per hour: pay + workers' comp on that pay. UI is an
  // annual per-worker figure (rate × first $wageBase of wages), so it
  // is reported alongside instead of smeared into the hourly rate.
  const compPerHour = pay * (compRate / 100);
  const loadedPerHour = pay + compPerHour;
  const billPerHour = loadedPerHour * (1 + markup / 100);
  const annualWagesAt40 = pay * 2080;
  const uiAnnualPerWorker =
    (st.uiNewEmployerRate / 100) * Math.min(annualWagesAt40, st.uiWageBase);
  return {
    ok: true,
    state: st,
    payPerHour: pay,
    compPerHour,
    loadedPerHour,
    billPerHour,
    uiAnnualPerWorker,
  };
}
