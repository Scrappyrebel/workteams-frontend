// Shared schedule-time matching for WorkTeams clock-in and attendance alerts.
// All times are interpreted in America/Chicago, regardless of device time zone.
// The clock-in endpoint additionally filters member/company/location in SQL.
function offsetMinutesAt(date, timeZone) {
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone, timeZoneName: "longOffset",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).find((x) => x.type === "timeZoneName")?.value || "GMT+00:00";
  const match = zone.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

export function localShiftToUtc(dateText, timeText, timeZone = "America/Chicago") {
  const [y, m, d] = String(dateText).split("-").map(Number);
  const [hour, minute, second = 0] = String(timeText).split(":").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, hour, minute, second));
  let utc = new Date(probe.getTime() - offsetMinutesAt(probe, timeZone) * 60000);
  // Correct the offset if the shift crosses a daylight-saving transition.
  const correctedOffset = offsetMinutesAt(utc, timeZone);
  if (correctedOffset !== offsetMinutesAt(probe, timeZone)) {
    utc = new Date(probe.getTime() - correctedOffset * 60000);
  }
  return utc;
}

export function shiftBounds(shift) {
  const start = localShiftToUtc(shift.shift_date, shift.start_time);
  let endDate = shift.shift_date;
  if (String(shift.end_time) <= String(shift.start_time)) {
    const [y, m, d] = shift.shift_date.split("-").map(Number);
    endDate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
  const end = localShiftToUtc(endDate, shift.end_time || shift.start_time);
  return { start, end };
}

// Only an eligible shift belonging to the signed-in member and selected
// location (scoped by clock-in API) may be chosen. Never pick the first
// shift of the calendar day when a closer one is scheduled at the same site.
export function chooseAssignedShift(shifts, atTime, usedShiftIds = new Set()) {
  const now = new Date(atTime).getTime();
  const earlyMs = 60 * 60_000;
  const lateMs = 30 * 60_000;
  const eligible = (shifts || []).filter((shift) => {
    if (!shift.start_time || !shift.end_time) return false;
    const { start, end } = shiftBounds(shift);
    return now >= start.getTime() - earlyMs && now <= end.getTime() + lateMs;
  }).sort((a, b) => {
    const aUsed = usedShiftIds.has(a.id) ? 1 : 0;
    const bUsed = usedShiftIds.has(b.id) ? 1 : 0;
    if (aUsed !== bUsed) return aUsed - bUsed;
    const aDelta = Math.abs(now - shiftBounds(a).start.getTime());
    const bDelta = Math.abs(now - shiftBounds(b).start.getTime());
    return aDelta - bDelta || String(a.id).localeCompare(String(b.id));
  });
  return eligible[0] || null;
}

// An employee can already have clocked OUT before the five-minute attendance
// cron runs. Shift_id may also be wrong in older records due to prior "first
// shift today" matching. An actual time entry for this employee at this site
// overlapping this shift is evidence of attendance even if shift_id was wrong.
export function hasShiftAttendance(shift, entries, asOf) {
  const { start, end } = shiftBounds(shift);
  const now = new Date(asOf).getTime();
  // A completed visit that ENDED well before this shift's start is not
  // attendance for a later shift at the same site. Five minutes allows a
  // genuinely early finishing hand-off, not an earlier unrelated visit.
  const minimumFinish = start.getTime() - 5 * 60_000;
  const windowEnd = end.getTime() + 15 * 60_000;
  return (entries || []).some((entry) => {
    if (entry.company_id !== shift.company_id ||
        entry.member_id !== shift.member_id ||
        entry.location_id !== shift.location_id) return false;
    const begun = new Date(entry.clock_in).getTime();
    const finished = entry.clock_out ? new Date(entry.clock_out).getTime() : now;
    if (!Number.isFinite(begun) || !Number.isFinite(finished) ||
        begun > now || finished < begun) return false;
    return begun <= windowEnd && finished >= minimumFinish;
  });
}
