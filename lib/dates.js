// Date/time helpers — company-local time, never UTC.
// new Date().toISOString() is UTC: after 7pm CT it returns tomorrow's date,
// which hid same-day shifts from Schedule/Dashboard and blocked clock-ins.
//
// Pass the company's IANA timezone (companies.timezone, default Chicago).
// All helpers default to America/Chicago so existing call sites behave
// exactly as before until a company sets its own timezone.

export const DEFAULT_TZ = "America/Chicago";

function tzParts(d = new Date(), tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  return p;
}

// "YYYY-MM-DD" in the company's local time.
export function chicagoToday(tz = DEFAULT_TZ) {
  const p = tzParts(new Date(), tz || DEFAULT_TZ);
  return `${p.year}-${p.month}-${p.day}`;
}

// "YYYY-MM-DD" for N days ago, company-local time.
export function chicagoDaysAgo(n, tz = DEFAULT_TZ) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = tzParts(d, tz || DEFAULT_TZ);
  return `${p.year}-${p.month}-${p.day}`;
}

// "YYYY-MM-DD" for an arbitrary Date in the given timezone (en-CA format).
export function dateInTz(d = new Date(), tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// "14:30" or "14:30:00" -> "2:30 PM". Pass through anything already non-military.
export function formatTime12h(t) {
  if (!t) return "";
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t);
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}
