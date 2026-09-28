"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";

const emptyForm = { name: "", address: "", client_name: "", client_phone: "", notes: "", geofence_radius_m: 100 };

export default function LocationsPage() {
  const { company, member, loading } = useCompany();
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    const { data } = await supabase()
      .from("locations")
      .select("*")
      .eq("company_id", company.id)
      .order("name");
    setLocations(data || []);
  }

  useEffect(() => {
    if (!loading && company) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company]);

  async function save(e) {
    e.preventDefault();
    const sb = supabase();
    const payload = {
      company_id: company.id,
      name: form.name.trim(),
      address: form.address.trim() || null,
      client_name: form.client_name.trim() || null,
      client_phone: form.client_phone.trim() || null,
      notes: form.notes.trim() || null,
      geofence_radius_m: parseInt(form.geofence_radius_m, 10) || 100,
    };
    let error;
    if (editing) {
      ({ error } = await sb.from("locations").update(payload).eq("id", editing));
    } else {
      ({ error } = await sb.from("locations").insert(payload));
    }
    if (error) alert("Could not save: " + error.message);
    else {
      setForm(emptyForm);
      setEditing(null);
      load();
    }
  }

  function startEdit(l) {
    setEditing(l.id);
    setForm({
      name: l.name || "",
      address: l.address || "",
      client_name: l.client_name || "",
      client_phone: l.client_phone || "",
      notes: l.notes || "",
      geofence_radius_m: l.geofence_radius_m ?? 100,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id) {
    if (!confirm("Delete this location? Shifts that used it will keep their history.")) return;
    const { error } = await supabase().from("locations").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!isManager) return <p>Managers and owners manage locations. Ask yours to add a new site.</p>;

  return (
    <div>
      <p className="eyebrow">LOCATIONS</p>
      <h2 style={{ fontSize: "1.8rem" }}>{editing ? "Edit location" : "Add a location"}</h2>

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <form onSubmit={save} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Location name *" required style={input} />
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" style={input} />
          <div style={{ display: "flex", gap: 8 }}>
            <input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="Client name" style={{ ...input, flex: 1 }} />
            <input value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} placeholder="Client phone" style={{ ...input, flex: 1 }} />
          </div>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes (gate code, access details…)" style={input} />
          <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            Geofence radius (meters)
            <input type="number" min="10" value={form.geofence_radius_m} onChange={(e) => setForm({ ...form, geofence_radius_m: e.target.value })} style={{ ...input, marginTop: 6 }} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={{ ...button, flex: 1 }}>{editing ? "Save changes" : "Add location"}</button>
            {editing && (
              <button type="button" onClick={() => { setEditing(null); setForm(emptyForm); }} style={ghostButton}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <div style={{ display: "grid", gap: 10 }}>
        {locations.length === 0 && <p style={{ color: "var(--muted)" }}>No locations yet — add your first job site above.</p>}
        {locations.map((l) => (
          <div key={l.id} className="portal-card" style={{ minHeight: 0, padding: "16px 20px" }}>
            <span className="card-kicker">{l.geofence_radius_m}m geofence</span>
            <h3 style={{ margin: "6px 0" }}>{l.name}</h3>
            {l.address && <p style={{ color: "var(--muted)", margin: 0 }}>{l.address}</p>}
            {l.client_name && <p style={{ margin: "4px 0 0" }}>Client: {l.client_name}{l.client_phone ? ` • ${l.client_phone}` : ""}</p>}
            {l.notes && <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>{l.notes}</p>}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button onClick={() => startEdit(l)} style={ghostButton}>Edit</button>
              <button onClick={() => remove(l.id)} style={dangerButton}>Delete</button>
            </div>
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

const ghostButton = {
  border: "1px solid var(--line)",
  background: "#fff",
  borderRadius: 999,
  padding: "7px 16px",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButton = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "7px 16px",
  fontWeight: 700,
  cursor: "pointer",
};
