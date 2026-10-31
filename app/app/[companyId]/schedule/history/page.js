"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { chicagoToday, formatTime12h } from "../../../../../lib/dates";
import { hasShiftAttendance, shiftBounds } from "../../../../../lib/attendance-shifts.mjs";

// Parse "YYYY-MM-DD" as local noon so timezone shifts can't move the day.
function parseDay(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function friendlyDate(iso) {
  const d = parseDay(iso);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Format a stored clock timestamp in the company's timezone, the same
// timezone the scheduled wall times on this page are written in.
function formatClockTime(iso, tz) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz || "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

// Past shifts, most recent first — who was scheduled, where, and when,
// plus the actual clock record where one is honestly linked to the
// shift (see load() below for the linkage rules).
export default function HistoryPage() {
  const { company, loading } = useCompany();
  const [shifts, setShifts] = useState([]);
  const [nameById, setNameById] = useState({});
  const [actualsByShift, setActualsByShift] = useState({});
  const [limit, setLimit] = useState(60);

  async function load(n) {
    const sb = supabase();
    const today = chicagoToday(company?.timezone);
    const { data } = await sb
      .from("shifts")
      .select("*, locations(name)")
      .eq("company_id", company.id)
      .lt("shift_date", today)
      .order("shift_date", { ascending: false })
      .order("start_time", { ascending: true })
      .limit(n);
    const shiftRows = data || [];
    // Actuals, honestly derived only. A clock record is shown for a
    // shift ONLY when it is stored as linked to that exact shift
    // (time_entries.shift_id, set by the clock-in route at clock-in
    // time) AND it passes the same guard the attendance alerts use
    // (lib/attendance-shifts.mjs hasShiftAttendance): same company,
    // same member, same location, and a clock-in inside the linked
    // window (the scheduled day, no later than 30 minutes after the
    // scheduled start). That guard also rejects older records whose
    // shift_id was written by the old first-shift-of-the-day matching.
    // Entries with no link — manager-approved clock-ins and older
    // rows — are NEVER matched to a shift here by date, time, or
    // location, because that would be guessing; their shift simply
    // renders as scheduled only below. Any failure in this read
    // leaves the page exactly as before, with scheduled rows only.
    let actuals = {};
    try {
      const shiftIds = shiftRows.map((s) => s.id).filter(Boolean);
      if (shiftIds.length > 0) {
        const { data: entries, error: entriesError } = await sb
          .from("time_entries")
          .select("id, company_id, member_id, location_id, shift_id, clock_in, clock_out")
          .eq("company_id", company.id)
          .in("shift_id", shiftIds)
          .order("clock_in", { ascending: true })
          .limit(500);
        if (!entriesError) {
          const tz = company?.timezone || "America/Chicago";
          const now = new Date();
          for (const s of shiftRows) {
            if (!s.member_id) continue;
            const linked = (entries || []).filter(
              (e) => e.shift_id === s.id && e.member_id === s.member_id && hasShiftAttendance(s, [e], now, tz)
            );
            if (linked.length > 0) actuals[s.id] = linked;
          }
        }
      }
    } catch { /* actuals unavailable — scheduled rows still render */ }
    setActualsByShift(actuals);
    const memberIds = [...new Set(shiftRows.map((s) => s.member_id).filter(Boolean))];
    let names = {};
    if (memberIds.length > 0) {
      const { data: dir } = await sb.from("team_directory").select("id, display_name").in("id", memberIds);
      for (const r of dir || []) names[r.id] = r.display_name;
    }
    setShifts(shiftRows);
    setNameById(names);
  }

  useEffect(() => {
    if (!loading && company) load(limit);
  }, [loading, company, limit]);

  if (loading || !company) {
    return <div style={{ padding: 24 }}><p>Loading…</p></div>;
  }

  const tz = company?.timezone || "America/Chicago";

  // Group by date, most recent first.
  const byDate = new Map();
  for (const s of shifts) {
    if (!byDate.has(s.shift_date)) byDate.set(s.shift_date, []);
    byDate.get(s.shift_date).push(s);
  }

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Link href={`/app/${company.id}/schedule`} style={linkBtn}>← Schedule</Link>
        <h1 style={{ fontSize: "1.4rem", margin: 0 }}>📜 Shift history</h1>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
        Who was scheduled, where, and when — most recent first. Where a clock record is linked to the shift, the actual clock-in, clock-out, and hours worked are shown too.
      </p>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>
        “Scheduled only” does not by itself mean the person did not work — manager-approved and older clock-ins are not always linked to a shift. Check Time Clock before treating a shift as missed.
      </p>

      {shifts.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No past shifts yet.</p>
      ) : (
        <>
          {[...byDate.entries()].map(([date, rows]) => (
            <div key={date} style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: "1rem", margin: "0 0 6px" }}>{friendlyDate(date)}</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {rows.map((s) => (
                  <div key={s.id} style={card}>
                    <div style={{ fontWeight: 700 }}>
                      {s.member_id ? (nameById[s.member_id] || "—") : "Unassigned"}
                    </div>
                    <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                      {s.start_time ? formatTime12h(s.start_time) : ""}{s.end_time ? ` – ${formatTime12h(s.end_time)}` : ""}
                      {" · "}{s.locations?.name || "—"}
                      {s.recurrence_label ? ` · ${s.recurrence_label}` : ""}
                    </div>
                    {(() => {
                      const worked = actualsByShift[s.id] || [];
                      if (worked.length === 0) {
                        return (
                          <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 2 }}>
                            Scheduled only — no clock record is linked to this shift.
                          </div>
                        );
                      }
                      return worked.map((e) => {
                        // Hours worked is the stored clock-out minus the
                        // stored clock-in, exactly as the Time Clock page
                        // computes it — no pay is calculated here.
                        const hrs = e.clock_out
                          ? ((new Date(e.clock_out) - new Date(e.clock_in)) / 3600000).toFixed(2)
                          : null;
                        let lateNote = "";
                        if (s.start_time && s.end_time) {
                          const lateMinutes = Math.floor(
                            (new Date(e.clock_in).getTime() - shiftBounds(s, tz).start.getTime()) / 60000
                          );
                          if (lateMinutes >= 1) lateNote = ` · clocked in ${lateMinutes} min after the scheduled start`;
                        }
                        return (
                          <div key={e.id} style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: 2 }}>
                            Worked: {formatClockTime(e.clock_in, tz)} –{" "}
                            {e.clock_out ? formatClockTime(e.clock_out, tz) : "no clock-out recorded"}
                            {hrs ? ` · ${hrs} h` : ""}
                            {lateNote}
                          </div>
                        );
                      });
                    })()}
                    {s.notes && <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 2 }}>{s.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setLimit(limit + 60)} style={ghostBtn}>
            Show older shifts
          </button>
        </>
      )}
    </div>
  );
}

const card = {
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 12,
  background: "#fff",
};

const linkBtn = {
  border: "1px solid var(--line)",
  borderRadius: 999,
  padding: "6px 14px",
  textDecoration: "none",
  color: "inherit",
  fontWeight: 700,
  fontSize: "0.9rem",
  background: "#fff",
};

const ghostBtn = {
  border: "1px solid var(--line)",
  borderRadius: 999,
  padding: "10px 18px",
  background: "#fff",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.9rem",
  width: "100%",
  marginTop: 8,
};
