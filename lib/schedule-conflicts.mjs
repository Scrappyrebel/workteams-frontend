// Schedule conflict warnings for the manager Schedule page (D-WT-12).
//
// Pure helpers, computed entirely from shifts the page has ALREADY
// loaded — no new reads, no writes, no behaviour change. The warnings
// are advisory only: creating or saving a shift works exactly as it
// always has, warning or not. Whether a warning should ever BLOCK a
// save is a separate product decision (Workforce's scheduler blocks;
// WorkTeams' never has, and this module does not change that).
//
// Time model: a shift's times are minutes since midnight on its own
// shift_date. An end at or before the start means the shift runs past
// midnight (the same reading lib/attendance-shifts.mjs shiftBounds
// uses), so its interval extends beyond 1440 and it also occupies the
// early hours of the NEXT date. Back-to-back shifts (one ends exactly
// when the next starts) do NOT overlap.

// "17:30" | "17:30:00" | "7:05" -> minutes since midnight, or null.
export function timeToMinutes(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(mins) ? mins : null;
}

// Interval [start, end) in minutes for one shift row, with an
// overnight end rolled past 1440. Null when times are unreadable.
export function shiftInterval(row) {
  const start = timeToMinutes(row?.start_time);
  const rawEnd = timeToMinutes(row?.end_time);
  if (start == null || rawEnd == null) return null;
  return { start, end: rawEnd <= start ? rawEnd + 1440 : rawEnd };
}

// Whole days between two "YYYY-MM-DD" dates (b - a), or null.
function dayDiff(aISO, bISO) {
  const pa = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(aISO || ""));
  const pb = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(bISO || ""));
  if (!pa || !pb) return null;
  const a = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const b = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.round((b - a) / 86400000);
}

// Do a candidate shift and an existing shift overlap in absolute time?
// Both are placed on a timeline anchored at the CANDIDATE's date, so an
// overnight shift from the day before (or the candidate running into
// the next day) is compared correctly.
export function shiftsConflict(candidate, existing) {
  if (!candidate?.member_id || !existing?.member_id) return false;
  if (candidate.member_id !== existing.member_id) return false;
  const ci = shiftInterval(candidate);
  if (!ci) return false;
  const offset = dayDiff(candidate.shift_date, existing.shift_date);
  if (offset == null || offset < -1 || offset > 1) return false;
  const ei = shiftInterval(existing);
  if (!ei) return false;
  const eStart = ei.start + offset * 1440;
  const eEnd = ei.end + offset * 1440;
  return ci.start < eEnd && eStart < ci.end;
}

// Every conflict between prepared candidate rows (a create's rows, or
// one edited shift) and the shifts already loaded on the page.
// Options: excludeIds (e.g. the shift being edited), excludeSeriesId
// (a series edit rewrites its own future rows, so they are not
// conflicts with themselves). One entry per (candidate, existing) pair.
export function findScheduleConflicts(candidates, existingShifts, options = {}) {
  const excludeIds = new Set(options.excludeIds || []);
  const excludeSeriesId = options.excludeSeriesId || null;
  const out = [];
  for (const candidate of candidates || []) {
    if (!candidate?.member_id) continue;
    for (const existing of existingShifts || []) {
      if (!existing?.id && !existing?.member_id) continue;
      if (existing.id && excludeIds.has(existing.id)) continue;
      if (excludeSeriesId && existing.series_id && existing.series_id === excludeSeriesId) continue;
      // A candidate never conflicts with itself (same stored row).
      if (candidate.id && existing.id && candidate.id === existing.id) continue;
      if (shiftsConflict(candidate, existing)) {
        out.push({ candidate, existing });
      }
    }
  }
  return out;
}

// Approved time off (already loaded on the page from
// schedule_requests) covering a candidate row's date, for the same
// member. Range is inclusive on both ends, as approved time off is
// stored.
export function findTimeOffConflicts(candidates, approvedOff) {
  const out = [];
  for (const candidate of candidates || []) {
    if (!candidate?.member_id || !candidate?.shift_date) continue;
    for (const off of approvedOff || []) {
      if (off.member_id !== candidate.member_id) continue;
      if (off.start_date && off.end_date && candidate.shift_date >= off.start_date && candidate.shift_date <= off.end_date) {
        out.push({ candidate, off });
      }
    }
  }
  return out;
}

// Coverage counts for one loaded week of shifts: how many shifts,
// how many are assigned, how many are still open (nobody assigned),
// how many different people are scheduled, and the total scheduled
// hours (overnight-aware duration sum). Display-only summary.
export function summarizeWeekCoverage(weekShifts) {
  const rows = weekShifts || [];
  let assigned = 0;
  let minutes = 0;
  const people = new Set();
  for (const s of rows) {
    if (s.member_id) {
      assigned += 1;
      people.add(s.member_id);
    }
    const iv = shiftInterval(s);
    if (iv) minutes += iv.end - iv.start;
  }
  return {
    total: rows.length,
    assigned,
    open: rows.length - assigned,
    people: people.size,
    hours: Math.round((minutes / 60) * 10) / 10,
  };
}
