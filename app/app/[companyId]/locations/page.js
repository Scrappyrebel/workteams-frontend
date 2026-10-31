"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUseWithRole } from "../../../../lib/tiers";
import { isManagerRole, isSupervisorRole } from "../../../../lib/roles";
import { chicagoToday, chicagoDaysAgo } from "../../../../lib/dates";
import { validateLocationGeofence } from "../../../../lib/location-geofence-validation.mjs";

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
  const [verifyStart, setVerifyStart] = useState(() => chicagoDaysAgo(7));
  const [verifyEnd, setVerifyEnd] = useState(() => chicagoToday());
  // Recompute the default window once the company's timezone is known.
  useEffect(() => {
    if (company?.timezone) {
      setVerifyStart(chicagoDaysAgo(7, company.timezone));
      setVerifyEnd(chicagoToday(company.timezone));
    }
  }, [company?.timezone]);
  const [verifyData, setVerifyData] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [activityOpen, setActivityOpen] = useState(null);
  const [activityByLoc, setActivityByLoc] = useState({});

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
  const geoAllowed = canUseWithRole(company?.effectiveTier || company?.tier, "geofencing", member?.role);
  const ratesAllowed = canUseWithRole(company?.effectiveTier || company?.tier, "bidding", member?.role);
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
    const lat = form.lat === "" ? null : Number(form.lat);
    const lng = form.lng === "" ? null : Number(form.lng);
    const geofenceError = validateLocationGeofence(form.address, form.lat, form.lng);
    if (geofenceError) {
      setBusy(false);
      alert(geofenceError);
      return;
    }
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

  // --- Site activity (depth D-WT-18) -----------------------------------
  // Everything below reads rows the app already stores, keyed by
  // location_id and scoped to this company, under the caller's own
  // session. Every read is fail-soft: if one fails, that section simply
  // does not render and the card stays exactly as it has always been.
  // Money and bid reads run only for managers (owner/admin) — the same
  // roles those tables' own access rules already restrict them to.
  // This block adds no writes of any kind.
  async function loadActivity(locId) {
    if (activityByLoc[locId]) return;
    const sb = supabase();
    const out = {};
    const today = chicagoToday(company?.timezone);
    // Upcoming shifts at this site, soonest first.
    const shiftCols = "id, member_id, shift_date, start_time, end_time";
    let shiftsRes = await sb.from("shifts").select(shiftCols + ", department, position_name")
      .eq("company_id", company.id).eq("location_id", locId)
      .gte("shift_date", today).order("shift_date").order("start_time").limit(25);
    if (shiftsRes.error) {
      shiftsRes = await sb.from("shifts").select(shiftCols)
        .eq("company_id", company.id).eq("location_id", locId)
        .gte("shift_date", today).order("shift_date").order("start_time").limit(25);
    }
    if (!shiftsRes.error && shiftsRes.data) {
      const memberIds = [...new Set(shiftsRes.data.map((s) => s.member_id).filter(Boolean))];
      const nameById = {};
      if (memberIds.length) {
        const { data: dir } = await sb.from("team_directory").select("id, display_name").in("id", memberIds);
        for (const d of dir || []) nameById[d.id] = d.display_name;
      }
      out.shifts = shiftsRes.data.map((s) => ({ ...s, who: s.member_id ? (nameById[s.member_id] || "Team member") : "Unassigned — open shift" }));
    }
    // Work orders still open at this site.
    const { data: wos, error: woErr } = await sb.from("work_orders")
      .select("id, title, status, priority, due_date")
      .eq("company_id", company.id).eq("location_id", locId)
      .in("status", ["open", "in_progress"]).order("due_date", { ascending: true, nullsFirst: false }).limit(25);
    if (!woErr && wos) out.workOrders = wos;
    // Inspections at this site: how many, and the most recent.
    const { data: insps, error: inspErr } = await sb.from("inspections")
      .select("id, inspection_date, score")
      .eq("company_id", company.id).eq("location_id", locId)
      .order("inspection_date", { ascending: false }).order("created_at", { ascending: false }).limit(25);
    if (!inspErr && insps) out.inspections = insps;
    if (canManage) {
      // Bids tied to this site, counted by their stored status.
      const { data: bids, error: bidErr } = await sb.from("bids")
        .select("status").eq("company_id", company.id).eq("location_id", locId).limit(500);
      if (!bidErr && bids) {
        const counts = { accepted: 0, sent: 0, draft: 0, declined: 0 };
        for (const b of bids) if (counts[b.status] !== undefined) counts[b.status] += 1;
        out.bidCounts = counts;
      }
      // Invoices billed to this site (locations double as invoicing
      // clients). Issued/paid only — drafts are not billed yet and
      // voided invoices are excluded, the same basis as invoicing
      // itself. Totals come from the stored total / amount_paid.
      const { data: invs, error: invErr } = await sb.from("invoices")
        .select("id, invoice_number, status, total, amount_paid, issue_date")
        .eq("company_id", company.id).eq("location_id", locId)
        .in("status", ["issued", "paid"]).order("issue_date", { ascending: false }).limit(500);
      if (!invErr && invs) {
        out.invoices = {
          count: invs.length,
          invoiced: invs.reduce((a, i) => a + (Number(i.total) || 0), 0),
          owed: invs.reduce((a, i) => a + Math.max(0, (Number(i.total) || 0) - (Number(i.amount_paid) || 0)), 0),
          latest: invs[0] || null,
        };
      }
    }
    setActivityByLoc((prev) => ({ ...prev, [locId]: out }));
  }

  function toggleActivity(locId) {
    if (activityOpen === locId) {
      setActivityOpen(null);
      return;
    }
    setActivityOpen(locId);
    loadActivity(locId);
  }
  // --- End site activity ------------------------------------------------

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

  const searchText = search.trim().toLowerCase();
  const visibleLocations = searchText
    ? locations.filter((l) => [l.name, l.address, l.client_name].some((v) => (v || "").toLowerCase().includes(searchText)))
    : locations;

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
                Clock-ins outside this boundary are blocked. For Missouri sites, longitude must be negative (west). Confirm the pin at the building.
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "4px 0 0" }}>
                Address lookup by OpenStreetMap contributors.
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

      {loaded && locations.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search locations by name, address, or client…"
          style={{ ...input, marginBottom: 12 }}
        />
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {loaded && locations.length === 0 && <p style={{ color: "var(--muted)" }}>{canManage ? "No locations yet — add your first job site above." : "No locations yet."}</p>}
        {loaded && locations.length > 0 && visibleLocations.length === 0 && <p style={{ color: "var(--muted)" }}>No locations match your search.</p>}
        {visibleLocations.map((l) => {
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
            <div style={{ marginTop: 8 }}>
              <button onClick={() => toggleActivity(l.id)} style={ghostButton}>
                {activityOpen === l.id ? "Hide site activity" : "Site activity"}
              </button>
            </div>
            {activityOpen === l.id && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10, display: "grid", gap: 12 }}>
                {!activityByLoc[l.id] && <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>Loading site activity…</p>}
                {activityByLoc[l.id]?.shifts && (
                  <div>
                    <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "0.92rem" }}>
                      Upcoming shifts: {activityByLoc[l.id].shifts.length === 25 ? "25+" : activityByLoc[l.id].shifts.length}
                    </p>
                    {activityByLoc[l.id].shifts.length === 0 && <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>No upcoming shifts scheduled at this site.</p>}
                    {activityByLoc[l.id].shifts.slice(0, 3).map((s) => (
                      <p key={s.id} style={{ margin: "2px 0", fontSize: "0.9rem" }}>
                        {new Date(`${s.shift_date}T12:00:00`).toLocaleDateString()} • {String(s.start_time || "").slice(0, 5)}–{String(s.end_time || "").slice(0, 5)} • {s.who}
                        {(s.position_name || s.department) ? ` • Working as: ${s.position_name || s.department}` : ""}
                      </p>
                    ))}
                    <a href={`/app/${company.id}/schedule`} style={{ fontSize: "0.9rem", color: "var(--brand-deep)", fontWeight: 700 }}>Open the schedule →</a>
                  </div>
                )}
                {activityByLoc[l.id]?.workOrders && (
                  <div>
                    <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "0.92rem" }}>
                      Work orders still open: {activityByLoc[l.id].workOrders.length === 25 ? "25+" : activityByLoc[l.id].workOrders.length}
                    </p>
                    {activityByLoc[l.id].workOrders.slice(0, 3).map((o) => (
                      <p key={o.id} style={{ margin: "2px 0", fontSize: "0.9rem" }}>
                        <a href={`/app/${company.id}/work-orders/${o.id}`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>{o.title}</a>
                        {" "}• {o.status === "in_progress" ? "In progress" : "Open"} • {o.priority} priority
                        {o.due_date ? ` • Due ${new Date(`${o.due_date}T12:00:00`).toLocaleDateString()}` : ""}
                      </p>
                    ))}
                  </div>
                )}
                {activityByLoc[l.id]?.inspections && (
                  <div>
                    <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "0.92rem" }}>
                      Inspections: {activityByLoc[l.id].inspections.length === 25 ? "25+" : activityByLoc[l.id].inspections.length}
                    </p>
                    {activityByLoc[l.id].inspections.length === 0 && <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>No inspections recorded at this site yet.</p>}
                    {activityByLoc[l.id].inspections[0] && (
                      <p style={{ margin: "2px 0", fontSize: "0.9rem" }}>
                        Most recent:{" "}
                        <a href={`/app/${company.id}/inspections/${activityByLoc[l.id].inspections[0].id}`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
                          {new Date(`${activityByLoc[l.id].inspections[0].inspection_date}T12:00:00`).toLocaleDateString()}
                        </a>
                        {activityByLoc[l.id].inspections[0].score != null ? ` • Score ${activityByLoc[l.id].inspections[0].score} / 5` : ""}
                      </p>
                    )}
                  </div>
                )}
                {activityByLoc[l.id]?.bidCounts && (
                  <div>
                    <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "0.92rem" }}>Bids for this site</p>
                    <p style={{ margin: "2px 0", fontSize: "0.9rem" }}>
                      Accepted: {activityByLoc[l.id].bidCounts.accepted} • Sent: {activityByLoc[l.id].bidCounts.sent} • Draft: {activityByLoc[l.id].bidCounts.draft} • Declined: {activityByLoc[l.id].bidCounts.declined}
                    </p>
                  </div>
                )}
                {activityByLoc[l.id]?.invoices && (
                  <div>
                    <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "0.92rem" }}>Invoices for this site</p>
                    {activityByLoc[l.id].invoices.count === 0 && <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>No invoices issued to this site yet.</p>}
                    {activityByLoc[l.id].invoices.count > 0 && (
                      <p style={{ margin: "2px 0", fontSize: "0.9rem" }}>
                        {activityByLoc[l.id].invoices.count} issued • Invoiced ${activityByLoc[l.id].invoices.invoiced.toFixed(2)} • Still owed ${activityByLoc[l.id].invoices.owed.toFixed(2)}
                        {activityByLoc[l.id].invoices.latest && (
                          <> • Latest: <a href={`/app/${company.id}/invoices/${activityByLoc[l.id].invoices.latest.id}`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>#{activityByLoc[l.id].invoices.latest.invoice_number}</a></>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
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

const brandButton = {
  padding: "12px 20px",
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
