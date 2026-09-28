"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";

export default function SchedulePage() {
  const { company, member, loading } = useCompany();
  const [shifts, setShifts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ location_id: "", member_id: "", shift_date: "", start_time: "", end_time: "", notes: "" });

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    const sb = supabase();
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await sb
      .from("shifts")
      .select("*, locations(name), company_members(display_name)")
      .eq("company_id", company.id)
      .gte("shift_date", today)
      .order("shift_date", { ascending: true })
      .order("start_time", { ascending: true });
    setShifts(data || []);
    const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    setLocations(locs || []);
    const { data: mems } = await sb.from("company_members").select("id, display_name, email").eq("company_id", company.id).order("display_name");
    setMembers(mems || []);
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
    if (!confirm("Delete this shift?")) return;
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
            <span className="card-kicker">{s.shift_date} • {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
            <h3 style={{ margin: "6px 0" }}>{s.locations?.name || "No location"}</h3>
            <p style={{ color: "var(--muted)", marginBottom: 6 }}>{s.company_members?.display_name || "Unassigned"}</p>
            {s.notes && <p style={{ fontSize: "0.9rem" }}>{s.notes}</p>}
            {isManager && (
              <button onClick={() => deleteShift(s.id)} style={dangerButton}>Delete</button>
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
