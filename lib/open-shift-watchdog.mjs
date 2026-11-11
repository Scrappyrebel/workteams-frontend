// Open-shift watchdog — pure decision logic for the cron sweep in
// app/api/cron/open-shift-watchdog/route.js. No I/O here: the route feeds
// timestamps in, this module decides alert stage / auto-close, and
// scripts/check-open-shift-watchdog.mjs rehearses the decisions.
//
// Why this exists (Nov 8, 2026): an employee's clock-out never reached the
// server and her shift ran 56.16 hours. The older attendance cron sends ONE
// overtime alert, only for shift-linked entries, only 15 min–12 h past the
// scheduled end, deduped forever — then silence. This watchdog is the safety
// net behind the punch-delivery guarantee: alerts that REPEAT and WIDEN on a
// stage schedule, for linked AND unlinked entries, plus a hard auto-close
// backstop so no shift can run for days unnoticed.
//
// Stage model (linked shift, minutes past scheduled end):
//   stage 0  < 30 min           — nothing yet
//   stage 1  30–119 min         — employee push reminder + owner alert
//   stage 2  120–359 min        — owner alert again
//   stage n  every +240 min     — owner alert keeps repeating until close/cap
// Unlinked entries have no scheduled end, so they stage on age open:
//   stage 0  < 240 min open     — nothing yet
//   stage 1  240–479 min open   — employee push reminder + owner alert
//   stage n  every +240 min     — owner alert keeps repeating until close/cap
// Each stage fires exactly once because the route dedupes on
// `open-shift:<entryId>:s<stage>`; because the stage NUMBER keeps growing,
// the alerts repeat forever instead of firing once and going silent.
//
// Auto-close cap: 16 hours after clock-in, or 12 hours past the scheduled
// end when a shift is linked — whichever comes FIRST. The entry is closed
// AT the cap time (never "now"), so the recorded hours are the capped
// hours, and the entry's notes gain the AUTO_CLOSE_FLAG text so it can
// never masquerade as a real employee clock-out.

export const WATCHDOG_CAP_AFTER_CLOCK_IN_MIN = 16 * 60;
export const WATCHDOG_CAP_AFTER_SCHEDULED_END_MIN = 12 * 60;
export const WATCHDOG_FIRST_ALERT_PAST_END_MIN = 30;
export const WATCHDOG_SECOND_ALERT_PAST_END_MIN = 120;
export const WATCHDOG_REPEAT_EVERY_MIN = 240;
export const WATCHDOG_UNLINKED_FIRST_ALERT_OPEN_MIN = 240;

export const AUTO_CLOSE_FLAG = "AUTO-CLOSED BY WATCHDOG — NEEDS REVIEW";

const MIN = 60000;

export function stageForOverdueMinutes(overdueMin) {
  if (overdueMin < WATCHDOG_FIRST_ALERT_PAST_END_MIN) return 0;
  if (overdueMin < WATCHDOG_SECOND_ALERT_PAST_END_MIN) return 1;
  return 2 + Math.floor((overdueMin - WATCHDOG_SECOND_ALERT_PAST_END_MIN) / WATCHDOG_REPEAT_EVERY_MIN);
}

export function stageForOpenMinutes(openMin) {
  if (openMin < WATCHDOG_UNLINKED_FIRST_ALERT_OPEN_MIN) return 0;
  return 1 + Math.floor((openMin - WATCHDOG_UNLINKED_FIRST_ALERT_OPEN_MIN) / WATCHDOG_REPEAT_EVERY_MIN);
}

// The hard cap for one open entry, in epoch ms. Pure function of the
// clock-in time and (when known) the scheduled end.
export function capAtMs({ clockInMs, scheduledEndMs = null }) {
  let cap = clockInMs + WATCHDOG_CAP_AFTER_CLOCK_IN_MIN * MIN;
  if (scheduledEndMs) {
    cap = Math.min(cap, scheduledEndMs + WATCHDOG_CAP_AFTER_SCHEDULED_END_MIN * MIN);
  }
  return cap;
}

// Decide what the sweep should do with one open entry right now.
// Returns { state: "ok" | "alert" | "autoclose", stage, capAtMs,
//           overdueMinutes (null when unlinked), openMinutes }.
export function watchdogPlan({ clockInMs, scheduledEndMs = null, nowMs }) {
  const cap = capAtMs({ clockInMs, scheduledEndMs });
  const openMinutes = Math.floor((nowMs - clockInMs) / MIN);
  if (nowMs >= cap) {
    return {
      state: "autoclose",
      stage: null,
      capAtMs: cap,
      overdueMinutes: scheduledEndMs ? Math.floor((nowMs - scheduledEndMs) / MIN) : null,
      openMinutes,
    };
  }
  if (scheduledEndMs) {
    const overdueMinutes = Math.floor((nowMs - scheduledEndMs) / MIN);
    const stage = stageForOverdueMinutes(overdueMinutes);
    return { state: stage > 0 ? "alert" : "ok", stage, capAtMs: cap, overdueMinutes, openMinutes };
  }
  const stage = stageForOpenMinutes(openMinutes);
  return { state: stage > 0 ? "alert" : "ok", stage, capAtMs: cap, overdueMinutes: null, openMinutes };
}

export function stageDedupeKey(entryId, stage) {
  return `open-shift:${entryId}:s${stage}`;
}

export function autoCloseDedupeKey(entryId) {
  return `open-shift:${entryId}:autoclosed`;
}

// The audit note written onto the entry when the watchdog closes it, in the
// same plain style as the manager-clock notes ("Unscheduled clock-in
// APPROVED by …", "Clocked out by …"). It leads with the flag so any list,
// export, or payroll read that shows notes shows this FIRST.
export function autoCloseNote(existingNotes, { capAt, clockIn }) {
  const hours = ((capAt.getTime() - clockIn.getTime()) / 3600000).toFixed(2);
  const flag =
    `${AUTO_CLOSE_FLAG}: no clock-out was recorded for this shift, so the ` +
    `watchdog closed it at the safety cap (${capAt.toISOString()}) after ` +
    `${hours} hours open. This is NOT an employee clock-out — a manager ` +
    `must review and correct these hours before payroll.`;
  const prior = typeof existingNotes === "string" ? existingNotes.trim() : "";
  return prior ? `${prior}\n${flag}` : flag;
}

// Human phrasing for alert bodies.
export function overdueText(plan) {
  if (plan.overdueMinutes != null) {
    const m = plan.overdueMinutes;
    if (m < 60) return `${m} minutes past the scheduled end`;
    return `${(m / 60).toFixed(1)} hours past the scheduled end`;
  }
  const m = plan.openMinutes;
  if (m < 60) return `open for ${m} minutes with no schedule on file`;
  return `open for ${(m / 60).toFixed(1)} hours with no schedule on file`;
}
