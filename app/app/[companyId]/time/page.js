"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUse } from "../../../../lib/tiers";
import { isManagerRole, isSupervisorRole } from "../../../../lib/roles";
import EmergencyButton from "../../../../components/EmergencyButton";
import EndShiftProof from "../../../../components/EndShiftProof";

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

// Distance in meters between two GPS points.
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default function TimeClockPage() {
  const { company, member, loading } = useCompany();
  const [open, setOpen] = useState(null);
  const [entries, setEntries] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [filter, setFilter] = useState("everyone");
  const [onClock, setOnClock] = useState([]);
  const [teamOffClock, setTeamOffClock] = useState([]);
  const [busy, setBusy] = useState(false);
  // Hats the member can clock in as (e.g. Cleaner vs Manager). Shown only
  // when they have more than one pay rate set.
  const [hats, setHats] = useState([]);
  const [clockInHat, setClockInHat] = useState("");
  const proofRef = useRef(null);

  const isManager = isManagerRole(member?.role);
  // Supervisors and up see the team's entries and who's on the clock.
  const canViewTeam = isSupervisorRole(member?.role);
  const geoEnforced = canUse(company?.effectiveTier || company?.tier, "geofencing");

  // Employees can only ever see their own entries.
  useEffect(() => {
    if (!loading && member && !canViewTeam) setFilter("mine");
  }, [loading, member, canViewTeam]);

  async function load() {
    const sb = supabase();
    // Which hats can this member clock in as? (titles only, never pay rates)
    try {
      const { data: { session } } = await sb.auth.getSession();
      const hr = await fetch(`/api/time/hats?companyId=${company.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const hj = await hr.json().catch(() => ({}));
      const got = Array.isArray(hj.hats) ? hj.hats : [];
      setHats(got);
      if (got.length > 0 && !got.some((h) => h.key === clockInHat)) {
        setClockInHat(got[0].key);
      }
    } catch (e) {
      /* hats unavailable — clock in normally */
    }
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
    if (!canViewTeam || filter === "mine") q = q.eq("member_id", member.id);
    const { data } = await q;
    setEntries(data || []);

    const { data: locs } = await sb.from("locations").select("id, name, lat, lng, geofence_radius_m").eq("company_id", company.id).order("name");
    setLocations(locs || []);

    // Supervisors and up see who's on the clock right now.
    if (canViewTeam) {
      const { data: openTeam } = await sb
        .from("time_entries")
        .select("*, locations(name), company_members(display_name)")
        .eq("company_id", company.id)
        .is("clock_out", null)
        .order("clock_in", { ascending: false });
      setOnClock(openTeam || []);
      // Team members NOT on the clock (for manager clock-in).
      if (isManager) {
        const onClockIds = new Set((openTeam || []).map((e) => e.member_id));
        const { data: allMembers } = await sb
          .from("company_members")
          .select("id, display_name")
          .eq("company_id", company.id)
          .order("display_name");
        setTeamOffClock((allMembers || []).filter((m) => !onClockIds.has(m.id) && m.id !== member.id));
      } else {
        setTeamOffClock([]);
      }
    } else {
      setOnClock([]);
      setTeamOffClock([]);
    }
  }

  useEffect(() => {
    if (!loading && company && member) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member, filter]);

  // Warn before leaving while proof uploads are still in flight.
  // Once uploads finish, hasPendingUploads() is false and no warning shows.
  useEffect(() => {
    const handler = (e) => {
      if (proofRef.current?.hasPendingUploads()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  async function api(path, body) {
    const { data: { session } } = await supabase().auth.getSession();
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  async function clockIn() {
    if (!locationId) {
      alert("Pick the location you're working at first.");
      return;
    }
    setBusy(true);
    try {
      // Fast client-side pre-check for a friendly message; the server
      // re-checks the geofence authoritatively before writing anything.
      const loc = locations.find((l) => l.id === locationId);
      const fence = geoEnforced && loc && loc.lat != null && loc.lng != null
        ? { lat: parseFloat(loc.lat), lng: parseFloat(loc.lng), radius: parseInt(loc.geofence_radius_m, 10) || 100, name: loc.name }
        : null;
      const pos = await getPosition();
      if (fence) {
        if (!pos) throw new Error(`Could not get your location. You must be at ${fence.name} to clock in — allow location access and try again.`);
        const dist = haversineMeters(pos.lat, pos.lng, fence.lat, fence.lng);
        if (dist > fence.radius) {
          throw new Error(`You must be at ${fence.name} to clock in. You're about ${Math.round(dist)}m away (limit: ${fence.radius}m).`);
        }
      }
      await api("/api/time/clock-in", {
        companyId: company.id,
        locationId,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        clockInRole: hats.length > 1 ? clockInHat : null,
      });
      await load();
    } catch (e) {
      alert("Clock-in failed: " + e.message);
    }
    setBusy(false);
  }

  async function clockOut() {
    setBusy(true);
    try {
      const pos = await getPosition();
      // Phase 1: save the clock-out timestamp IMMEDIATELY (idempotent).
      // Proof uploads finish after — the timestamp never waits on them.
      await api("/api/time/clock-out", {
        companyId: company.id,
        entryId: open.id,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
      });
      // Phase 2: wait for any in-flight proof uploads, then finalize.
      if (proofRef.current?.hasPendingUploads()) {
        setBusy(true);
        try {
          await proofRef.current.waitForUploads();
        } catch {}
      }
      try {
        await api("/api/time/clock-out/complete", {
          companyId: company.id,
          entryId: open.id,
        });
      } catch {}
      await load();
    } catch (e) {
      alert("Clock-out failed: " + e.message);
    }
    setBusy(false);
  }

  async function managerClock(targetMemberId, action) {
    if (!confirm(action === "in" ? "Clock this person in?" : "Clock this person out?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/time/manager-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: company.id,
          target_member_id: targetMemberId,
          action,
          actor_member_id: member.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await load();
    } catch (e) {
      alert("Failed: " + e.message);
    }
    setBusy(false);
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
              {new Date(open.clock_in).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
              {open.clock_in_role ? ` (${open.clock_in_role === "manager" ? "Manager" : "Cleaner"})` : ""}
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
            {(() => {
              const sel = locations.find((l) => l.id === locationId);
              const fenced = geoEnforced && sel && sel.lat != null && sel.lng != null;
              return fenced ? (
                <p style={{ color: "var(--brand-deep)", fontSize: "0.88rem", fontWeight: 700, margin: "0 0 10px" }}>
                  📍 Geofence active — you must be within {parseInt(sel.geofence_radius_m, 10) || 100}m of {sel.name} to clock in.
                </p>
              ) : null;
            })()}
            <br />
            {hats.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 800, marginBottom: 8 }}>Clock in as:</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  {hats.map((h) => (
                    <button
                      key={h.key}
                      type="button"
                      onClick={() => setClockInHat(h.key)}
                      style={{
                        ...bigButton,
                        width: "auto",
                        padding: "10px 22px",
                        background: clockInHat === h.key ? "var(--brand-deep)" : "#e8e2d5",
                        color: clockInHat === h.key ? "#fff" : "var(--brand-deep)",
                      }}
                    >
                      {h.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={clockIn} disabled={busy} style={bigButton}>
              {busy ? "Working…" : "Clock in"}
            </button>
            <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 10 }}>
              Your phone's location is saved with each clock-in and clock-out.
            </p>
          </div>
        )}
      </section>

      {open && (
        <section id="end-shift-proof" className="panel" style={{ padding: 20, margin: "18px 0", scrollMarginTop: 90 }}>
          <h3 style={{ margin: "0 0 4px" }}>📋 End of shift</h3>
          <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "0 0 14px" }}>
            Record your walkthrough and book photo before you clock out — no need to hunt through tabs.
          </p>
          <EndShiftProof
            ref={proofRef}
            companyId={company.id}
            memberId={member.id}
            entryId={open.id}
            locationId={open.location_id}
            locationName={open.locations?.name}
          />
        </section>
      )}

      <section className="panel" style={{ padding: 20, margin: "18px 0", textAlign: "center", border: "2px solid #b3261e" }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Something wrong right now?</div>
        <EmergencyButton />
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 0 }}>
          Instantly buzzes the owner or your managers.
        </p>
      </section>

      {canViewTeam && (
        <section className="panel" style={{ padding: 20, margin: "18px 0" }}>
          <h3 style={{ margin: "0 0 10px" }}>Who's working now</h3>
          {onClock.length === 0 ? (
            <p style={{ color: "var(--muted)", margin: 0 }}>Nobody is clocked in right now.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {onClock.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#1e8e4d", fontSize: "1.2rem" }}>🟢</span>
                  <div style={{ flex: 1 }}>
                    <strong>{e.company_members?.display_name || "Unknown"}</strong>
                    <span style={{ color: "var(--muted)" }}>
                      {" "}• {e.locations?.name || "No location"} • since{" "}
                      {new Date(e.clock_in).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
                    </span>
                  </div>
                  {isManager && e.member_id !== member.id && (
                    <button onClick={() => managerClock(e.member_id, "out")}
                      disabled={busy}
                      style={{ border: "1px solid #f0c9c4", background: "#fff", color: "#b3261e", borderRadius: 999, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}>
                      Clock out
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {isManager && teamOffClock.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: "0.95rem", color: "var(--muted)" }}>Off the clock</h4>
              <div style={{ display: "grid", gap: 8 }}>
                {teamOffClock.map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "var(--muted)", fontSize: "1.2rem" }}>⚪</span>
                    <div style={{ flex: 1 }}><strong>{m.display_name || "Unknown"}</strong></div>
                    <button onClick={() => managerClock(m.id, "in")}
                      disabled={busy}
                      style={{ border: "1px solid #a8dab5", background: "#e6f4ea", color: "#137333", borderRadius: 999, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}>
                      Clock in
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Recent entries</h3>
        {canViewTeam && (
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
                {e.clock_in_role ? ` • ${e.clock_in_role === "manager" ? "Manager" : "Cleaner"}` : ""}
              </span>
              <p style={{ margin: "6px 0 0" }}>
                {new Date(e.clock_in).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })} →{" "}
                {e.clock_out
                  ? new Date(e.clock_out).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
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
