"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { chicagoToday, formatTime12h } from "../../../../../lib/dates";
import { summarizeSeries, formatMinutes, daysBetween } from "../../../../../lib/repeat-series.mjs";

// Parse "YYYY-MM-DD" as local noon so timezone shifts can't move the day.
function parseDay(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function friendlyDate(iso) {
  const d = parseDay(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function RepeatsPage() {
  const { company, member, loading } = useCompany();
  const [shifts, setShifts] = useState([]);
  const [nameById, setNameById] = useState({});
  const [expanded, setExpanded] = useState(null); // series_id with visible date list
  const [confirmSeriesId, setConfirmSeriesId] = useState(null);
  // Depth (D-WT-13): how many shifts each series already has in the
  // past (kept as history), and the "end this series sooner" picker.
  const [pastCountBySeries, setPastCountBySeries] = useState({});
  const [endPick, setEndPick] = useState(null); // { seriesId, date }
  const [confirmEndSeriesId, setConfirmEndSeriesId] = useState(null);

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    const sb = supabase();
    const today = chicagoToday(company?.timezone);
    const { data } = await sb
      .from("shifts")
      .select("*, locations(name)")
      .eq("company_id", company.id)
      .gte("shift_date", today)
      .order("shift_date", { ascending: true })
      .order("start_time", { ascending: true });
    const shiftRows = data || [];
    const memberIds = [...new Set(shiftRows.map((s) => s.member_id).filter(Boolean))];
    let names = {};
    if (memberIds.length > 0) {
      const { data: dir } = await sb.from("team_directory").select("id, display_name").in("id", memberIds);
      for (const r of dir || []) names[r.id] = r.display_name;
    }
    setShifts(shiftRows);
    setNameById(names);
    // Additive (D-WT-13): exact past counts per series, so the page can
    // say how much of a series is already history. Head-only counts —
    // no past rows are loaded — and any failure simply leaves the
    // counts off; the upcoming list above is exactly as before.
    const seriesIds = [...new Set(shiftRows.map((s) => s.series_id).filter(Boolean))];
    if (seriesIds.length > 0) {
      const counts = {};
      await Promise.all(
        seriesIds.map(async (sid) => {
          const { count, error } = await sb
            .from("shifts")
            .select("id", { count: "exact", head: true })
            .eq("company_id", company.id)
            .eq("series_id", sid)
            .lt("shift_date", today);
          if (!error && typeof count === "number") counts[sid] = count;
        })
      );
      setPastCountBySeries(counts);
    } else {
      setPastCountBySeries({});
    }
  }

  useEffect(() => {
    if (!loading && company) load();
  }, [loading, company]);

  async function deleteSeries(seriesId) {
    // Removes the FUTURE shifts of a repeat series; past shifts stay as history.
    if (confirmSeriesId !== seriesId) {
      setConfirmSeriesId(seriesId);
      return;
    }
    setConfirmSeriesId(null);
    const { error } = await supabase()
      .from("shifts")
      .delete()
      .eq("series_id", seriesId)
      .gte("shift_date", chicagoToday(company?.timezone));
    if (error) alert("Could not delete series: " + error.message);
    else load();
  }

  async function endSeriesEarly(g) {
    // Ends a series on a chosen last date: removes only the shifts
    // AFTER that date. A strict subset of Delete series above (which
    // removes everything from today) — shifts on or before the chosen
    // date stay, today's shifts stay, and past shifts never change.
    if (!endPick || endPick.seriesId !== g.seriesId) return;
    const lastDate = endPick.date;
    if (!lastDate || lastDate >= g.lastDate) return;
    if (confirmEndSeriesId !== g.seriesId) {
      setConfirmEndSeriesId(g.seriesId);
      return;
    }
    setConfirmEndSeriesId(null);
    const { error } = await supabase()
      .from("shifts")
      .delete()
      .eq("series_id", g.seriesId)
      .gt("shift_date", lastDate)
      .gte("shift_date", chicagoToday(company?.timezone));
    if (error) alert("Could not end series: " + error.message);
    else {
      setEndPick(null);
      load();
    }
  }

  if (loading || !company) {
    return <div style={{ padding: 24 }}><p>Loading…</p></div>;
  }

  // Group upcoming shifts by series; one-offs (no series_id) stay separate.
  const seriesMap = new Map();
  const oneOffs = [];
  for (const s of shifts) {
    if (s.series_id) {
      if (!seriesMap.has(s.series_id)) seriesMap.set(s.series_id, []);
      seriesMap.get(s.series_id).push(s);
    } else {
      oneOffs.push(s);
    }
  }
  const seriesList = [...seriesMap.entries()].map(([seriesId, rows]) => {
    const first = rows[0];
    return {
      seriesId,
      rows,
      label: first.recurrence_label || "Repeating",
      startTime: first.start_time,
      endTime: first.end_time,
      location: first.locations?.name || "—",
      assignee: first.member_id ? (nameById[first.member_id] || "—") : "Unassigned",
      department: first.department || null,
      notes: first.notes,
      firstDate: rows[0].shift_date,
      lastDate: rows[rows.length - 1].shift_date,
      // Derived from the stored rows (D-WT-13): WorkTeams keeps no
      // series record, so the pattern, cadence, changed single dates
      // and scheduled time are read off the shifts themselves.
      summary: summarizeSeries(rows),
      pastCount: pastCountBySeries[seriesId] || 0,
    };
  });
  const todayISO = chicagoToday(company?.timezone);
  const repeatsTotals = seriesList.reduce(
    (acc, g) => ({
      shifts: acc.shifts + g.summary.count,
      minutes: acc.minutes + g.summary.totalMinutes,
      unknownDuration: acc.unknownDuration + g.summary.unknownDuration,
      unassigned: acc.unassigned + g.summary.unassigned,
      endingSoon:
        acc.endingSoon +
        (daysBetween(todayISO, g.lastDate) !== null && daysBetween(todayISO, g.lastDate) <= 30 ? 1 : 0),
    }),
    { shifts: 0, minutes: 0, unknownDuration: 0, unassigned: 0, endingSoon: 0 }
  );

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Link href={`/app/${company.id}/schedule`} style={{ ...linkBtn }}>← Schedule</Link>
        <h1 style={{ fontSize: "1.4rem", margin: 0 }}>🔁 Repeats</h1>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
        Everything on repeat, plus one-time shifts — in one place.
      </p>

      {seriesList.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 800 }}>Repeats at a glance</div>
          <div style={{ fontSize: "0.9rem", marginTop: 4 }}>
            {seriesList.length} repeating series · {repeatsTotals.shifts} upcoming repeated shift{repeatsTotals.shifts === 1 ? "" : "s"} · {formatMinutes(repeatsTotals.minutes)} of scheduled time
            {repeatsTotals.unknownDuration > 0 ? ` (${repeatsTotals.unknownDuration} shift${repeatsTotals.unknownDuration === 1 ? " has" : "s have"} no end time and ${repeatsTotals.unknownDuration === 1 ? "isn't" : "aren't"} in that total)` : ""}
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 2 }}>
            {repeatsTotals.endingSoon} series end{repeatsTotals.endingSoon === 1 ? "s" : ""} in the next 30 days
            {repeatsTotals.unassigned > 0 ? ` · ${repeatsTotals.unassigned} upcoming repeat${repeatsTotals.unassigned === 1 ? " is" : "s are"} not assigned to anyone yet` : ""}
          </div>
        </div>
      )}

      {isManager && (
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "12px 0 0" }}>
          New repeats are started on the Schedule page — add a shift there and choose how it repeats.{" "}
          <Link href={`/app/${company.id}/schedule`}>Open Schedule</Link>
        </p>
      )}

      <h2 style={{ fontSize: "1.1rem", margin: "20px 0 8px" }}>On repeat ({seriesList.length})</h2>
      {seriesList.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Nothing repeating right now.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {seriesList.map((g) => (
            <div key={g.seriesId} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{g.label}</div>
                  <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                    {g.startTime ? formatTime12h(g.startTime) : ""}{g.endTime ? ` – ${formatTime12h(g.endTime)}` : ""}
                    {" · "}{g.location}{" · "}{g.assignee}{g.department ? ` · ${g.department}` : ""}
                  </div>
                  <div style={{ fontSize: "0.85rem", marginTop: 4 }}>
                    {g.rows.length} upcoming shift{g.rows.length === 1 ? "" : "s"} · {friendlyDate(g.firstDate)} → {friendlyDate(g.lastDate)}
                  </div>
                </div>
              </div>
              {g.notes && <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>{g.notes}</div>}
              <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6, display: "grid", gap: 2 }}>
                <span>
                  Next: {friendlyDate(g.summary.firstDate)}
                  {g.summary.nextDates[1] ? ` · then ${friendlyDate(g.summary.nextDates[1])}` : ""}
                  {g.summary.nextDates[2] ? ` · then ${friendlyDate(g.summary.nextDates[2])}` : ""}
                </span>
                {g.summary.count > 1 && g.summary.minGap !== null && (
                  <span>
                    {g.summary.minGap === g.summary.maxGap
                      ? `Dates fall every ${g.summary.minGap} day${g.summary.minGap === 1 ? "" : "s"}`
                      : `Dates fall ${g.summary.minGap}–${g.summary.maxGap} days apart`}
                  </span>
                )}
                {g.summary.usualMinutes !== null && (
                  <span>
                    About {formatMinutes(g.summary.usualMinutes)} per shift · {formatMinutes(g.summary.totalMinutes)} scheduled across the series
                    {g.summary.unknownDuration > 0 ? ` (${g.summary.unknownDuration} shift${g.summary.unknownDuration === 1 ? " has" : "s have"} no end time and ${g.summary.unknownDuration === 1 ? "isn't" : "aren't"} counted)` : ""}
                  </span>
                )}
                <span>
                  {daysBetween(todayISO, g.lastDate) === 0
                    ? "The last repeat is today"
                    : daysBetween(todayISO, g.lastDate) === 1
                      ? "The last repeat is tomorrow"
                      : `The last repeat is in ${daysBetween(todayISO, g.lastDate)} days`}
                  {g.pastCount > 0 ? ` · ${g.pastCount} earlier shift${g.pastCount === 1 ? "" : "s"} in this series ${g.pastCount === 1 ? "is" : "are"} kept in history` : ""}
                </span>
                {g.summary.distinctMembers > 1 && <span>{g.summary.distinctMembers} different people work dates in this series — the name above is the first date's.</span>}
                {g.summary.distinctLocations > 1 && <span>{g.summary.distinctLocations} different places appear in this series — the place above is the first date's.</span>}
                {g.summary.changedCount > 0 && (
                  <span>
                    {g.summary.changedCount} of these dates differ{g.summary.changedCount === 1 ? "s" : ""} from the series' usual pattern (a single date was changed) — open "Show all dates" to see which.
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === g.seriesId ? null : g.seriesId)}
                  style={ghostBtn}
                >
                  {expanded === g.seriesId ? "Hide dates" : "Show all dates"}
                </button>
                {isManager && (
                  <button
                    type="button"
                    onClick={() => deleteSeries(g.seriesId)}
                    style={confirmSeriesId === g.seriesId ? confirmBtn : dangerBtn}
                  >
                    {confirmSeriesId === g.seriesId ? "Tap again: delete all future repeats" : "Delete series"}
                  </button>
                )}
                {isManager && g.rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmEndSeriesId(null);
                      setEndPick(endPick && endPick.seriesId === g.seriesId ? null : { seriesId: g.seriesId, date: g.lastDate });
                    }}
                    style={ghostBtn}
                  >
                    {endPick && endPick.seriesId === g.seriesId ? "Hide end-date picker" : "End series sooner"}
                  </button>
                )}
              </div>
              {isManager && endPick && endPick.seriesId === g.seriesId && (
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                    Last date for this series{" "}
                    <input
                      type="date"
                      value={endPick.date}
                      min={todayISO}
                      max={g.lastDate}
                      onChange={(e) => {
                        setConfirmEndSeriesId(null);
                        setEndPick({ seriesId: g.seriesId, date: e.target.value });
                      }}
                      style={{ marginLeft: 6, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)" }}
                    />
                  </label>
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                    Shifts after that date are removed. Shifts on or before it stay, today's shifts stay, and earlier shifts stay as history.
                  </div>
                  {endPick.date && endPick.date >= g.lastDate ? (
                    <div style={{ fontSize: "0.85rem" }}>That is already the last date — nothing would change.</div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => endSeriesEarly(g)}
                      style={confirmEndSeriesId === g.seriesId ? confirmBtn : dangerBtn}
                    >
                      {confirmEndSeriesId === g.seriesId
                        ? `Tap again: end after ${friendlyDate(endPick.date)}`
                        : `End series after ${endPick.date ? friendlyDate(endPick.date) : "…"}`}
                    </button>
                  )}
                </div>
              )}
              {expanded === g.seriesId && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: "0.9rem" }}>
                  {g.rows.map((s) => (
                    <li key={s.id}>
                      {friendlyDate(s.shift_date)}
                      {s.start_time && s.start_time !== g.startTime ? ` · ${formatTime12h(s.start_time)}` : ""}
                      {s.member_id && nameById[s.member_id] !== g.assignee ? ` · ${nameById[s.member_id]}` : ""}
                      {g.summary.changedById[s.id] ? ` · changed from the usual pattern: ${g.summary.changedById[s.id].join(", ")}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: "1.1rem", margin: "24px 0 8px" }}>One-time shifts ({oneOffs.length})</h2>
      {oneOffs.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No one-time shifts scheduled.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {oneOffs.map((s) => (
            <div key={s.id} style={card}>
              <div style={{ fontWeight: 700 }}>{friendlyDate(s.shift_date)}</div>
              <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                {s.start_time ? formatTime12h(s.start_time) : ""}{s.end_time ? ` – ${formatTime12h(s.end_time)}` : ""}
                {" · "}{s.locations?.name || "—"}
                {" · "}{s.member_id ? (nameById[s.member_id] || "—") : "Unassigned"}
                {s.department ? ` · ${s.department}` : ""}
              </div>
              {s.notes && <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 2 }}>{s.notes}</div>}
            </div>
          ))}
        </div>
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
  padding: "8px 14px",
  background: "#fff",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const dangerBtn = {
  border: "1px solid #fca5a5",
  borderRadius: 999,
  padding: "8px 14px",
  background: "#fff",
  color: "#b91c1c",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const confirmBtn = {
  ...dangerBtn,
  background: "#b91c1c",
  color: "#fff",
  border: "1px solid #b91c1c",
};
