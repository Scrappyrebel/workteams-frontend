// Settings depth (D-WT-40): pure helpers for the read-only
// "Your company at a glance" panel on the Settings page.
//
// Everything rendered comes from the company record the
// company layout ALREADY loads into context (tier,
// subscription_status, is_complimentary, created_at are in
// every fallback branch of the layout's tolerant company
// read, and all four are inside the browser-role column
// grants), plus the three settings this page edits. Nothing
// here invents a value: absent fields produce nulls and the
// panel omits the line instead of guessing.
import { TIERS } from "./tiers";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2026-10-05T14:22:00Z" -> "October 2026" (UTC, calendar-safe).
export function monthYearLabel(iso) {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
}

// The company's recorded plan standing, for display only.
// statusText is null when no status is recorded; the raw
// status string is shown as-is rather than reinterpreted.
export function planStanding(company) {
  const c = company || {};
  const tierDef = c.tier ? TIERS[c.tier] : null;
  return {
    tierName: tierDef ? tierDef.name : c.tier || null,
    statusText: c.subscription_status || null,
    complimentary: c.is_complimentary === true,
    sinceLabel: monthYearLabel(c.created_at),
  };
}

// Completeness of the three settings THIS page owns.
// State counts only when its column actually exists in this
// workspace (hasStateColumn): before the column, state is
// reported as unavailable — never as missing, never as set.
export function settingsCompleteness(input) {
  const { name, timezone, state, hasStateColumn } = input || {};
  const missing = [];
  if (!name || !String(name).trim()) missing.push("Company name");
  if (!timezone) missing.push("Time zone");
  let total = 2;
  if (hasStateColumn) {
    total = 3;
    if (!state) missing.push("State");
  }
  return {
    filled: total - missing.length,
    total,
    missing,
    stateUnavailable: !hasStateColumn,
  };
}
