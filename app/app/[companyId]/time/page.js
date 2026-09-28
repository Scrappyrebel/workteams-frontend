"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export default function TimeClockPage() {
  const { company, member, loading } = useCompany();
  const [open, setOpen] = useState(null);
  const [entries, setEntries] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [filter, setFilter] = useState("mine");
  const [busy, setBusy] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    const sb = supabase();
    const { data: openRows } = await sb
      .from("time_entries")
      .select("*, locations(name)")
      .eq("company_id", company.id)
      .eq("member_id", member.id)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1);
    setOpen(openRows && openRows[0] ? openRows[0] : null);

    let q = sb
      .from("time_entries")
      .select("*, locations(name), company_members(display_name)")
      .eq("company_id", company.id)
      .order("clock_in", { ascending: false })
      .limit(30);
    if (!isManager || filter === "mine") q = q.eq("member_id", member.id);
    const { data } = await q;
    setEntries(data || []);

    const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    setLocations(locs || []);
  }

  useEffect(() => {
    if (!loading && company && member) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member, filter]);

  async function clockIn() {
    if (!locationId) {
      alert("Pick the location you're working at first.");
      return;
    }
    setBusy(true);
    const pos = await getPosition();
    const { error } = await supabase().from("time_entries").insert({
      company_id: company.id,
      member_id: member.id,
      location_id: locationId,
      clock_in_lat: pos?.lat ?? null,
      clock_in_lng: pos?.lng ?? null,
    });
    setBusy(false);
    if (error) alert("Clock-in failed: " + error.message);
    else load();
  }

  async function clockOut() {
    setBusy(true);
    const pos = await getPosition();
    const { error } = await supabase()
      .from("time_entries")
      .update({
        clock_out: new Date().toISOString(),
        clock_out_lat: pos?.lat ?? null,
        clock_out_lng: pos?.lng ?? null,
      })
      .eq("id", open.id);
    setBusy(false);
    if (error) alert("Clock-out failed: " + error.message);
    else load();
  }

  if (loading || !company) return <p>Loading…</p>;

  return (
    <div>
      <p className="eyebrow">TIME CLOCK</p>
      <h2 style={{ fontSize: "1.8rem" }}>Clock in / out</h2>

      <section className="panel" style={{ padding: 24, margin: "18px 0", textAlign: "center" }}>
        {open ? (
          <div>
            <p style={{ fontWeight: 800, fontSize: "1.1rem" }}>
              🟢 You're clocked in{open.locations ? ` at ${open.locations.name}` : ""} since{" "}
              {new Date(open.clock_in).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
            <button onClick={clockOut} disabled={busy} style={{ ...bigButton, background: "#28704a" }}>
              {busy ? "Working…" : "Clock out"}
            </button>
          </div>
        ) : (
          <div>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ ...input, maxWidth: 420, marginBottom: 14 }}>
              <option value="">Choose your work location…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <br />
            <button onClick={clockIn} disabled={busy} style={bigButton}>
              {busy ? "Working…" : "Clock in"}
            </button>
            <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 10 }}>
              Your phone's location is saved with each clock-in and clock-out.
            </p>
          </div>
        )}
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Recent entries</h3>
        {isManager && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button onClick={() => setFilter("mine")} style={filterBtn(filter === "mine")}>Mine</button>
            <button onClick={() => setFilter("everyone")} style={filterBtn(filter === "everyone")}>Everyone</button>
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {entries.length === 0 && <p style={{ color: "var(--muted)" }}>No entries yet.</p>}
        {entries.map((e) => {
          const hrs = e.clock_out
            ? ((new Date(e.clock_out) - new Date(e.clock_in)) / 3600000).toFixed(2)
            : null;
          return (
            <div key={e.id} className="portal-card" style={{ minHeight: 0, padding: "12px 16px" }}>
              <span className="card-kicker">
                {new Date(e.clock_in).toLocaleDateString()} • {e.locations?.name || "No location"}
                {e.company_members ? ` • ${e.company_members.display_name}` : ""}
              </span>
              <p style={{ margin: "6px 0 0" }}>
                {new Date(e.clock_in).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} →{" "}
                {e.clock_out
                  ? new Date(e.clock_out).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                  : <strong>open</strong>}{" "}
                {hrs && <span style={{ color: "var(--muted)" }}>({hrs} h)</span>}
              </p>
            </div>
          );
        })}
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

const bigButton = {
  padding: "16px 54px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  fontSize: "1.15rem",
  cursor: "pointer",
};

const filterBtn = (active) => ({
  border: "1px solid var(--line)",
  background: active ? "var(--brand)" : "#fff",
  color: active ? "#fff" : "var(--ink)",
  borderRadius: 999,
  padding: "6px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
});
