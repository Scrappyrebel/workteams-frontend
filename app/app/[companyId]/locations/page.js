"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUse } from "../../../../lib/tiers";
import { isManagerRole, isSupervisorRole } from "../../../../lib/roles";

const emptyForm = { name: "", address: "", client_name: "", client_phone: "", notes: "", lat: "", lng: "", geofence_radius_m: 100, rate_area_id: "" };

async function geocodeAddress(address) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(address);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Geocoding request failed");
  const results = await res.json();
  if (!results || results.length === 0) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

export default function LocationsPage() {
  const { company, member, loading } = useCompany();
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [rateAreas, setRateAreas] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [verifyStart, setVerifyStart] = useState("2026-10-03");
  const [verifyEnd, setVerifyEnd] = useState("2026-10-04");
  const [verifyData, setVerifyData] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  async function runVerification() {
    setVerifyBusy(true);
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch(
        `/api/locations/geofence-check?company_id=${company.id}&start=${verifyStart}&end=${verifyEnd}`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } }
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setVerifyData(j);
    } catch (e) {
      alert("Verification failed: " + e.message);
    }
    setVerifyBusy(false);
  }

  const canManage = isManagerRole(member?.role);
  const canView = isSupervisorRole(member?.role);
  const geoAllowed = canUse(company?.effectiveTier || company?.tier, "geofencing");
  const ratesAllowed = canUse(company?.effectiveTier || company?.tier, "bidding");
  const [geoBusy, setGeoBusy] = useState(false);

  async function load() {
    const sb = supabase();
    const { data, error: locError } = await sb
      .from("locations")
      .select("*")
      .eq("company_id", company.id)
      .order("name");
    if (locError) {
      setLoadError("Could not load locations: " + locError.message);
      setLoaded(true);
      return;
    }
    // Sensitive access details live in location_private (managers only).
    const { data: priv } = await sb
      .from("location_private")
      .select("location_id, client_phone, notes")
      .eq("company_id", company.id);
    const privByLoc = {};
    for (const p of priv || []) privByLoc[p.location_id] = p;
    setLocations((data || []).map((l) => ({
      ...l,
      client_phone: privByLoc[l.id]?.client_phone || "",
      notes: privByLoc[l.id]?.notes || "",
    })));
    setLoaded(true);
    setLoadError("");
    if (ratesAllowed && canManage) {
      const { data: ra } = await sb.from("rate_areas").select("id, name").eq("company_id", company.id).order("name");
      setRateAreas(ra || []);
    }
  }

  useEffect(() => {
    if (!loading && company) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company]);

  async function save(e) {
    e.preventDefault();
    if (busy) return; // no double-tap dupes
    setBusy(true);
    const sb = supabase();
    const lat = form.lat === "" ? null : parseFloat(form.lat);
    const lng = form.lng === "" ? null : parseFloat(form.lng);
    const payload = {
      company_id: company.id,
      name: form.name.trim(),
      address: form.address.trim() || null,
      client_name: form.client_name.trim() || null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      geofence_radius_m: parseInt(form.geofence_radius_m, 10) || 100,
      rate_area_id: form.rate_area_id || null,
    };
    // Gate codes, alarm notes, client phone numbers stay out of the main
    // locations table — only managers can read location_private.
    const privatePayload = {
      client_phone: form.client_phone.trim() || null,
      notes: form.notes.trim() || null,
    };
    let error;
    let locId = editing;
    if (editing) {
      ({ error } = await sb.from("locations").update(payload).eq("id", editing));
    } else {
      const { data, error: insErr } = await sb.from("locations").insert(payload).select("id").single();
      error = insErr;
      if (data) locId = data.id;
    }
    if (!error && locId) {
      const { error: privErr } = await sb.from("location_private").upsert(
        { location_id: locId, company_id: company.id, ...privatePayload },
        { onConflict: "location_id" }
      );
      error = privErr;
    }
    if (error) alert("Could not save: " + error.message);
    else {
      setForm(emptyForm);
      setEditing(null);
      load();
    }
    setBusy(false);
  }

  function startEdit(l) {
    setEditing(l.id);
    setForm({
      name: l.name || "",
      address: l.address || "",
      client_name: l.client_name || "",
      client_phone: l.client_phone || "",
      notes: l.notes || "",
      lat: l.lat ?? "",
      lng: l.lng ?? "",
      geofence_radius_m: l.geofence_radius_m ?? 100,
      rate_area_id: l.rate_area_id || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function findCoordinates() {
    const addr = form.address.trim();
    if (!addr) {
      alert("Enter the address first, then tap Find coordinates.");
      return;
    }
    setGeoBusy(true);
    try {
      const coords = await geocodeAddress(addr);
      if (!coords) alert("Could not find that address — you can enter coordinates manually.");
      else setForm({ ...form, lat: String(coords.lat), lng: String(coords.lng) });
    } catch (err) {
      alert("Could not look up the address right now — you can enter coordinates manually.");
    }
    setGeoBusy(false);
  }

  // Two-tap delete: native confirm() doesn't fire on some mobile browsers.
  async function remove(id) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(null);
    const { error } = await supabase().from("locations").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!canView) return <p>Your role can't view locations. Ask your manager.</p>;

  return (
    <div>
      <p className="eyebrow">LOCATIONS</p>
      <h2 style={{ fontSize: "1.8rem" }}>{canManage ? (editing ? "Edit location" : "Add a location") : "Locations"}</h2>

      {canManage && (
      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <form onSubmit={save} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Location name *" required style={input} />
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" style={input} />
          <div style={{ display: "flex", gap: 8 }}>
            <input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="Client name" style={{ ...input, flex: 1 }} />
            <input value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} placeholder="Client phone" style={{ ...input, flex: 1 }} />
          </div>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes (gate code, access details…)" style={input} />
          {ratesAllowed && (
            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Rate area (for bid pricing reference)
              <select
                value={form.rate_area_id}
                onChange={(e) => setForm({ ...form, rate_area_id: e.target.value })}
                style={{ ...input, marginTop: 6 }}
              >
                <option value="">No rate area</option>
                {rateAreas.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>
          )}
          {geoAllowed ? (
            <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
              <p style={{ fontSize: "0.9rem", fontWeight: 800, margin: "0 0 8px" }}>📍 Geofence</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="Latitude" inputMode="decimal" style={{ ...input, flex: 1 }} />
                <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="Longitude" inputMode="decimal" style={{ ...input, flex: 1 }} />
              </div>
              <button type="button" onClick={findCoordinates} disabled={geoBusy} style={{ ...ghostButton, width: "100%", marginBottom: 8 }}>
                {geoBusy ? "Looking up…" : "Find coordinates from address"}
              </button>
              <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                Geofence radius (meters)
                <input type="number" min="10" value={form.geofence_radius_m} onChange={(e) => setForm({ ...form, geofence_radius_m: e.target.value })} style={{ ...input, marginTop: 6 }} />
              </label>
              <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "8px 0 0" }}>
                Clock-ins outside this boundary are blocked.
              </p>
            </div>
          ) : (
            <p style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
              🔒 Geofenced clock-in is a <strong>Plus</strong> feature.{" "}
              <a href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>See plans →</a>
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={busy} style={{ ...button, flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : (editing ? "Save changes" : "Add location")}</button>
            {editing && (
              <button type="button" onClick={() => { setEditing(null); setForm(emptyForm); }} style={ghostButton}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
      )}

      {loadError && <p style={{ color: "#b3261e", fontWeight: 700 }}>{loadError}</p>}
      {!loaded && !loadError && <p style={{ color: "var(--muted)" }}>Loading locations…</p>}

      {canManage && geoAllowed && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>📍 Geofence verification</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)", margin: "0 0 12px" }}>
            Check that clock-ins happened inside each location's geofence.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <input type="date" value={verifyStart} onChange={(e) => setVerifyStart(e.target.value)} style={input} />
            <span style={{ color: "var(--muted)" }}>to</span>
            <input type="date" value={verifyEnd} onChange={(e) => setVerifyEnd(e.target.value)} style={input} />
            <button onClick={runVerification} disabled={verifyBusy} style={brandButton}>
              {verifyBusy ? "Checking…" : "Verify clock-ins"}
            </button>
          </div>
          {verifyData && (
            <div>
              <p style={{ fontWeight: 700 }}>{verifyData.count} clock-in{verifyData.count === 1 ? "" : "s"} found</p>
              {verifyData.entries.map((e, i) => (
                <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 8, fontSize: "0.9rem" }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 700 }}>
                    {e.in_geofence === true ? "✅ " : e.in_geofence === false ? "❌ " : "⚪ "}
                    {e.member} @ {e.location}
                  </p>
                  <p style={{ margin: 0, color: "var(--muted)" }}>
                    {new Date(e.clock_in).toLocaleString()}
                    {!e.has_gps && " • no GPS captured"}
                    {!e.location_has_gps && " • location has no geofence set"}
                    {e.in_distance_m != null && ` • ${e.in_distance_m}m from center (fence: ${e.geofence_radius_m}m)`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {loaded && locations.length === 0 && <p style={{ color: "var(--muted)" }}>{canManage ? "No locations yet — add your first job site above." : "No locations yet."}</p>}
        {locations.map((l) => {
          const hasFence = l.lat != null && l.lng != null;
          const raName = rateAreas.find((r) => r.id === l.rate_area_id)?.name;
          return (
          <div key={l.id} className="portal-card" style={{ minHeight: 0, padding: "16px 20px" }}>
            <span className="card-kicker">{hasFence ? `📍 ${l.geofence_radius_m}m geofence` : "No geofence"}</span>
            <h3 style={{ margin: "6px 0" }}>{l.name}</h3>
            {l.address && <p style={{ color: "var(--muted)", margin: 0 }}>{l.address}</p>}
            {raName && <p style={{ margin: "4px 0 0", fontSize: "0.9rem" }}>💲 Rate area: {raName}</p>}
            {l.client_name && <p style={{ margin: "4px 0 0" }}>Client: {l.client_name}{l.client_phone ? ` • ${l.client_phone}` : ""}</p>}
            {l.notes && <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>{l.notes}</p>}
            {canManage && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button onClick={() => startEdit(l)} style={ghostButton}>Edit</button>
              <button
                onClick={() => remove(l.id)}
                style={confirmDelete === l.id ? dangerButton : ghostButton}
              >
                {confirmDelete === l.id ? "Tap again to confirm delete" : "Delete"}
              </button>
            </div>
            )}
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
