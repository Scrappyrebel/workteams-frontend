// Shared effective pay-rate resolution for a time entry.
//
// ONE chain, used by both the Payroll report and Job Profitability, so the
// two surfaces can never disagree about what an hour of labor cost (they
// did: Profitability read only the legacy hourly_rate column, which the
// dual-rate Team editor no longer maintains, pricing labor at $0/stale).
//
// Resolution order — exactly the chain the Payroll report has always used:
//   1. the rate snapshotted onto the entry at clock-in (pay_rate_applied)
//   2. the member's current rate for the hat they clocked in under
//      (manager_hourly_rate / cleaner_hourly_rate, migration 028)
//   3. the member's legacy single rate (hourly_rate, pre-028)
//   4. 0 when no rate is set anywhere
//
// `payRow` is the member's member_pay row (or undefined when none exists).

// The member_pay columns every rate consumer must select, kept next to the
// chain so selects cannot drift from the resolution again.
export const MEMBER_PAY_RATE_COLUMNS =
  "member_id, cleaner_hourly_rate, manager_hourly_rate, hourly_rate";

export function resolveEntryPayRate(entry, payRow) {
  const hat = entry?.clock_in_role === "manager" ? "manager" : "cleaner";
  const rate =
    entry?.pay_rate_applied ??
    payRow?.[hat === "manager" ? "manager_hourly_rate" : "cleaner_hourly_rate"] ??
    payRow?.hourly_rate ??
    0;
  return Number(rate) || 0;
}
