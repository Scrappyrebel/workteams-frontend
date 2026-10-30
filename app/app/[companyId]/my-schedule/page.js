"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import OtherCompaniesNotice from "../../../../components/OtherCompaniesNotice";
import { chicagoToday, formatTime12h } from "../../../../lib/dates";

// My Schedule: employee self-service for (1) their own upcoming shifts,
// (2) weekly availability, (3) time-off and shift-swap requests.
// Availability and requests live in migration 069. When that migration
// has not been run yet, each section says so plainly instead of failing —
// the app never locks anyone out over a missing table.

const DAYS = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
];

function tableMissing(error) {
  if (!error) return false;
  const msg = String(error.message || "");
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table|schema cache/i.test(msg)
  );
}

function fmtDay(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

// "Working as" label (migration 079, display only): the department /
// position stored on the shift itself — the same label the who's-working
// roster prints for managers. position_name wins when a shift carries
// one; null on shifts without either, and then no label shows.
function workingAsLabel(shift) {
  const value = shift?.position_name || shift?.department;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Scheduled length from a shift's start/end times ("6 hrs", "6.5 hrs").
// An end at or before the start means the shift runs past midnight.
function shiftLength(start, end) {
  const mins = (t) => {
    const [h, m] = String(t || "").slice(0, 5).split(":").map(Number);
    return Number.isFinite(h) ? h * 60 + (m || 0) : null;
  };
  const a = mins(start);
  let b = mins(end);
  if (a === null || b === null) return null;
  if (b <= a) b += 24 * 60;
  const hrs = (b - a) / 60;
  return `${Number.isInteger(hrs) ? hrs : hrs.toFixed(1)} hrs`;
}

const STATUS_STYLE = {
  pending: { background: "#fef3c7", color: "#92400e" },
  approved: { background: "#e6f4ea", color: "#1a7f37" },
  denied: { background: "#fdecea", color: "#b3261e" },
  cancelled: { background: "#eceff1", color: "#546e7a" },
};

function StatusChip({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span style={{ ...s, display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 800, textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

export default function MySchedulePage() {
  const { company, member, loading } = useCompany();
  const [unavailable, setUnavailable] = useState(false); // migration 069 not run yet

  // Availability
  const [week, setWeek] = useState(() =>
    DAYS.map((d) => ({ ...d, available: true, start_time: "", end_time: "", note: "" }))
  );
  const [savingWeek, setSavingWeek] = useState(false);
  const [weekSaved, setWeekSaved] = useState(false);

  // Requests
  const [myRequests, setMyRequests] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [askedSwaps, setAskedSwaps] = useState([]);
  const [swapEvents, setSwapEvents] = useState({});
  const [shiftInfo, setShiftInfo] = useState({});
  const [myShifts, setMyShifts] = useState([]);
  const [teammates, setTeammates] = useState([]);
  const [reqType, setReqType] = useState("time_off");
  const [form, setForm] = useState({ start_date: "", end_date: "", shift_id: "", swap_with: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);

  async function notify(requestId, event) {
    try {
      const { data: { session } } = await supabase().auth.getSession();
      await fetch("/api/schedule-requests/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ companyId: company.id, requestId, event }),
      });
    } catch {
      // Notifications are best-effort; the request itself is what matters.
    }
  }

  async function loadShiftInfo(requests) {
    const ids = [...new Set(requests.map((r) => r.shift_id).filter(Boolean))];
    if (ids.length === 0) return;
    // department (079) is probed: until that migration runs, shift
    // labels simply show without it.
    let { data } = await supabase()
      .from("shifts")
      .select("id, shift_date, start_time, end_time, department, locations(name)")
      .in("id", ids);
    if (!data) {
      ({ data } = await supabase()
        .from("shifts")
        .select("id, shift_date, start_time, end_time, locations(name)")
        .in("id", ids));
    }
    const map = {};
    for (const s of data || []) map[s.id] = s;
    setShiftInfo((prev) => ({ ...prev, ...map }));
  }

  async function load() {
    const sb = supabase();

    const av = await sb
      .from("employee_availability")
      .select("day_of_week, available, start_time, end_time, note")
      .eq("company_id", company.id)
      .eq("member_id", member.id);
    if (av.error) {
      if (tableMissing(av.error)) {
        setUnavailable(true);
        return;
      }
    } else if (av.data && av.data.length > 0) {
      const byDow = {};
      for (const row of av.data) byDow[row.day_of_week] = row;
      setWeek(
        DAYS.map((d) => {
          const row = byDow[d.dow];
          return row
            ? { ...d, available: row.available, start_time: row.start_time?.slice(0, 5) || "", end_time: row.end_time?.slice(0, 5) || "", note: row.note || "" }
            : { ...d, available: true, start_time: "", end_time: "", note: "" };
        })
      );
    }

    const mine = await sb
      .from("schedule_requests")
      .select("id, request_type, shift_id, swap_with_member_id, swap_status, start_date, end_date, reason, status, decision_note, created_at")
      .eq("company_id", company.id)
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!mine.error) {
      setMyRequests(mine.data || []);
      loadShiftInfo(mine.data || []);
    }

    const inb = await sb
      .from("schedule_requests")
      .select("id, request_type, shift_id, member_id, swap_status, reason, status, created_at")
      .eq("company_id", company.id)
      .eq("swap_with_member_id", member.id)
      .eq("swap_status", "pending_counterpart")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (!inb.error) {
      setIncoming(inb.data || []);
      loadShiftInfo(inb.data || []);
    }

    // Every swap I was ever asked about, so I can see how the ones I
    // answered ended up — not just the ones still waiting on me.
    const asked = await sb
      .from("schedule_requests")
      .select("id, request_type, shift_id, member_id, swap_status, reason, status, decision_note, created_at")
      .eq("company_id", company.id)
      .eq("swap_with_member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!asked.error) {
      setAskedSwaps(asked.data || []);
      loadShiftInfo(asked.data || []);
    }

    // Swap step history (migration 074's audit trail). Probed like
    // everything else on this page: until the events table exists,
    // requests simply show without their step trail.
    const reqIds = [...new Set([...(mine.data || []), ...(asked.data || [])].map((r) => r.id))];
    if (reqIds.length > 0) {
      const ev = await sb
        .from("schedule_request_events")
        .select("request_id, event, created_at")
        .in("request_id", reqIds)
        .order("created_at", { ascending: true });
      if (!ev.error) {
        const byReq = {};
        for (const e of ev.data || []) (byReq[e.request_id] ||= []).push(e);
        setSwapEvents(byReq);
      }
    }

    const today = chicagoToday(company?.timezone);
    // department + position_name (079) ride along when the columns
    // exist; until that migration runs, my shifts load exactly as
    // before — each retry below drops one probed column.
    const fetchMine = (cols) => sb
      .from("shifts")
      .select(cols)
      .eq("company_id", company.id)
      .eq("member_id", member.id)
      .gte("shift_date", today)
      .order("shift_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(50);
    let up = await fetchMine("id, shift_date, start_time, end_time, department, position_name, locations(name)");
    if (up.error && /position_name/i.test(up.error.message || "")) {
      up = await fetchMine("id, shift_date, start_time, end_time, department, locations(name)");
    }
    if (up.error && /department/i.test(up.error.message || "")) {
      up = await fetchMine("id, shift_date, start_time, end_time, locations(name)");
    }
    if (!up.error) setMyShifts(up.data || []);

    const dir = await sb
      .from("team_directory")
      .select("id, display_name")
      .eq("company_id", company.id)
      .order("display_name");
    if (!dir.error) setTeammates((dir.data || []).filter((t) => t.id !== member.id));
  }

  useEffect(() => {
    if (!loading && company && member) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member]);

  async function saveAvailability(e) {
    e.preventDefault();
    setSavingWeek(true);
    setWeekSaved(false);
    const rows = week.map((d) => ({
      company_id: company.id,
      member_id: member.id,
      day_of_week: d.dow,
      available: d.available,
      start_time: d.available && d.start_time ? d.start_time : null,
      end_time: d.available && d.end_time ? d.end_time : null,
      note: d.note.trim() ? d.note.trim().slice(0, 300) : null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase()
      .from("employee_availability")
      .upsert(rows, { onConflict: "company_id,member_id,day_of_week" });
    setSavingWeek(false);
    if (error) alert("Could not save availability: " + error.message);
    else setWeekSaved(true);
  }

  async function submitRequest(e) {
    e.preventDefault();
    const reason = form.reason.trim();
    if (!reason) {
      alert("Add a short reason so your manager has the full picture.");
      return;
    }
    const payload = {
      company_id: company.id,
      member_id: member.id,
      request_type: reqType,
      reason: reason.slice(0, 500),
    };
    if (reqType === "time_off") {
      if (!form.start_date || !form.end_date) {
        alert("Pick the first and last day of the time off.");
        return;
      }
      if (form.end_date < form.start_date) {
        alert("The last day can't be before the first day.");
        return;
      }
      payload.start_date = form.start_date;
      payload.end_date = form.end_date;
    } else {
      if (!form.shift_id) {
        alert("Pick the shift you want to swap.");
        return;
      }
      if (!form.swap_with) {
        alert("Pick the teammate you're asking.");
        return;
      }
      payload.shift_id = form.shift_id;
      payload.swap_with_member_id = form.swap_with;
    }
    setSubmitting(true);
    const { data, error } = await supabase()
      .from("schedule_requests")
      .insert(payload)
      .select("id")
      .single();
    setSubmitting(false);
    if (error) {
      alert("Could not send the request: " + error.message);
      return;
    }
    setForm({ start_date: "", end_date: "", shift_id: "", swap_with: "", reason: "" });
    await load();
    if (data?.id) notify(data.id, "created");
  }

  async function cancelRequest(r) {
    const { error } = await supabase()
      .from("schedule_requests")
      .update({ status: "cancelled" })
      .eq("id", r.id);
    if (error) alert("Could not cancel: " + error.message);
    else load();
  }

  async function answerSwap(r, answer) {
    const { error } = await supabase()
      .from("schedule_requests")
      .update({ swap_status: answer })
      .eq("id", r.id);
    if (error) {
      alert("Could not save your answer: " + error.message);
      return;
    }
    await load();
    notify(r.id, "swap_answered");
  }

  function shiftLabel(shiftId) {
    const s = shiftInfo[shiftId];
    if (!s) return "a shift";
    return `${fmtDay(s.shift_date)} · ${formatTime12h(s.start_time)}–${formatTime12h(s.end_time)}${s.locations?.name ? ` · ${s.locations.name}` : ""}${s.department ? ` · ${s.department}` : ""}`;
  }

  // Step trail from migration 074's audit table, when it is there:
  // Offered → Accepted → Approved → Shift moved, each with its day.
  const EVENT_LABEL = {
    offered: "Offered",
    accepted: "Accepted",
    declined: "Declined",
    approved: "Approved",
    denied: "Denied",
    cancelled: "Cancelled",
    reassigned: "Shift moved",
  };

  function eventTrail(requestId) {
    const evs = swapEvents[requestId] || [];
    if (evs.length === 0) return null;
    return (
      <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 4 }}>
        {evs.map((e) => `${EVENT_LABEL[e.event] || e.event} · ${fmtDay(e.created_at)}`).join("  →  ")}
      </div>
    );
  }

  const nameOf = (id) => {
    if (id === member?.id) return "You";
    const t = teammates.find((x) => x.id === id);
    return t ? t.display_name : "A teammate";
  };

  if (loading || !company) return <p>Loading…</p>;

  if (unavailable) {
    return (
      <div>
        <p className="eyebrow">MY SCHEDULE</p>
        <h2 style={{ fontSize: "1.8rem" }}>My availability & requests</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p style={{ margin: 0 }}>
            Availability and time-off requests turn on with the latest WorkTeams update.
            If you need time off before then, please talk to your manager directly.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">MY SCHEDULE</p>
      <h2 style={{ fontSize: "1.8rem" }}>My availability & requests</h2>

      <section className="panel" style={{ padding: 22, marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>📅 My upcoming shifts</h3>
        {myShifts.length === 0 ? (
          <>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              You have no upcoming shifts scheduled. When your manager schedules
              you, your shifts will show up here.
            </p>
            <OtherCompaniesNotice company={company} member={member} />
          </>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {myShifts.map((s) => {
              const workingAs = workingAsLabel(s);
              const length = shiftLength(s.start_time, s.end_time);
              return (
                <div key={s.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontWeight: 700 }}>
                    {fmtDay(s.shift_date)} · {formatTime12h(s.start_time)}–{formatTime12h(s.end_time)}
                    {length && (
                      <span style={{ color: "var(--muted)", fontWeight: 400 }}> ({length})</span>
                    )}
                  </div>
                  {(s.locations?.name || workingAs) && (
                    <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 2 }}>
                      {[s.locations?.name, workingAs ? `Working as: ${workingAs}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {incoming.length > 0 && (
        <section className="panel" style={{ padding: 22, marginTop: 18, borderColor: "var(--brand)" }}>
          <h3 style={{ marginTop: 0 }}>🔁 A teammate asked you to swap</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {incoming.map((r) => (
              <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontWeight: 700 }}>{nameOf(r.member_id)} — {shiftLabel(r.shift_id)}</div>
                <div style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "4px 0 10px" }}>“{r.reason}”</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => answerSwap(r, "accepted")} style={smallButton}>I can take it</button>
                  <button onClick={() => answerSwap(r, "declined")} style={secondaryButton}>I can't</button>
                </div>
              </div>
            ))}
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 0 }}>
            Accepting tells your manager you're willing — your manager makes the actual schedule change.
          </p>
        </section>
      )}

      <section className="panel" style={{ padding: 22, marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>🗓️ My weekly availability</h3>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>
          Tell your manager the days and times you can normally work. Times are optional —
          leave them blank if you're open all day.
        </p>
        <form onSubmit={saveAvailability} style={{ display: "grid", gap: 8 }}>
          {week.map((d, i) => (
            <div key={d.dow} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, minWidth: 150 }}>
                <input
                  type="checkbox"
                  checked={d.available}
                  onChange={(e) => {
                    const next = [...week];
                    next[i] = { ...next[i], available: e.target.checked };
                    setWeek(next);
                  }}
                  style={{ width: 20, height: 20 }}
                />
                {d.label}
              </label>
              <input
                type="time"
                value={d.start_time}
                disabled={!d.available}
                onChange={(e) => {
                  const next = [...week];
                  next[i] = { ...next[i], start_time: e.target.value };
                  setWeek(next);
                }}
                style={{ ...input, width: 150 }}
                aria-label={`${d.label} earliest start`}
              />
              <span style={{ color: "var(--muted)" }}>to</span>
              <input
                type="time"
                value={d.end_time}
                disabled={!d.available}
                onChange={(e) => {
                  const next = [...week];
                  next[i] = { ...next[i], end_time: e.target.value };
                  setWeek(next);
                }}
                style={{ ...input, width: 150 }}
                aria-label={`${d.label} latest end`}
              />
              <input
                value={d.note}
                disabled={!d.available}
                onChange={(e) => {
                  const next = [...week];
                  next[i] = { ...next[i], note: e.target.value };
                  setWeek(next);
                }}
                placeholder="Note (optional)"
                maxLength={300}
                style={{ ...input, flex: 1, minWidth: 160 }}
              />
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button type="submit" disabled={savingWeek} style={button}>
              {savingWeek ? "Saving…" : "Save availability"}
            </button>
            {weekSaved && <span style={{ color: "#1a7f37", fontWeight: 700 }}>Saved ✓</span>}
          </div>
        </form>
      </section>

      <section className="panel" style={{ padding: 22, marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>✋ Ask for time off or a swap</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={() => setReqType("time_off")} style={reqType === "time_off" ? smallButton : secondaryButton}>
            Time off
          </button>
          <button type="button" onClick={() => setReqType("swap")} style={reqType === "swap" ? smallButton : secondaryButton}>
            Shift swap
          </button>
        </div>
        <form onSubmit={submitRequest} style={{ display: "grid", gap: 10, maxWidth: 560 }}>
          {reqType === "time_off" ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                First day
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={input} required />
              </label>
              <label style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                Last day
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={input} required />
              </label>
            </div>
          ) : (
            <>
              <label style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                Your shift
                <select value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })} style={input} required>
                  <option value="">Pick one of your upcoming shifts…</option>
                  {myShifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {fmtDay(s.shift_date)} · {formatTime12h(s.start_time)}–{formatTime12h(s.end_time)}{s.locations?.name ? ` · ${s.locations.name}` : ""}{s.department ? ` · ${s.department}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {myShifts.length === 0 && (
                <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: 0 }}>
                  You have no upcoming shifts to offer right now.
                </p>
              )}
              <label style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                Ask this teammate
                <select value={form.swap_with} onChange={(e) => setForm({ ...form, swap_with: e.target.value })} style={input} required>
                  <option value="">Pick a teammate…</option>
                  {teammates.map((t) => (
                    <option key={t.id} value={t.id}>{t.display_name}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Reason (your manager will see this)"
            maxLength={500}
            rows={3}
            style={{ ...input, borderRadius: 12, resize: "vertical" }}
            required
          />
          <button type="submit" disabled={submitting} style={button}>
            {submitting ? "Sending…" : "Send request"}
          </button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          Sending a request doesn't change your schedule by itself — your manager reviews it here
          and makes any schedule change.
        </p>
      </section>

      <section className="panel" style={{ padding: 22, marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>My requests</h3>
        {myRequests.length === 0 && <p style={{ color: "var(--muted)" }}>No requests yet.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {myRequests.map((r) => (
            <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{r.request_type === "time_off" ? "🌴 Time off" : "🔁 Shift swap"}</strong>
                <StatusChip status={r.status} />
                {r.request_type === "swap" && r.swap_status && (
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                    {nameOf(r.swap_with_member_id)}: {r.swap_status === "pending_counterpart" ? "not answered yet" : r.swap_status}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 4 }}>
                {r.request_type === "time_off"
                  ? `${fmtDay(r.start_date)} – ${fmtDay(r.end_date)}`
                  : shiftLabel(r.shift_id)}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>“{r.reason}”</div>
              {r.decision_note && (
                <div style={{ fontSize: "0.9rem", marginTop: 4 }}>
                  Manager note: {r.decision_note}
                </div>
              )}
              {r.request_type === "swap" && r.status === "approved" && (
                <div style={{ fontSize: "0.9rem", marginTop: 4 }}>
                  Approved — this shift now belongs to {nameOf(r.swap_with_member_id)}.
                </div>
              )}
              {r.request_type === "swap" && eventTrail(r.id)}
              {r.status === "pending" && (
                <button onClick={() => cancelRequest(r)} style={{ ...secondaryButton, marginTop: 8 }}>
                  Cancel request
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {askedSwaps.filter((r) => !(r.status === "pending" && r.swap_status === "pending_counterpart")).length > 0 && (
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <h3 style={{ marginTop: 0 }}>🔁 Swaps you were asked about</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {askedSwaps
              .filter((r) => !(r.status === "pending" && r.swap_status === "pending_counterpart"))
              .map((r) => (
                <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>🔁 Shift swap</strong>
                    <StatusChip status={r.status} />
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      You: {r.swap_status === "pending_counterpart" ? "not answered yet" : r.swap_status}
                    </span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {nameOf(r.member_id)} — {shiftLabel(r.shift_id)}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>“{r.reason}”</div>
                  {r.decision_note && (
                    <div style={{ fontSize: "0.9rem", marginTop: 4 }}>
                      Manager note: {r.decision_note}
                    </div>
                  )}
                  {r.status === "approved" && (
                    <div style={{ fontSize: "0.9rem", marginTop: 4 }}>
                      Approved — this shift is yours now.
                    </div>
                  )}
                  {eventTrail(r.id)}
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

const input = {
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
};

const button = {
  padding: "12px 22px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  justifySelf: "start",
};

const smallButton = {
  padding: "9px 18px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButton = {
  padding: "9px 18px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};
