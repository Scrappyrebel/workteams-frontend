"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUseWithRole } from "../../../../lib/tiers";
import { isManagerRole, isSupervisorRole } from "../../../../lib/roles";
import EmergencyButton from "../../../../components/EmergencyButton";
import EndShiftProof from "../../../../components/EndShiftProof";
import { chooseAssignedShift, shiftBounds } from "../../../../lib/attendance-shifts.mjs";
import { dateInTz } from "../../../../lib/dates";
import { proofRequired } from "../../../../lib/proof-policy";

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

function chicagoDate(value) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const p = (part) => parts.find((x) => x.type === part)?.value;
  return `${p("year")}-${p("month")}-${p("day")}`;
}

// "Working as" label for the who's-working roster (migration 079,
// display only): the department/position stored on the shift itself.
// position_name wins when a shift ever carries one; WorkTeams shifts
// store the choice in department. Null on older shifts — no label.
function workingAsLabel(shift) {
  const value = shift?.position_name || shift?.department;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Pick the shift an unlinked clock-in belongs to, for the roster label
// only. Prefer a shift whose scheduled window contains the clock-in;
// otherwise the earliest shift that day. Same-location shifts win ties.
// If the shifts that could match disagree on the label, return null —
// never guess a wrong label.
function chooseRosterShift(entry, candidates, timeZone) {
  if (!entry || !candidates?.length) return null;
  const at = new Date(entry.clock_in).getTime();
  if (!Number.isFinite(at)) return null;
  const rank = (s) => (entry.location_id && s.location_id !== entry.location_id ? 1 : 0);
  const byRankThenStart = (a, b) =>
    rank(a) - rank(b) || String(a.start_time || "").localeCompare(String(b.start_time || ""));
  const decide = (pool) => {
    if (!pool.length) return null;
    const sorted = [...pool].sort(byRankThenStart);
    const best = sorted[0];
    const rivals = sorted.filter(
      (s) => rank(s) === rank(best) && String(s.start_time || "") === String(best.start_time || "")
    );
    const labels = [...new Set(rivals.map(workingAsLabel).filter(Boolean))];
    if (labels.length > 1) return null;
    if (labels.length === 1) return rivals.find((s) => workingAsLabel(s)) || best;
    return best;
  };
  const containing = candidates.filter((s) => {
    if (!s.shift_date || !s.start_time || !s.end_time) return false;
    const { start, end } = shiftBounds(s, timeZone);
    return at >= start.getTime() && at <= end.getTime();
  });
  if (containing.length) {
    let pool = containing;
    if (entry.location_id) {
      const atLocation = pool.filter((s) => s.location_id === entry.location_id);
      if (atLocation.length) pool = atLocation;
    }
    // Overlapping shifts that disagree on the label are ambiguous —
    // show nothing rather than guess.
    const labels = [...new Set(pool.map(workingAsLabel).filter(Boolean))];
    if (labels.length > 1) return null;
    return decide(pool);
  }
  return decide(candidates);
}

export default function TimeClockPage() {
  const { company, member, loading } = useCompany();
  const [open, setOpen] = useState(null);
  const [entries, setEntries] = useState([]);
  const [locations, setLocations] = useState([]);
  const [myShifts, setMyShifts] = useState([]);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [shiftError, setShiftError] = useState("");
  const [shiftNotice, setShiftNotice] = useState("");
  const [locationId, setLocationId] = useState("");
  const [filter, setFilter] = useState("everyone");
  const [onClock, setOnClock] = useState([]);
  // Roster "Working as" labels by time entry id (079, display only).
  const [workingAsByEntry, setWorkingAsByEntry] = useState({});
  const [teamOffClock, setTeamOffClock] = useState([]);
  const [busy, setBusy] = useState(false);
  // Hats the member can clock in as (e.g. Cleaner vs Manager). Shown only
  // when they have more than one pay rate set.
  const [hats, setHats] = useState([]);
  const [clockInHat, setClockInHat] = useState("");
  const proofRef = useRef(null);
  const clockedOutEntryIdRef = useRef(null);
  const [lastShiftLength, setLastShiftLength] = useState(null);
  const [proofEntry, setProofEntry] = useState(null);
  const [proofNotice, setProofNotice] = useState("");
  // Employee proof overrides by time entry id (shift_proof_overrides,
  // migration 052) — shown on each entry card so an override is never
  // mistaken for real proof.
  const [overridesByEntry, setOverridesByEntry] = useState({});

  const isManager = isManagerRole(member?.role);
  // Supervisors and up see the team's entries and who's on the clock.
  const canViewTeam = isSupervisorRole(member?.role);
  const geoEnforced = canUseWithRole(company?.effectiveTier || company?.tier, "geofencing", member?.role);

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

    // Overrides for the entries on screen. Tolerant: before migration 052
    // runs, the table is absent — keep the plain entry list, no crash.
    try {
      const entryIds = (data || []).map((e) => e.id);
      if (entryIds.length) {
        const { data: ovs, error: ovError } = await sb
          .from("shift_proof_overrides")
          .select("id, time_entry_id, proof_kind, reason, created_at")
          .in("time_entry_id", entryIds)
          .order("created_at", { ascending: true });
        if (!ovError) {
          const map = {};
          for (const o of ovs || []) {
            (map[o.time_entry_id] = map[o.time_entry_id] || []).push(o);
          }
          setOverridesByEntry(map);
        }
      } else {
        setOverridesByEntry({});
      }
    } catch { /* overrides unavailable — entries still render */ }

    const { data: locs } = await sb.from("locations").select("id, name, lat, lng, geofence_radius_m").eq("company_id", company.id).order("name");
    setLocations(locs || []);

    // Show ONLY this signed-in member's assigned locations. The clock-in API
    // repeats this check server-side, so a stale phone or edited request
    // cannot use Kristin's schedule for another person.
    setShiftLoading(true);
    const now = new Date();
    const today = chicagoDate(now);
    const yesterday = chicagoDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const { data: assigned, error: scheduleError } = await sb.from("shifts")
      .select("id,location_id,shift_date,start_time,end_time")
      .eq("company_id", company.id)
      .eq("member_id", member.id)
      .in("shift_date", [yesterday, today]);
    if (scheduleError) {
      setShiftError("Could not check your assigned shifts. Tap Refresh my shifts.");
      setShiftNotice("");
      setMyShifts([]);
      setLocationId("");
    } else {
      const tz = company.timezone || "America/Chicago";
      const relevant = (assigned || []).filter((shift) =>
        shift.shift_date === today ||
        (shift.shift_date === yesterday && shift.start_time > shift.end_time)
      );
      const valid = relevant.filter((shift) =>
        !!chooseAssignedShift([shift], now, new Set(), tz)
      );
      setShiftError("");
      setShiftNotice(relevant.length > 0 && valid.length === 0
        ? "Your scheduled shift's 30-minute clock-in window has passed. Ask management to authorize clock-in."
        : "");
      setMyShifts(valid);
      setLocationId((id) => valid.some((shift) => shift.location_id === id) ? id : "");
    }
    setShiftLoading(false);

    // Supervisors and up see who's on the clock right now.
    if (canViewTeam) {
      const { data: openTeam } = await sb
        .from("time_entries")
        .select("*, locations(name), company_members(display_name)")
        .eq("company_id", company.id)
        .is("clock_out", null)
        .order("clock_in", { ascending: false });
      setOnClock(openTeam || []);
      // "Working as" labels for the roster (079, display only — this
      // never writes anything). A normal clock-in is linked to its
      // shift (time_entries.shift_id, set by the clock-in route), so
      // the label comes straight from that shift. Entries with no link
      // (manager overrides, older rows) fall back to the member's
      // shifts on the clock-in day. Any failure leaves the roster
      // exactly as before, with no labels.
      try {
        const team = openTeam || [];
        const tz = company.timezone || "America/Chicago";
        const shiftCols = "id, member_id, location_id, shift_date, start_time, end_time, department, position_name";
        const baseCols = "id, member_id, location_id, shift_date, start_time, end_time";
        const fetchShifts = async (build) => {
          let res = await build(shiftCols);
          if (res.error && /department|position_name/i.test(res.error.message || "")) {
            res = await build(baseCols);
          }
          return res;
        };
        const linkedById = {};
        const linkedIds = [...new Set(team.map((e) => e.shift_id).filter(Boolean))];
        if (linkedIds.length) {
          const { data: linked } = await fetchShifts((cols) => sb
            .from("shifts")
            .select(cols)
            .eq("company_id", company.id)
            .in("id", linkedIds));
          for (const s of linked || []) linkedById[s.id] = s;
        }
        const unlinked = team.filter((e) => !e.shift_id);
        let dayShifts = [];
        if (unlinked.length) {
          const memberIds = [...new Set(unlinked.map((e) => e.member_id))];
          const dates = [...new Set(unlinked.map((e) => dateInTz(new Date(e.clock_in), tz)))];
          const { data: ds } = await fetchShifts((cols) => sb
            .from("shifts")
            .select(cols)
            .eq("company_id", company.id)
            .in("member_id", memberIds)
            .in("shift_date", dates)
            .order("start_time", { ascending: true }));
          dayShifts = ds || [];
        }
        const labels = {};
        for (const e of team) {
          let shift = e.shift_id ? linkedById[e.shift_id] || null : null;
          if (!e.shift_id) {
            const day = dateInTz(new Date(e.clock_in), tz);
            shift = chooseRosterShift(
              e,
              dayShifts.filter((s) => s.member_id === e.member_id && s.shift_date === day),
              tz
            );
          }
          const label = workingAsLabel(shift);
          if (label) labels[e.id] = label;
        }
        setWorkingAsByEntry(labels);
      } catch { /* labels are decoration — the roster still renders */ }
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
      setWorkingAsByEntry({});
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
      if (proofRef.current?.hasPendingUploads() || proofRef.current?.hasUnsavedRecording?.()) {
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
    if (shiftLoading || shiftError || !myShifts.some((s) => s.location_id === locationId)) {
      alert("You must have your own assigned shift at this location today. Tap Refresh my shifts or contact management.");
      return;
    }
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
    setLastShiftLength(null);
    try {
      const pos = await getPosition();
      // Phase 1: save the clock-out timestamp IMMEDIATELY (idempotent).
      // Proof uploads finish after — the timestamp never waits on them.
      const res1 = await api("/api/time/clock-out", {
        companyId: company.id,
        entryId: open.id,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
      });
      clockedOutEntryIdRef.current = open.id;
      // Show how long the shift took, from the saved timestamps.
      const entry = res1?.entry;
      if (entry?.clock_in && entry?.clock_out) {
        const ms = new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime();
        if (ms > 0) {
          const h = Math.floor(ms / 3600000);
          const m = Math.round((ms % 3600000) / 60000);
          setLastShiftLength(h > 0 ? `${h} hr ${m} min` : `${m} min`);
        }
      }
      // Timestamp saved; never wait on an upload to finish clock-out.
      // Keep the proof component mounted when there is an in-flight
      // upload or failed local recording, so the employee can retry it.
      const awaitingProof = proofRef.current?.hasPendingUploads() ||
        proofRef.current?.hasUnsavedRecording?.();
      setProofEntry(open);
      if (awaitingProof) {
        setProofNotice("You are clocked out. The walkthrough is still uploading or needs Retry. Keep this screen open until it says uploaded.");
      } else {
        setProofNotice("Clock-out time saved. Checking shift proof…");
      }
      // Do not clear upload_pending while a video/photo is being uploaded
      // or retained for retry, even if company proof requirements are off.
      if (!awaitingProof) {
        try {
          await api("/api/time/clock-out/complete", {
            companyId: company.id,
            entryId: open.id,
          });
          const confirmed = proofRef.current?.hasVerifiedVideo?.();
          setProofEntry(null);
          setProofNotice(confirmed
            ? "Clock-out saved. Walkthrough video uploaded and verified."
            : "Clock-out saved. No walkthrough video was saved for this shift.");
        } catch (err) {
          setProofNotice(`Clocked out successfully. Shift proof is still pending: ${err.message}.`);
        }
      }
      await load();
    } catch (e) {
      alert("Clock-out failed: " + e.message);
    }
    setBusy(false);
  }

  async function finalizeProofUpload(entryId) {
    // A video may upload before the worker clocks out. Do not mark the
    // timesheet finished just because one proof file was saved.
    if (clockedOutEntryIdRef.current !== entryId) return;
    // Video/photo can finish AFTER clock-out. Never mark the proof complete
    // while another recorded item still needs uploading or retrying.
    if (proofRef.current?.hasPendingUploads() || proofRef.current?.hasUnsavedRecording?.()) {
      setProofNotice("Clock-out saved. One or more recordings or photos are still uploading.");
      return;
    }
    try {
      const result = await api("/api/time/clock-out/complete", {
        companyId: company.id,
        entryId,
      });
      if (result?.ok) {
        const confirmed = proofRef.current?.hasVerifiedVideo?.();
        setProofEntry(null);
        setProofNotice(confirmed
          ? "Clock-out saved. Walkthrough video uploaded and verified."
          : "Clock-out saved. No walkthrough video was saved for this shift.");
      }
    } catch (err) {
      setProofNotice(`Clock-out saved, but shift proof still needs attention: ${err.message}`);
    }
  }

  async function managerClock(targetMemberId, action) {
    if (!confirm(action === "in"
      ? "MANAGER OVERRIDE: Clock this person in without their own scheduled shift?"
      : "MANAGER OVERRIDE: Clock this person out?")) return;
    const reason = action === "in"
      ? window.prompt("Required: Why are you authorizing this unscheduled clock-in?")
      : "Manager requested clock-out";
    if (reason === null) return;
    if (action === "in" && !reason.trim()) {
      alert("Enter a reason for the unscheduled clock-in.");
      return;
    }
    setBusy(true);
    try {
      const { data: { session } } = await supabase().auth.getSession();
      if (!session?.access_token) throw new Error("Sign in as a manager before using overrides.");
      const res = await fetch("/api/time/manager-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          company_id: company.id,
          target_member_id: targetMemberId,
          action,
          reason: String(reason || "").trim(),
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
            {lastShiftLength && (
              <p style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--brand-deep)" }}>
                ✅ Clocked out — that shift took {lastShiftLength}.
              </p>
            )}
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
              disabled={shiftLoading || !!shiftError || !myShifts.length}
              style={{ ...input, maxWidth: 420, marginBottom: 14 }}>
              <option value="">Choose your scheduled work location…</option>
              {locations.filter((l) => myShifts.some((sh) => sh.location_id === l.id))
                .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {shiftLoading && <p role="status">Checking your assigned shifts…</p>}
            {shiftError && <p role="alert" style={{ color: "var(--danger)" }}>{shiftError}</p>}
            {!shiftLoading && !shiftError && myShifts.length === 0 && (
              <p role="status" style={{ fontWeight: 700 }}>
                {shiftNotice || "No shift assigned to your account today. Clock-in is unavailable. Another employee's shifts do not count."}
              </p>
            )}
            <button type="button" onClick={() => void load()} disabled={busy || shiftLoading}
              style={{ marginBottom: 12 }}>↻ Refresh my shifts</button>
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
            <button onClick={clockIn} disabled={busy || shiftLoading || !!shiftError || !locationId || !myShifts.some((s) => s.location_id === locationId)} style={bigButton}>
              {busy ? "Working…" : "Clock in"}
            </button>
            <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 10 }}>
              Your phone's location is saved with each clock-in and clock-out.
            </p>
          </div>
        )}
      </section>

      {proofNotice && <p role="status" style={{ fontWeight: 700, padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>{proofNotice}</p>}

      {(open || proofEntry) && (
        <section id="end-shift-proof" className="panel" style={{ padding: 20, margin: "18px 0", scrollMarginTop: 90 }}>
          <h3 style={{ margin: "0 0 4px" }}>📋 End of shift</h3>
          <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "0 0 14px" }}>
            Record your walkthrough and book photo before you clock out — no need to hunt through tabs.
            {(proofRequired(company, "walkthrough") || proofRequired(company, "book")) &&
              " Required proof must be uploaded — or an override reason saved — before clock-out can finish."}
          </p>
          <EndShiftProof
            ref={proofRef}
            companyId={company.id}
            memberId={member.id}
            entryId={(open || proofEntry).id}
            locationId={(open || proofEntry).location_id}
            locationName={(open || proofEntry).locations?.name}
            onProofUploaded={finalizeProofUpload}
            enableVideo={company.enable_shift_videos !== false}
            enableBook={company.enable_comm_book !== false}
            requireVideo={proofRequired(company, "walkthrough")}
            requireBook={proofRequired(company, "book")}
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
                      {" "}• {e.locations?.name || "No location"}
                      {workingAsByEntry[e.id] ? ` • Working as: ${workingAsByEntry[e.id]}` : ""} • since{" "}
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
              {(overridesByEntry[e.id]?.length > 0 || e.proof_override_used) && (
                <div style={{ marginTop: 8, padding: "8px 10px", background: "#fff4e5", border: "1px solid #e0a458", borderRadius: 8 }}>
                  <strong style={{ fontSize: "0.9rem" }}>⚠ Proof override used — not real proof</strong>
                  {(overridesByEntry[e.id] || []).map((o) => (
                    <p key={o.id} style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>
                      {o.proof_kind === "walkthrough" ? "📹 Walkthrough video" : "📷 Book photo"}
                      {" — “"}{o.reason}{"” · "}
                      {new Date(o.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                  ))}
                  {!overridesByEntry[e.id]?.length && (
                    <p style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>See Shift Videos / Communication Book for the reason.</p>
                  )}
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
