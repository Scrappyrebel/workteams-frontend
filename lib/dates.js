// Date/time helpers — pinned to America/Chicago (US Central), never UTC.
// new Date().toISOString() is UTC: after 7pm CT it returns tomorrow's date,
// which hid same-day shifts from Schedule/Dashboard and blocked clock-ins.

const TZ = "America/Chicago";

function chicagoParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  return p;
}

// "YYYY-MM-DD" in Chicago time.
export function chicagoToday() {
  const p = chicagoParts();
  return `${p.year}-${p.month}-${p.day}`;
}

// "YYYY-MM-DD" for N days ago, Chicago time.
export function chicagoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = chicagoParts(d);
  return `${p.year}-${p.month}-${p.day}`;
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
