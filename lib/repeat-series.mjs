// Repeat-series read helpers for the Schedule — Repeats page (D-WT-13).
//
// WorkTeams stores no series record: migration 031 adds only
// shifts.series_id + shifts.recurrence_label, and a repeat materializes
// as ordinary shift rows sharing one series_id (see the Schedule page's
// buildOccurrences). Everything here is therefore DERIVED from the
// stored rows themselves — the pattern a series usually follows, how
// far apart its dates fall, which single dates were changed away from
// that usual pattern, and how much scheduled time the series holds.
// Nothing here writes, and nothing reads time entries or the clock:
// these are scheduled facts only, never worked facts. One later
// addition (owner ruling 2026-11-02): the Delete-series guard counter
// at the bottom works from id lists the page has already fetched —
// the helper itself still fetches nothing and writes nothing; it only
// counts ids it is handed.

// "HH:MM" / "HH:MM:SS" -> minutes after midnight, or null.
export function minutesOfDay(t) {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Scheduled length of one shift in minutes. An end earlier than the
// start is an overnight shift and wraps past midnight; an end equal to
// the start, or a missing time, has no derivable length (null).
export function shiftMinutes(row) {
  const start = minutesOfDay(row?.start_time);
  const end = minutesOfDay(row?.end_time);
  if (start === null || end === null || end === start) return null;
  return end > start ? end - start : end - start + 1440;
}

function parseDay(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

// Whole days from isoA to isoB (B - A), or null when either is unusable.
export function daysBetween(isoA, isoB) {
  if (!isoA || !isoB) return null;
  const a = parseDay(isoA);
  const b = parseDay(isoB);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

// The tuple a series "usually" follows: the most common combination of
// start/end time, location, person and working-as across its rows
// (ties resolve to the earliest row). Single-date edits in WorkTeams
// simply make one row differ — there is no exception record — so the
// usual pattern is the honest reference a changed date is measured
// against.
export function usualPattern(rows) {
  if (!rows || rows.length === 0) return null;
  const counts = new Map();
  let best = null;
  for (const r of rows) {
    const key = JSON.stringify([r.start_time || null, r.end_time || null, r.location_id || null, r.member_id || null, r.department || null]);
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    if (!best || n > best.count) best = { key, count: n, row: r };
  }
  return best ? best.row : null;
}

const FIELD_LABELS = {
  start_time: "time",
  end_time: "time",
  location_id: "place",
  member_id: "person",
  department: "working as",
  notes: "notes",
};

// Which named aspects of `row` differ from the series' usual row.
// Returns a de-duplicated list like ["time", "person"] ("" labels never
// repeat: a start AND end change is still just "time").
export function changedFields(row, usual) {
  if (!row || !usual || row === usual) return [];
  const out = [];
  for (const field of Object.keys(FIELD_LABELS)) {
    if ((row[field] || null) !== (usual[field] || null)) {
      const label = FIELD_LABELS[field];
      if (!out.includes(label)) out.push(label);
    }
  }
  return out;
}

// Gaps in days between consecutive occurrence dates.
export function cadenceGaps(dates) {
  const gaps = [];
  for (let i = 1; i < (dates || []).length; i++) {
    const g = daysBetween(dates[i - 1], dates[i]);
    if (g !== null) gaps.push(g);
  }
  return gaps;
}

// Full derived summary for one series' rows (already date-ordered).
export function summarizeSeries(rows) {
  const list = rows || [];
  const dates = list.map((r) => r.shift_date).filter(Boolean);
  const usual = usualPattern(list);
  let totalMinutes = 0;
  let unknownDuration = 0;
  for (const r of list) {
    const mins = shiftMinutes(r);
    if (mins === null) unknownDuration += 1;
    else totalMinutes += mins;
  }
  const gaps = cadenceGaps(dates);
  const changed = list
    .map((r) => ({ id: r.id, fields: changedFields(r, usual) }))
    .filter((c) => c.fields.length > 0);
  return {
    count: list.length,
    firstDate: dates.length ? dates[0] : null,
    lastDate: dates.length ? dates[dates.length - 1] : null,
    nextDates: dates.slice(0, 3),
    usualMinutes: usual ? shiftMinutes(usual) : null,
    totalMinutes,
    unknownDuration,
    gaps,
    minGap: gaps.length ? Math.min(...gaps) : null,
    maxGap: gaps.length ? Math.max(...gaps) : null,
    changedCount: changed.length,
    changedById: Object.fromEntries(changed.map((c) => [c.id, c.fields])),
    distinctMembers: new Set(list.map((r) => r.member_id).filter(Boolean)).size,
    distinctLocations: new Set(list.map((r) => r.location_id).filter(Boolean)).size,
    unassigned: list.filter((r) => !r.member_id).length,
  };
}

// Delete-guard arithmetic (owner ruling 2026-11-02): how many of a
// series' shifts have recorded work on them. `shiftIds` is every shift
// id in the series (any date); `workedShiftIds` is the ids of shifts
// that carry a time record (array or Set). A series with a count above
// zero must not be deleted: deleting a worked shift detaches its time
// record (the record's shift link is set null, not kept with it).
export function countWorkedShifts(shiftIds, workedShiftIds) {
  const worked = workedShiftIds instanceof Set ? workedShiftIds : new Set(workedShiftIds || []);
  let n = 0;
  for (const id of shiftIds || []) if (worked.has(id)) n += 1;
  return n;
}

// 570 -> "9h 30m"; 540 -> "9h"; 45 -> "45m".
export function formatMinutes(total) {
  const mins = Math.max(0, Math.round(Number(total) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
