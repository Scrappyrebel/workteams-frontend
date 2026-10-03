"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { chicagoToday, formatTime12h } from "../../../../lib/dates";
import ClockPicker from "../../../../components/ClockPicker";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Parse "YYYY-MM-DD" as local noon so timezone shifts can't move the day.
function parseDay(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(year, month, 1, 12);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7, 12);
}

// Expand a repeat pattern into concrete "YYYY-MM-DD" dates, capped at 120
// occurrences so a typo in "repeat until" can't flood the schedule.
function buildOccurrences(startISO, pattern, untilISO) {
  if (!startISO || !untilISO) return [];
  const start = parseDay(startISO);
  const until = parseDay(untilISO);
  if (isNaN(start) || isNaN(until) || until < start) return [];
  const out = [];
  const push = (d) => {
    if (d >= start && d <= until && out.length < 120) out.push(toISODate(d));
  };
  if (!pattern || pattern === "once") {
    push(start);
    return out;
  }
  if (pattern === "weekly" || pattern === "biweekly") {
    const step = pattern === "weekly" ? 7 : 14;
    for (let d = new Date(start); d <= until && out.length < 120; d.setDate(d.getDate() + step)) {
      push(new Date(d));
    }
    return out;
  }
  if (pattern === "monthly") {
    const dayOfMonth = start.getDate();
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
    while (cursor <= until && out.length < 120) {
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12).getDate();
      push(new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(dayOfMonth, last), 12));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12);
    }
    return out;
  }
  if (pattern === "nth_weekday" || pattern === "nth_weekday_24") {
    const weekday = start.getDay();
    const ordinals = pattern === "nth_weekday" ? [1, 3] : [2, 4];
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
    while (cursor <= until && out.length < 120) {
      for (const n of ordinals) {
        push(nthWeekdayOfMonth(cursor.getFullYear(), cursor.getMonth(), weekday, n));
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12);
    }
    return out;
  }
  return out;
}

function defaultUntil(startISO) {
  const d = parseDay(startISO);
  d.setFullYear(d.getFullYear() + 1);
  return toISODate(d);
}

function recurrenceLabel(pattern, startISO) {
  if (pattern === "weekly") return "Weekly";
  if (pattern === "biweekly") return "Every 2 weeks";
  if (pattern === "monthly") return "Monthly";
  if (pattern === "nth_weekday" || pattern === "nth_weekday_24") {
    const d = parseDay(startISO);
    const ord = pattern === "nth_weekday" ? "1st & 3rd" : "2nd & 4th";
    return `${ord} ${WEEKDAY_NAMES[d.getDay()]}`;
  }
  return null;
}

function newUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `series-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// --- Typed date/time entry ("Type" mode) ---
// Accepts MM/DD/YYYY, MM-DD-YYYY, MM/DD/YY, YYYY-MM-DD -> "YYYY-MM-DD" or null.
function parseTypedDate(str) {
  const s = String(str || "").trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    return validISO(m[1], m[2], m[3]);
  }
  if ((m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/))) {
    return validISO(m[3], m[1], m[2]);
  }
  if ((m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/))) {
    const yy = Number(m[3]);
    const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
    return validISO(String(yyyy), m[1], m[2]);
  }
  return null;
}

function validISO(y, mo, d) {
  const yy = Number(y), mm = Number(mo), dd = Number(d);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dt = new Date(yy, mm - 1, dd, 12);
  if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

// Accepts "2:30 PM", "2:30PM", "2pm", "14:30" -> "HH:MM" (24h) or null.
function parseTypedTime(str) {
  const s = String(str || "").trim().toLowerCase().replace(/\s+/g, "");
  let m;
  if ((m = s.match(/^(\d{1,2}):(\d{2})(am|pm)$/))) {
    let h = Number(m[1]) % 12;
    if (m[3] === "pm") h += 12;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  }
  if ((m = s.match(/^(\d{1,2})(am|pm)$/))) {
    let h = Number(m[1]) % 12;
    if (m[2] === "pm") h += 12;
    return `${String(h).padStart(2, "0")}:00`;
  }
  if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) {
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return null;
}

// ISO -> friendly for display in type mode.
function toTypedDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : (iso || "");
}
function toTypedTime(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hhmm || "";
  const h = Number(m[1]);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${ap}`;
}

