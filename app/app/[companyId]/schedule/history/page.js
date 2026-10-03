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

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function friendlyDate(iso) {
  const d = parseDay(iso);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Past shifts, most recent first — who worked, where, when.
export default function HistoryPage() {
  const { company, loading } = useCompany();
  const [shifts, setShifts] = useState([]);
  const [nameById, setNameById] = useState({});
  const [limit, setLimit] = useState(60);

  async function load(n) {
    const sb = supabase();
    const today = chicagoToday();
    const { data } = await sb
      .from("shifts")
      .select("*, locations(name)")
      .eq("company_id", company.id)
      .lt("shift_date", today)
      .order("shift_date", { ascending: false })
      .order("start_time", { ascending: true })
      .limit(n);
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
    if (!loading && company) load(limit);
  }, [loading, company, limit]);

  if (loading || !company) {
    return <div style={{ padding: 24 }}><p>Loading…</p></div>;
  }

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
        Who worked, where, and when — most recent first.
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
