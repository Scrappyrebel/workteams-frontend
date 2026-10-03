"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { chicagoToday, formatTime12h } from "../../../../../lib/dates";

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

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    const sb = supabase();
    const today = chicagoToday();
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
      .gte("shift_date", chicagoToday());
    if (error) alert("Could not delete series: " + error.message);
    else load();
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
      notes: first.notes,
      firstDate: rows[0].shift_date,
      lastDate: rows[rows.length - 1].shift_date,
    };
  });

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Link href={`/app/${company.id}/schedule`} style={{ ...linkBtn }}>← Schedule</Link>
        <h1 style={{ fontSize: "1.4rem", margin: 0 }}>🔁 Repeats</h1>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
        Everything on repeat, plus one-time shifts — in one place.
      </p>

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
                    {" · "}{g.location}{" · "}{g.assignee}
                  </div>
                  <div style={{ fontSize: "0.85rem", marginTop: 4 }}>
                    {g.rows.length} upcoming shift{g.rows.length === 1 ? "" : "s"} · {friendlyDate(g.firstDate)} → {friendlyDate(g.lastDate)}
                  </div>
                </div>
              </div>
              {g.notes && <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>{g.notes}</div>}
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
              </div>
              {expanded === g.seriesId && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: "0.9rem" }}>
                  {g.rows.map((s) => (
                    <li key={s.id}>
                      {friendlyDate(s.shift_date)}
                      {s.startTime && s.start_time !== g.startTime ? ` · ${formatTime12h(s.start_time)}` : ""}
                      {s.member_id && nameById[s.member_id] !== g.assignee ? ` · ${nameById[s.member_id]}` : ""}
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