const EMPTY_FORM = { location_id: "", member_id: "", shift_date: "", start_time: "", end_time: "", notes: "", repeat: "once", repeat_until: "" };

export default function SchedulePage() {
  const { company, member, loading } = useCompany();
  const [shifts, setShifts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmSeriesId, setConfirmSeriesId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ location_id: "", member_id: "", shift_date: "", start_time: "", end_time: "", notes: "" });
  // "pick" = native calendar/clock pickers, "type" = type dates/times as text.
  const [dateEntry, setDateEntry] = useState("pick");
  // When editing a repeat-series shift: "one" = just this shift,
  // "series" = this and all future shifts in the series.
  const [editScope, setEditScope] = useState("one");
  // Which time field the clock picker is open for: { f, setF, field } | null.
  const [clockField, setClockField] = useState(null);

  const isManager = member && (member.role === "owner" || member.role === "admin");

  // Switch date/time entry mode, converting the current form values so
  // nothing the user already entered is lost.
  function switchEntryMode(mode, f, setF) {
    if (mode === dateEntry) return;
    if (mode === "type") {
      setF({
        ...f,
        shift_date: toTypedDate(f.shift_date),
        start_time: toTypedTime(f.start_time),
        end_time: toTypedTime(f.end_time),
        ...(f.repeat_until !== undefined ? { repeat_until: toTypedDate(f.repeat_until) } : {}),
      });
    } else {
      const d = parseTypedDate(f.shift_date);
      const st = parseTypedTime(f.start_time);
      const et = parseTypedTime(f.end_time);
      const ru = f.repeat_until !== undefined && f.repeat_until ? parseTypedDate(f.repeat_until) : (f.repeat_until || "");
      setF({
        ...f,
        shift_date: d || f.shift_date,
        start_time: st || f.start_time,
        end_time: et || f.end_time,
        ...(f.repeat_until !== undefined ? { repeat_until: ru === null ? f.repeat_until : ru } : {}),
      });
    }
    setDateEntry(mode);
  }

  // Normalize a form's date/time fields to ISO, parsing typed entry.
  // Returns { ok, shift_date, start_time, end_time, repeat_until }.
  function normalizeDateTime(f) {
    if (dateEntry !== "type") {
      return { ok: !!(f.shift_date && f.start_time && f.end_time), shift_date: f.shift_date, start_time: f.start_time, end_time: f.end_time, repeat_until: f.repeat_until || "" };
    }
    const shift_date = parseTypedDate(f.shift_date);
    const start_time = parseTypedTime(f.start_time);
    const end_time = parseTypedTime(f.end_time);
    const repeat_until = f.repeat_until ? parseTypedDate(f.repeat_until) : "";
    const ok = !!(shift_date && start_time && end_time) && (f.repeat_until ? !!repeat_until : true);
    return { ok, shift_date, start_time, end_time, repeat_until };
  }

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
    const norm = normalizeDateTime(form);
    if (!norm.ok) {
      alert(dateEntry === "type"
        ? "Check the typed date/time — use MM/DD/YYYY for dates and 2:30 PM for times."
        : "Date, start time and end time are required.");
      return;
    }
    const f = { ...form, shift_date: norm.shift_date, start_time: norm.start_time, end_time: norm.end_time, repeat_until: norm.repeat_until };
    const pattern = f.repeat || "once";
    const until = pattern === "once" ? f.shift_date : (f.repeat_until || defaultUntil(f.shift_date));
    const dates = buildOccurrences(f.shift_date, pattern, until);
    if (dates.length === 0) {
      alert("No shift dates fall in that range — check the date and the repeat-until date.");
      return;
    }
    // Repeats materialize as ordinary shift rows sharing one series_id, so
    // schedule/payroll/time-clock keep working unchanged.
    const seriesId = pattern === "once" ? null : newUUID();
    const label = pattern === "once" ? null : recurrenceLabel(pattern, f.shift_date);
    const rows = dates.map((d) => {
      const row = {
        company_id: company.id,
        location_id: f.location_id || null,
        member_id: f.member_id || null,
        shift_date: d,
        start_time: f.start_time,
        end_time: f.end_time,
        notes: f.notes || null,
      };
      // Keep plain one-off shifts insertable even before the 031 migration runs.
      if (seriesId) {
        row.series_id = seriesId;
        row.recurrence_label = label;
      }
      return row;
    });
    const { error } = await sb.from("shifts").insert(rows);
    if (error) {
      if (error.message && error.message.includes("series_id")) {
        alert("The database needs the new repeat-shift columns first — run the 031 SQL block in Supabase, then add the shift again.");
      } else {
        alert("Could not add shift: " + error.message);
      }
      return;
    }
    setForm(EMPTY_FORM);
    load();
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEditScope("one");
    const base = {
      location_id: s.location_id || "",
      member_id: s.member_id || "",
      shift_date: s.shift_date || "",
      start_time: s.start_time || "",
      end_time: s.end_time || "",
      notes: s.notes || "",
    };
    // Show friendly values when in type mode.
    setEditForm(dateEntry === "type" ? {
      ...base,
      shift_date: toTypedDate(base.shift_date),
      start_time: toTypedTime(base.start_time),
      end_time: toTypedTime(base.end_time),
    } : base);
  }

  async function saveEdit(s) {
    const norm = normalizeDateTime(editForm);
    if (!norm.ok) {
      alert(dateEntry === "type"
        ? "Check the typed date/time — use MM/DD/YYYY for dates and 2:30 PM for times."
        : "Date, start time and end time are required.");
      return;
    }
    const patch = {
      location_id: editForm.location_id || null,
      member_id: editForm.member_id || null,
      start_time: norm.start_time,
      end_time: norm.end_time,
      notes: editForm.notes || null,
    };
    let error;
    if (editScope === "series" && s.series_id) {
      // Apply time/location/person/notes to this and all future shifts in
      // the series. Each shift keeps its own date.
      ({ error } = await supabase().from("shifts").update(patch)
        .eq("company_id", company.id)
        .eq("series_id", s.series_id)
        .gte("shift_date", s.shift_date));
    } else {
      ({ error } = await supabase().from("shifts").update({ ...patch, shift_date: norm.shift_date })
        .eq("id", s.id));
    }
    if (error) alert("Could not save: " + error.message);
    else {
      setEditingId(null);
      setEditScope("one");
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

  async function deleteSeries(s) {
    // Removes the FUTURE shifts of a repeat series; past shifts stay as history.
    if (confirmSeriesId !== s.series_id) {
      setConfirmSeriesId(s.series_id);
      return;
    }
    setConfirmSeriesId(null);
    const { error } = await supabase()
      .from("shifts")
      .delete()
      .eq("series_id", s.series_id)
      .gte("shift_date", chicagoToday());
    if (error) alert("Could not delete series: " + error.message);
    else load();
  }

  // Renders the Pick/Type toggle for date & time entry.
  function entryToggle(f, setF) {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 700 }}>Dates:</span>
        <button type="button" onClick={() => switchEntryMode("pick", f, setF)} style={dateEntry === "pick" ? toggleOn : toggleOff}>📅 Pick</button>
        <button type="button" onClick={() => switchEntryMode("type", f, setF)} style={dateEntry === "type" ? toggleOn : toggleOff}>⌨️ Type</button>
      </div>
    );
  }

  // Date + start/end time inputs in the current entry mode. In Pick mode,
  // dates use the native calendar and times open the tap-the-clock picker
  // (no scrolling number lists).
  function dateTimeFields(f, setF) {
    if (dateEntry === "type") {
      return (
        <div style={{ display: "flex", gap: 8 }}>
          <input type="text" inputMode="numeric" placeholder="MM/DD/YYYY" value={f.shift_date} onChange={(e) => setF({ ...f, shift_date: e.target.value })} style={{ ...input, flex: 1 }} />
          <input type="text" inputMode="numeric" placeholder="2:30 PM" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} style={{ ...input, flex: 1 }} />
          <input type="text" inputMode="numeric" placeholder="5:30 PM" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} style={{ ...input, flex: 1 }} />
        </div>
      );
    }
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <input type="date" required value={f.shift_date} onChange={(e) => setF({ ...f, shift_date: e.target.value })} style={{ ...input, flex: 1 }} />
        <button type="button" onClick={() => setClockField({ f, setF, field: "start_time" })} style={{ ...input, flex: 1, textAlign: "left", cursor: "pointer", color: f.start_time ? "inherit" : "var(--muted)" }}>
          🕐 {f.start_time ? formatTime12h(f.start_time) : "Start time"}
        </button>
        <button type="button" onClick={() => setClockField({ f, setF, field: "end_time" })} style={{ ...input, flex: 1, textAlign: "left", cursor: "pointer", color: f.end_time ? "inherit" : "var(--muted)" }}>
          🕐 {f.end_time ? formatTime12h(f.end_time) : "End time"}
        </button>
      </div>
    );
  }

  if (loading || !company) return <p>Loading…</p>;

  // Live preview of how many shifts a repeat will create. Normalize typed
  // entry first so the preview works in both modes.
  const previewNorm = normalizeDateTime(form);
  const previewShiftDate = previewNorm.shift_date || "";
  const previewDates =
    isManager && form.repeat !== "once" && previewShiftDate
      ? buildOccurrences(previewShiftDate, form.repeat, previewNorm.repeat_until || defaultUntil(previewShiftDate))
      : [];
  const nthOptionLabel = previewShiftDate
    ? `1st & 3rd ${WEEKDAY_NAMES[parseDay(previewShiftDate).getDay()]} of each month`
    : "1st & 3rd weekday of each month";
  const nthOptionLabel24 = previewShiftDate
    ? `2nd & 4th ${WEEKDAY_NAMES[parseDay(previewShiftDate).getDay()]} of each month`
    : "2nd & 4th weekday of each month";

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
            {entryToggle(form, setForm)}
            {dateTimeFields(form, setForm)}
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes (optional)" style={input} />
            <label style={labelStyle}>
              Repeat
              <select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} style={input}>
                <option value="once">Just this once</option>
                <option value="weekly">Every week</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Every month</option>
                <option value="nth_weekday">{nthOptionLabel}</option>
                <option value="nth_weekday_24">{nthOptionLabel24}</option>
              </select>
            </label>
            {form.repeat !== "once" && (
              <label style={labelStyle}>
                Repeat until
                {dateEntry === "type" ? (
                  <input type="text" inputMode="numeric" placeholder="MM/DD/YYYY" value={form.repeat_until} onChange={(e) => setForm({ ...form, repeat_until: e.target.value })} style={input} />
                ) : (
                  <input type="date" value={form.repeat_until} min={form.shift_date} onChange={(e) => setForm({ ...form, repeat_until: e.target.value })} style={input} />
                )}
              </label>
            )}
            {previewDates.length > 0 && (
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
                This will create {previewDates.length} shift{previewDates.length === 1 ? "" : "s"} — each one can still be edited or deleted on its own.
              </p>
            )}
            <button type="submit" style={button}>Add shift</button>
          </form>
        </section>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {shifts.length === 0 && <p style={{ color: "var(--muted)" }}>No upcoming shifts yet.</p>}
        {shifts.map((s) => (
          <div key={s.id} className="portal-card" style={{ minHeight: 0, padding: "16px 20px" }}>
            {editingId === s.id ? (
              <div style={{ display: "grid", gap: 10 }}>
                <h3 style={{ margin: 0 }}>Edit shift</h3>
                {s.series_id ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--muted)" }}>Apply changes to:</span>
                    <label style={{ fontSize: "0.9rem", display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="radio" checked={editScope === "one"} onChange={() => setEditScope("one")} />
                      Just this shift
                    </label>
                    <label style={{ fontSize: "0.9rem", display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="radio" checked={editScope === "series"} onChange={() => setEditScope("series")} />
                      This and all future shifts in the series
                    </label>
                    {editScope === "series" && (
                      <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
                        Time, location, person and notes update on every future repeat — each keeps its own date.
                      </p>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
                    This changes only this shift.
                  </p>
                )}
                <select value={editForm.location_id} onChange={(e) => setEditForm({ ...editForm, location_id: e.target.value })} required style={input}>
                  <option value="">Choose a location…</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <select value={editForm.member_id} onChange={(e) => setEditForm({ ...editForm, member_id: e.target.value })} style={input}>
                  <option value="">Assign to… (optional)</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.display_name} ({m.email})</option>)}
                </select>
                {entryToggle(editForm, setEditForm)}
                {dateTimeFields(editForm, setEditForm)}
                <input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notes (optional)" style={input} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => saveEdit(s)} style={{ ...button, flex: 1 }}>Save</button>
                  <button onClick={() => setEditingId(null)} style={{ ...secondaryButton, flex: 1 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <span className="card-kicker">
                  {s.shift_date} • {formatTime12h(s.start_time)}–{formatTime12h(s.end_time)}
                  {s.recurrence_label && <span style={chip}>↻ {s.recurrence_label}</span>}
                </span>
                <h3 style={{ margin: "6px 0" }}>{s.locations?.name || "No location"}</h3>
                <p style={{ color: "var(--muted)", marginBottom: 6 }}>{s.assignee_name || "Unassigned"}</p>
                {s.notes && <p style={{ fontSize: "0.9rem" }}>{s.notes}</p>}
                {isManager && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => startEdit(s)} style={editButton}>Edit</button>
                    <button
                      onClick={() => deleteShift(s.id)}
                      style={confirmDeleteId === s.id ? confirmButton : dangerButton}
                    >
                      {confirmDeleteId === s.id ? "Tap again to confirm delete" : "Delete"}
                    </button>
                    {s.series_id && (
                      <button
                        onClick={() => deleteSeries(s)}
                        style={confirmSeriesId === s.series_id ? confirmButton : dangerButton}
                      >
                        {confirmSeriesId === s.series_id ? "Tap again: delete all future repeats" : "Delete series"}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {clockField && (
        <ClockPicker
          value={clockField.f[clockField.field]}
          onChange={(v) => clockField.setF({ ...clockField.f, [clockField.field]: v })}
          onClose={() => setClockField(null)}
        />
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

const labelStyle = {
  display: "grid",
  gap: 4,
  fontSize: "0.85rem",
  fontWeight: 700,
  color: "var(--muted)",
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

const secondaryButton = {
  padding: "12px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

const editButton = {
  marginTop: 8,
  border: "1px solid var(--line)",
  background: "#fff",
  color: "inherit",
  borderRadius: 999,
  padding: "7px 14px",
  fontWeight: 700,
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

const chip = {
  display: "inline-block",
  marginLeft: 8,
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: "0.75rem",
  fontWeight: 700,
  background: "#e8f0fe",
  color: "#1a56db",
  verticalAlign: "middle",
};

const toggleOn = {
  border: "2px solid var(--brand)",
  background: "#fff",
  color: "var(--brand-deep)",
  borderRadius: 999,
  padding: "6px 14px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const toggleOff = {
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--muted)",
  borderRadius: 999,
  padding: "6px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};
