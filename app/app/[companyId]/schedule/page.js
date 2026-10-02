"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { chicagoToday, formatTime12h } from "../../../../lib/dates";

export default function SchedulePage() {
  const { company, member, loading } = useCompany();
  const [shifts, setShifts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ location_id: "", member_id: "", shift_date: "", start_time: "", end_time: "", notes: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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
    // Assignee names come from the team directory (id + display name only),
    // which every member may read — never from the full member table.
    const memberIds = [...new Set(shiftRows.map((s) => s.member_id).filter(Boolean))];
    let nameById = {};
    if (memberIds.length > 0) {
      const { data: dir } = await sb.from("team_directory").select("id, display_name").in("id", memberIds);
      for (const d of dir || []) nameById[d.id] = d.display_name;
    }
    setShifts(shiftRows.map((s) => ({ ...s, assignee_name: s.member_id ? nameById[s.member_id] || null : null })));
    const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    setLocations(locs || []);
    if (isManager) {
      // Emails stay manager-only: the assign dropdown needs them, the
      // roster view does not.
      const { data: mems } = await sb.from("company_members").select("id, display_name, email").eq("company_id", company.id).order("display_name");
      setMembers(mems || []);
    } else {
      setMembers([]);
    }
  }

  useEffect(() => {
    if (!loading && company) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company]);

  async function addShift(e) {
    e.preventDefault();
    const sb = supabase();
    const { error } = await sb.from("shifts").insert({
      company_id: company.id,
      location_id: form.location_id || null,
      member_id: form.member_id || null,
      shift_date: form.shift_date,
      start_time: form.start_time,
      end_time: form.end_time,
      notes: form.notes || null,
    });
    if (error) alert("Could not add shift: " + error.message);
    else {
      setForm({ location_id: "", member_id: "", shift_date: "", start_time: "", end_time: "", notes: "" });
      load();
    }
  }

  async function deleteShift(id) {
    // Two-tap inline confirm — no native confirm() dialog, which is
    // unreliable in some mobile browsers and automation.
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    const { error } = await supabase().from("shifts").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  if (loading || !company) return <p>Loading…</p>;

  return (
    <div>
      <p className="eyebrow">SCHEDULE</p>
      <h2 style={{ fontSize: "1.8rem" }}>Upcoming shifts</h2>

      {isManager && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Add a shift</h3>
          <form onSubmit={addShift} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} required style={input}>
              <option value="">Choose a location…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={form.member_id} onChange={(e) => setForm({ ...form, member_id: e.target.value })} style={input}>
              <option value="">Assign to… (optional)</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.display_name} ({m.email})</option>)}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" required value={form.shift_date} onChange={(e) => setForm({ ...form, shift_date: e.target.value })} style={{ ...input, flex: 1 }} />
              <input type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} style={{ ...input, flex: 1 }} />
              <input type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} style={{ ...input, flex: 1 }} />
            </div>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes (optional)" style={input} />
            <button type="submit" style={button}>Add shift</button>
          </form>
        </section>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {shifts.length === 0 && <p style={{ color: "var(--muted)" }}>No upcoming shifts yet.</p>}
        {shifts.map((s) => (
          <div key={s.id} className="portal-card" style={{ minHeight: 0, padding: "16px 20px" }}>
            <span className="card-kicker">{s.shift_date} • {formatTime12h(s.start_time)}–{formatTime12h(s.end_time)}</span>
            <h3 style={{ margin: "6px 0" }}>{s.locations?.name || "No location"}</h3>
            <p style={{ color: "var(--muted)", marginBottom: 6 }}>{s.assignee_name || "Unassigned"}</p>
            {s.notes && <p style={{ fontSize: "0.9rem" }}>{s.notes}</p>}
            {isManager && (
              <button
                onClick={() => deleteShift(s.id)}
                style={confirmDeleteId === s.id ? confirmButton : dangerButton}
              >
                {confirmDeleteId === s.id ? "Tap again to confirm delete" : "Delete"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const input = {
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  width: "100%",
};

const button = {
  padding: "12px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const dangerButton = {
  marginTop: 8,
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "7px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const confirmButton = {
  marginTop: 8,
  border: "none",
  background: "#b3261e",
  color: "#fff",
  borderRadius: 999,
  padding: "7px 14px",
  fontWeight: 800,
  cursor: "pointer",
};
