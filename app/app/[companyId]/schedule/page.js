"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { chicagoToday, formatTime12h } from "../../../../lib/dates";
import ClockPicker from "../../../../components/ClockPicker";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "Working as" choices for a shift (079): the company's departments from
// the Team page's assignment (045). company_members.departments stores
// the keys; null/empty there means every department. The value stored on
// the shift is the label, so cards — and later payroll — read it plainly
// even if the person's departments change afterwards.
const WORK_DEPARTMENTS = [
  { key: "hr", label: "HR" },
  { key: "sales", label: "Sales" },
  { key: "service", label: "Customer Service" },
  { key: "accounting", label: "Accounting" },
  { key: "field", label: "Field Ops" },
  { key: "compliance", label: "Compliance" },
];
const DEFAULT_WORK_LABEL = "Cleaning / Field Work";

// Options for one member: their own departments by label, plus the plain
// field-work default. No recorded departments (null = all) gets the full
// standard list.
function workOptionsFor(memberRow) {
  const keys = memberRow && memberRow.departments;
  const mine = Array.isArray(keys) && keys.length > 0
    ? WORK_DEPARTMENTS.filter((d) => keys.includes(d.key))
    : WORK_DEPARTMENTS;
  return [...mine.map((d) => d.label), DEFAULT_WORK_LABEL];
}

// With exactly one recorded department, that is the obvious preselect.
function presetDepartmentFor(memberRow) {
  const keys = memberRow && memberRow.departments;
  if (Array.isArray(keys) && keys.length === 1) {
    const found = WORK_DEPARTMENTS.find((d) => d.key === keys[0]);
    if (found) return found.label;
  }
  return "";
}

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

// Expand a repeat pattern into concrete "YYYY-MM-DD" dates, capped at 520
// occurrences (10 years of weekly shifts) so a typo in "repeat until"
// can't flood the schedule.
function buildOccurrences(startISO, pattern, untilISO) {
  if (!startISO || !untilISO) return [];
  const start = parseDay(startISO);
  const until = parseDay(untilISO);
  if (isNaN(start) || isNaN(until) || until < start) return [];
  const out = [];
  const push = (d) => {
    if (d >= start && d <= until && out.length < 520) out.push(toISODate(d));
  };
  if (!pattern || pattern === "once") {
    push(start);
    return out;
  }
  if (pattern === "weekly" || pattern === "biweekly") {
    const step = pattern === "weekly" ? 7 : 14;
    for (let d = new Date(start); d <= until && out.length < 520; d.setDate(d.getDate() + step)) {
      push(new Date(d));
    }
    return out;
  }
  if (pattern === "monthly") {
    const dayOfMonth = start.getDate();
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
    while (cursor <= until && out.length < 520) {
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
    while (cursor <= until && out.length < 520) {
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

const EMPTY_FORM = { location_id: "", member_id: "", department: "", shift_date: "", start_time: "", end_time: "", notes: "", repeat: "once", repeat_until: "" };

export default function SchedulePage() {
  const { company, member, loading } = useCompany();
  const [shifts, setShifts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmSeriesId, setConfirmSeriesId] = useState(null);
  // Add-shift confirmation: the prepared rows + summary facts for a
  // create that has been reviewed but not yet inserted (see addShift).
  const [confirmAdd, setConfirmAdd] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ location_id: "", member_id: "", department: "", shift_date: "", start_time: "", end_time: "", notes: "" });
  // "pick" = native calendar/clock pickers, "type" = type dates/times as text.
  const [dateEntry, setDateEntry] = useState("pick");
  // When editing a repeat-series shift: "one" = just this shift,
  // "series" = this and all future shifts in the series.
  const [editScope, setEditScope] = useState("one");
  // Default schedule: Sunday–Saturday weekly calendar. Optional list for deeper review.
  const [view, setView] = useState("week");
  // Sunday (ISO) of the selected Sunday-through-Saturday workweek.
  const [weekStart, setWeekStart] = useState(() => startOfWeekISO(chicagoToday()));
  const [weekShifts, setWeekShifts] = useState([]);
  // Month calendar view: which month is shown, its shifts, and the tapped day.
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = parseDay(chicagoToday());
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const [monthShifts, setMonthShifts] = useState([]);
  const [selectedDay, setSelectedDay] = useState(() => chicagoToday());
  // Time-off / swap requests (migration 069). Probed: if the table is not
  // there yet, requestsReady flips false and every request UI stays hidden.
  const [requestsReady, setRequestsReady] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [approvedOff, setApprovedOff] = useState([]);
  const [decisionNotes, setDecisionNotes] = useState({});

  // The add-shift confirmation summary is only ever live for the exact
  // form it was prepared from: any later edit disarms it, so what a
  // manager confirms is always what the form currently says.
  useEffect(() => { setConfirmAdd(null); }, [form]);

  // Sunday of the week containing the selected date (Sun–Sat).
  function startOfWeekISO(iso) {
    const d = parseDay(iso);
    d.setDate(d.getDate() - d.getDay());
    return toISODate(d);
  }
  function addDaysISO(iso, n) {
    const d = parseDay(iso);
    d.setDate(d.getDate() + n);
    return toISODate(d);
  }

  async function loadWeek(startISO) {
    const sb = supabase();
    const endISO = addDaysISO(startISO, 6);
    const { data } = await sb
      .from("shifts")
      .select("*, locations(name)")
      .eq("company_id", company.id)
      .gte("shift_date", startISO)
      .lte("shift_date", endISO)
      .order("shift_date", { ascending: true })
      .order("start_time", { ascending: true });
    const rows = data || [];
    const memberIds = [...new Set(rows.map((s) => s.member_id).filter(Boolean))];
    let nameById = {};
    if (memberIds.length > 0) {
      const { data: dir } = await sb.from("team_directory").select("id, display_name").in("id", memberIds);
      for (const d of dir || []) nameById[d.id] = d.display_name;
    }
    setWeekShifts(rows.map((s) => ({ ...s, assignee_name: s.member_id ? nameById[s.member_id] || null : null })));
  }

  // First/last ISO dates of the month containing `cursor`.
  function monthRange(cursor) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    return { startISO: toISODate(new Date(y, m, 1, 12)), endISO: toISODate(new Date(y, m + 1, 0, 12)) };
  }

  async function loadMonth(cursor) {
    const sb = supabase();
    const { startISO, endISO } = monthRange(cursor);
    const { data } = await sb
      .from("shifts")
      .select("*, locations(name)")
      .eq("company_id", company.id)
      .gte("shift_date", startISO)
      .lte("shift_date", endISO)
      .order("shift_date", { ascending: true })
      .order("start_time", { ascending: true });
    const rows = data || [];
    const memberIds = [...new Set(rows.map((s) => s.member_id).filter(Boolean))];
    let nameById = {};
    if (memberIds.length > 0) {
      const { data: dir } = await sb.from("team_directory").select("id, display_name").in("id", memberIds);
      for (const d of dir || []) nameById[d.id] = d.display_name;
    }
    setMonthShifts(rows.map((s) => ({ ...s, assignee_name: s.member_id ? nameById[s.member_id] || null : null })));
  }

  function changeMonth(delta) {    const c = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + delta, 1, 12);
    setMonthCursor(c);
    const today = chicagoToday(company?.timezone);
    const { startISO, endISO } = monthRange(c);
    setSelectedDay(today >= startISO && today <= endISO ? today : startISO);
    loadMonth(c);
  }

  // "Kristin Bodimer" -> "Kristin B." for the compact calendar cells.
  function shortName(displayName) {
    if (!displayName) return "Unassigned";
    const parts = String(displayName).trim().split(/\s+/);
    if (parts.length < 2) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }

  // After adding/editing/deleting, reload the data for whichever view is
  // on screen — otherwise the Week view (the default) keeps showing stale
  // data and new shifts look like they never saved.
  function refreshVisible() {
    load();
    if (view === "week") loadWeek(weekStart);
    if (view === "month") loadMonth(monthCursor);
  }

  function changeWeek(delta) {
    const next = addDaysISO(weekStart, delta * 7);
    setWeekStart(next);
    loadWeek(next);
  }

  function weekLabel() {
    const s = parseDay(weekStart);
    const e = parseDay(addDaysISO(weekStart, 6));
    const fmt = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    if (s.getFullYear() === e.getFullYear()) {
      if (s.getMonth() === e.getMonth()) return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`;
      return `${fmt(s)} – ${fmt(e)}, ${s.getFullYear()}`;
    }
    return `${fmt(s)}, ${s.getFullYear()} – ${fmt(e)}, ${e.getFullYear()}`;
  }
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
    const today = chicagoToday(company?.timezone);
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
      // roster view does not. departments (045) rides along for the
      // "Working as" picker — probed like the Team page probes it, so
      // scheduling never locks a manager out over a not-yet-run
      // migration.
      const memCols = "id, display_name, email";
      const withDepts = await sb.from("company_members").select(memCols + ", departments").eq("company_id", company.id).order("display_name");
      if (!withDepts.error) {
        setMembers(withDepts.data || []);
      } else {
        const { data: mems } = await sb.from("company_members").select(memCols).eq("company_id", company.id).order("display_name");
        setMembers(mems || []);
      }
    } else {
      setMembers([]);
    }
    loadRequests();
  }

  function fmtReqDay(iso) {
    const d = parseDay(iso);
    return `${WEEKDAY_SHORT[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  // Schedule requests are records only: loading them never changes shifts
  // or time entries. Approved time off is shown so nobody schedules blind;
  // the pending queue is the manager's approve/deny inbox.
  async function loadRequests() {
    const sb = supabase();
    const today = chicagoToday(company?.timezone);
    const off = await sb
      .from("schedule_requests")
      .select("id, member_id, start_date, end_date")
      .eq("company_id", company.id)
      .eq("request_type", "time_off")
      .eq("status", "approved")
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(50);
    if (off.error) {
      if (/schedule_requests|does not exist|could not find/i.test(off.error.message || "")) {
        setRequestsReady(false);
      }
      return;
    }
    const offRows = off.data || [];
    const ids = offRows.map((r) => r.member_id);
    let pending = [];
    if (isManager) {
      const p = await sb
        .from("schedule_requests")
        .select("id, member_id, request_type, shift_id, swap_with_member_id, swap_status, start_date, end_date, reason, created_at")
        .eq("company_id", company.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50);
      if (!p.error) {
        pending = p.data || [];
        for (const r of pending) ids.push(r.member_id, r.swap_with_member_id);
      }
    }
    const uniq = [...new Set(ids.filter(Boolean))];
    const nameById = {};
    if (uniq.length > 0) {
      const { data: dir } = await sb.from("team_directory").select("id, display_name").in("id", uniq);
      for (const d of dir || []) nameById[d.id] = d.display_name;
    }
    setApprovedOff(offRows.map((r) => ({ ...r, name: nameById[r.member_id] || "A teammate" })));
    const shiftIds = [...new Set(pending.map((r) => r.shift_id).filter(Boolean))];
    const shiftById = {};
    if (shiftIds.length > 0) {
      const { data: srows } = await sb.from("shifts").select("id, shift_date, start_time, end_time, locations(name)").in("id", shiftIds);
      for (const s of srows || []) shiftById[s.id] = s;
    }
    setPendingRequests(
      pending.map((r) => ({
        ...r,
        name: nameById[r.member_id] || "A teammate",
        swapWithName: r.swap_with_member_id ? nameById[r.swap_with_member_id] || "A teammate" : null,
        shift: r.shift_id ? shiftById[r.shift_id] || null : null,
      }))
    );
  }

  // Migration 074's approve function is probed the same way as its
  // tables: until 074 runs, swap approvals use the 069 record-only
  // decision below, exactly as before.
  function swapCompletionMissing(error) {
    if (!error) return false;
    const msg = String(error.message || "");
    return (
      error.code === "42883" ||
      error.code === "PGRST202" ||
      /could not find the function|does not exist/i.test(msg)
    );
  }

  async function decideRequest(r, decision) {
    const note = (decisionNotes[r.id] || "").trim();
    let movedShift = false;
    // Approving a swap is the one decision that also moves a shift, so
    // it goes through the approve_shift_swap database function
    // (migration 074): the shift is reassigned to the teammate who
    // accepted and the decision is recorded in the same transaction —
    // and a shift that already has recorded time on it is refused
    // outright, with the plain reason shown. Every other decision
    // keeps the 069 record-only update.
    if (r.request_type === "swap" && decision === "approved") {
      const { error } = await supabase().rpc("approve_shift_swap", {
        p_request_id: r.id,
        p_decision_note: note ? note.slice(0, 500) : null,
      });
      if (!error) {
        movedShift = true;
      } else if (!swapCompletionMissing(error)) {
        alert("Could not approve this swap: " + error.message);
        loadRequests();
        return;
      }
    }
    if (!movedShift) {
      const patch = { status: decision };
      if (note) patch.decision_note = note.slice(0, 500);
      const { error } = await supabase().from("schedule_requests").update(patch).eq("id", r.id);
      if (error) {
        alert("Could not save the decision: " + error.message);
        return;
      }
    }
    try {
      const { data: { session } } = await supabase().auth.getSession();
      await fetch("/api/schedule-requests/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ companyId: company.id, requestId: r.id, event: "decided" }),
      });
    } catch {
      // Best-effort: the decision itself is saved either way.
    }
    loadRequests();
    // A swap approval changed who a shift belongs to: refresh the
    // visible schedule too, not just the request queue.
    if (movedShift) refreshVisible();
  }

  useEffect(() => {
    if (!loading && company) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company]);

  // Load the visible week's shifts when entering week view.
  useEffect(() => {
    if (view === "week" && company) loadWeek(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Load the visible month's shifts when entering month view.
  useEffect(() => {
    if (view === "month" && company) {
      loadMonth(monthCursor);
      const today = chicagoToday(company?.timezone);
      const { startISO, endISO } = monthRange(monthCursor);
      setSelectedDay(today >= startISO && today <= endISO ? today : startISO);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Validates the add form and builds the exact rows a create would
  // insert — the same checks, in the same order, with the same alerts
  // this flow has always had. Returns null when validation stops it.
  function prepareAddShift() {
    const norm = normalizeDateTime(form);
    if (!norm.ok) {
      alert(dateEntry === "type"
        ? "Check the typed date/time — use MM/DD/YYYY for dates and 2:30 PM for times."
        : "Date, start time and end time are required.");
      return null;
    }
    const f = { ...form, shift_date: norm.shift_date, start_time: norm.start_time, end_time: norm.end_time, repeat_until: norm.repeat_until };
    // "Working as" (079): the job this shift is for, chosen from the
    // assignee's own departments. Required when there is a real choice;
    // a single-option list resolves itself. Unassigned shifts carry
    // none yet — the job is set when someone is assigned.
    const assignee = members.find((m) => m.id === f.member_id) || null;
    let department = null;
    if (assignee) {
      const options = workOptionsFor(assignee);
      department = f.department || (options.length === 1 ? options[0] : "");
      if (!department) {
        alert("Choose what this shift is for — use the “Working as” list.");
        return null;
      }
    }
    const pattern = f.repeat || "once";
    const until = pattern === "once" ? f.shift_date : (f.repeat_until || defaultUntil(f.shift_date));
    const dates = buildOccurrences(f.shift_date, pattern, until);
    if (dates.length === 0) {
      alert("No shift dates fall in that range — check the date and the repeat-until date.");
      return null;
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
        department,
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
    return { rows, dates, pattern, label, department };
  }

  // Row equality for the confirmation check below, ignoring series_id:
  // a fresh prepare mints a new one, and it identifies the series rather
  // than describing the shifts being confirmed.
  function sameShiftRows(a, b) {
    if (a.length !== b.length) return false;
    return a.every((r, i) => {
      const x = { ...r };
      const y = { ...b[i] };
      delete x.series_id;
      delete y.series_id;
      return JSON.stringify(x) === JSON.stringify(y);
    });
  }

  // Submitting the form no longer creates anything by itself: it prepares
  // the rows and shows a confirmation summary (who / where / when /
  // working as / which company) so the manager gets one clear look before
  // the insert. The wrong-company assignment in the Ervin incident had no
  // such pause. Create (below) is the only insert path for a new shift.
  function addShift(e) {
    e.preventDefault();
    const prep = prepareAddShift();
    if (prep) setConfirmAdd(prep);
  }

  async function confirmAddShift() {
    if (!confirmAdd || adding) return;
    // Rebuild from the current form and compare: if anything changed
    // since the summary was prepared, show the fresh summary instead of
    // creating something different from what was just reviewed.
    const prep = prepareAddShift();
    if (!prep) {
      setConfirmAdd(null);
      return;
    }
    if (!sameShiftRows(prep.rows, confirmAdd.rows)) {
      setConfirmAdd(prep);
      return;
    }
    const sb = supabase();
    const rows = prep.rows;
    setAdding(true);
    // If migration 079 has not run yet, the department column does not
    // exist: retry once without it so scheduling keeps working exactly
    // as before (the tolerant-write pattern used for earlier columns).
    let { error } = await sb.from("shifts").insert(rows);
    if (error && /department|position_name/i.test(error.message || "")) {
      const plainRows = rows.map((row) => {
        const copy = { ...row };
        delete copy.department;
        return copy;
      });
      ({ error } = await sb.from("shifts").insert(plainRows));
    }
    setAdding(false);
    if (error) {
      if (error.message && error.message.includes("series_id")) {
        console.error("repeat-shift insert failed (missing 031 columns):", error.message);
        alert("Couldn't save the repeating shift right now. Please try again — if it keeps happening, contact support.");
      } else {
        alert("Could not add shift: " + error.message);
      }
      return;
    }
    setConfirmAdd(null);
    setForm(EMPTY_FORM);
    refreshVisible();
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEditScope("one");
    const base = {
      location_id: s.location_id || "",
      member_id: s.member_id || "",
      department: s.department || "",
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
      // "Working as" (079) rides along on edits too; an unassigned
      // shift or a blank picker stores null, like rows from before 079.
      department: editForm.member_id ? (editForm.department || null) : null,
    };
    const applyPatch = (p) => editScope === "series" && s.series_id
      ? supabase().from("shifts").update(p)
        // Apply time/location/person/notes to this and all future
        // shifts in the series. Each shift keeps its own date.
        .eq("company_id", company.id)
        .eq("series_id", s.series_id)
        .gte("shift_date", s.shift_date)
      : supabase().from("shifts").update({ ...p, shift_date: norm.shift_date })
        .eq("id", s.id);
    let { error } = await applyPatch(patch);
    if (error && /department|position_name/i.test(error.message || "")) {
      // 079 not run yet: save everything else exactly as before.
      const rest = { ...patch };
      delete rest.department;
      ({ error } = await applyPatch(rest));
    }
    if (error) alert("Could not save: " + error.message);
    else {
      setEditingId(null);
      setEditScope("one");
      refreshVisible();
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
    else refreshVisible();
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
      .gte("shift_date", chicagoToday(company?.timezone));
    if (error) alert("Could not delete series: " + error.message);
    else refreshVisible();
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

  // Confirmation summary for a prepared add: derived from the prepared
  // rows themselves, so it always describes exactly what Create inserts.
  const addSummary = (() => {
    if (!confirmAdd) return null;
    const first = confirmAdd.rows[0];
    const who = members.find((m) => m.id === first.member_id) || null;
    const where = locations.find((l) => l.id === first.location_id) || null;
    const d0 = parseDay(first.shift_date);
    const dN = parseDay(confirmAdd.dates[confirmAdd.dates.length - 1]);
    const fmtDay = (d) => `${WEEKDAY_NAMES[d.getDay()]}, ${MONTH_NAMES_FULL[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    const fmtShort = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    return {
      who,
      where,
      first,
      when: `${fmtDay(d0)} · ${formatTime12h(first.start_time)} – ${formatTime12h(first.end_time)}`,
      range: `${fmtShort(d0)} – ${fmtShort(dN)}`,
    };
  })();

  // One shift card, shared by the list view and the week view — edit and
  // delete work the same in both.
  function shiftCard(s) {
    return (
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
            <select value={editForm.member_id} onChange={(e) => {
              const picked = members.find((m) => m.id === e.target.value) || null;
              setEditForm({ ...editForm, member_id: e.target.value, department: presetDepartmentFor(picked) });
            }} style={input}>
              <option value="">Assign to… (optional)</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.display_name} ({m.email})</option>)}
            </select>
            {editForm.member_id && (
              <select value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} style={input} aria-label="Working as">
                <option value="">Working as… (not set)</option>
                {editForm.department && !workOptionsFor(members.find((m) => m.id === editForm.member_id) || null).includes(editForm.department) && (
                  <option value={editForm.department}>{editForm.department}</option>
                )}
                {workOptionsFor(members.find((m) => m.id === editForm.member_id) || null).map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            )}
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
              {s.department && <span style={chip}>🏷️ {s.department}</span>}
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
    );
  }
  // Week view: 7 day blocks (Sun–Sat) so the whole week can be checked at
  // a glance — empty days say so, making gaps obvious.
  function weekView() {
    const today = chicagoToday(company?.timezone);
    const goThisWeek = () => {
      const w = startOfWeekISO(chicagoToday(company?.timezone));
      setWeekStart(w);
      loadWeek(w);
    };
    const days = [];
    for (let i = 0; i < 7; i++) {
      const iso = addDaysISO(weekStart, i);
      const d = parseDay(iso);
      const dayShifts = weekShifts.filter((s) => s.shift_date === iso);
      days.push(
        <div key={iso} style={dayBlock}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <strong>{WEEKDAY_NAMES[d.getDay()]}{iso === today ? " · Today" : ""}</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{MONTHS[d.getMonth()]} {d.getDate()}</span>
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {dayShifts.length === 0
              ? <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>No shifts scheduled</p>
              : dayShifts.map(shiftCard)}
          </div>
        </div>
      );
    }
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button type="button" onClick={() => changeWeek(-1)} style={ghostBtn}>← Prev</button>
          <strong style={{ flex: 1, textAlign: "center" }}>{weekLabel()}</strong>
          <button type="button" onClick={() => changeWeek(1)} style={ghostBtn}>Next →</button>
          <button type="button" onClick={goThisWeek} style={ghostBtn}>This week</button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>{days}</div>
      </div>
    );
  }

  // Month view: calendar grid with per-day shift counts and names. Tap a
  // date to see its shifts below — same cards as list/week, so edit and
  // delete work the same.
  function monthView() {
    const y = monthCursor.getFullYear();
    const m = monthCursor.getMonth();
    const firstDow = new Date(y, m, 1, 12).getDay();
    const daysInMonth = new Date(y, m + 1, 0, 12).getDate();
    const today = chicagoToday(company?.timezone);
    const cells = [];
    for (let i = 0; i < firstDow; i++) {
      cells.push(<div key={`blank-${i}`} style={monthBlank} aria-hidden="true" />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toISODate(new Date(y, m, d, 12));
      const dayShifts = monthShifts.filter((s) => s.shift_date === iso);
      const uniqNames = [...new Set(dayShifts.map((s) => shortName(s.assignee_name)))];
      const shown = uniqNames.slice(0, 3);
      const extra = uniqNames.length - shown.length;
      cells.push(
        <button
          key={iso}
          type="button"
          onClick={() => setSelectedDay(iso)}
          style={{
            ...monthCell,
            ...(iso === today ? monthTodayCell : null),
            ...(iso === selectedDay ? monthSelectedCell : null),
          }}
        >
          <strong style={{ fontSize: "0.95rem" }}>{d}</strong>
          {dayShifts.length > 0 && (
            <span style={monthCount}>{dayShifts.length} shift{dayShifts.length === 1 ? "" : "s"}</span>
          )}
          {shown.map((n) => (
            <span key={n} style={monthName}>{n}</span>
          ))}
          {extra > 0 && <span style={monthName}>+{extra} more</span>}
        </button>
      );
    }
    const selShifts = monthShifts.filter((s) => s.shift_date === selectedDay);
    const selDate = parseDay(selectedDay);
    const selLabel = `${WEEKDAY_NAMES[selDate.getDay()]}, ${MONTH_NAMES_FULL[selDate.getMonth()]} ${selDate.getDate()}, ${selDate.getFullYear()}`;
    return (
      <div>
        <h3 style={{ margin: "4px 0 12px" }}>Monthly Shift Calendar — Who's Working</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => changeMonth(-1)} style={ghostBtn}>‹ Previous</button>
          <strong style={{ flex: 1, textAlign: "center" }}>{MONTH_NAMES_FULL[m]} {y}</strong>
          <button type="button" onClick={() => changeMonth(1)} style={ghostBtn}>Next ›</button>
        </div>
        <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: "0 0 10px" }}>
          Tap a date to see everyone assigned, their shifts and locations. Workweek: Sunday–Saturday.
        </p>
        <div style={monthGrid}>
          {WEEKDAY_SHORT.map((w) => (
            <div key={w} style={monthHeader}>{w}</div>
          ))}
          {cells}
        </div>
        <div style={{ marginTop: 18 }}>
          <h3 style={{ margin: "0 0 2px" }}>{selLabel}</h3>
          <p style={{ color: "var(--muted)", margin: "0 0 10px" }}>
            {selShifts.length} scheduled shift{selShifts.length === 1 ? "" : "s"}
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {selShifts.length === 0
              ? <p style={{ color: "var(--muted)" }}>No shifts scheduled that day.</p>
              : selShifts.map(shiftCard)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">SCHEDULE</p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "1.8rem", margin: 0 }}>Upcoming shifts</h2>
        <Link href={`/app/${company.id}/schedule/repeats`} style={repeatsLink}>🔁 Repeats</Link>
        <Link href={`/app/${company.id}/schedule/history`} style={repeatsLink}>📜 History</Link>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <button type="button" onClick={() => setView("list")} style={view === "list" ? toggleOn : toggleOff}>List</button>
          <button type="button" onClick={() => setView("week")} style={view === "week" ? toggleOn : toggleOff}>📅 Week</button>
          <button type="button" onClick={() => setView("month")} style={view === "month" ? toggleOn : toggleOff}>🗓️ Month</button>
        </div>
      </div>

      {requestsReady && approvedOff.length > 0 && (
        <section className="panel" style={{ padding: "14px 22px", margin: "18px 0 0" }}>
          <strong>🌴 Approved time off:</strong>{" "}
          {approvedOff
            .map((r) => `${r.name} — ${fmtReqDay(r.start_date)} to ${fmtReqDay(r.end_date)}`)
            .join("  ·  ")}
        </section>
      )}

      {isManager && requestsReady && pendingRequests.length > 0 && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>📥 Schedule requests ({pendingRequests.length} waiting)</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {pendingRequests.map((r) => (
              <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                <div>
                  <strong>{r.name}</strong> —{" "}
                  {r.request_type === "time_off"
                    ? `🌴 Time off, ${fmtReqDay(r.start_date)} to ${fmtReqDay(r.end_date)}`
                    : `🔁 Swap ${r.shift ? `${fmtReqDay(r.shift.shift_date)} · ${formatTime12h(r.shift.start_time)}–${formatTime12h(r.shift.end_time)}${r.shift.locations?.name ? ` at ${r.shift.locations.name}` : ""}` : "a shift"} with ${r.swapWithName}`}
                </div>
                <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 2 }}>“{r.reason}”</div>
                {r.request_type === "swap" && (
                  <div style={{ fontSize: "0.85rem", marginTop: 4 }}>
                    {r.swapWithName}:{" "}
                    {r.swap_status === "accepted"
                      ? "accepted ✓"
                      : r.swap_status === "declined"
                        ? "declined ✗"
                        : "hasn't answered yet"}
                  </div>
                )}
                {r.request_type === "swap" && r.swap_status === "accepted" && (
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4 }}>
                    Approving moves this shift to {r.swapWithName}. A shift with recorded
                    time on it can't be swapped.
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <input
                    value={decisionNotes[r.id] || ""}
                    onChange={(e) => setDecisionNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="Note for the employee (optional)"
                    maxLength={500}
                    style={{ ...input, flex: 1, minWidth: 200 }}
                  />
                  <button
                    type="button"
                    disabled={r.request_type === "swap" && r.swap_status !== "accepted"}
                    onClick={() => decideRequest(r, "approved")}
                    style={approveButton}
                  >
                    Approve
                  </button>
                  <button type="button" onClick={() => decideRequest(r, "denied")} style={denyButton}>
                    Deny
                  </button>
                </div>
                {r.request_type === "swap" && r.swap_status !== "accepted" && (
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4 }}>
                    {r.swap_status === "declined"
                      ? `${r.swapWithName} declined — deny to close this out.`
                      : `Waiting on ${r.swapWithName} to accept before this can be approved.`}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 0 }}>
            Recording a decision here never changes the schedule or anyone's time by itself —
            edit the shifts themselves when a change is needed. The one exception is approving
            a swap: that moves the shift to the teammate who accepted it. Recorded time itself
            is never changed by a decision here.
          </p>
        </section>
      )}

      {isManager && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Add a shift</h3>
          <form onSubmit={addShift} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} required style={input}>
              <option value="">Choose a location…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={form.member_id} onChange={(e) => {
              const picked = members.find((m) => m.id === e.target.value) || null;
              setForm({ ...form, member_id: e.target.value, department: presetDepartmentFor(picked) });
            }} style={input}>
              <option value="">Assign to… (optional)</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.display_name} ({m.email})</option>)}
            </select>
            {form.member_id && (
              <label style={labelStyle}>
                Working as
                <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} style={input}>
                  <option value="">Choose what this shift is for…</option>
                  {workOptionsFor(members.find((m) => m.id === form.member_id) || null).map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
              </label>
            )}
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
            {confirmAdd && addSummary ? (
              <div style={{ display: "grid", gap: 8, border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
                <strong>Check this shift before you create it</strong>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: "0.92rem" }}>
                  <li>Company: <strong>{company.name}</strong></li>
                  <li>Who: <strong>{addSummary.who ? `${addSummary.who.display_name} (${addSummary.who.email})` : "Unassigned — open shift"}</strong></li>
                  <li>Where: <strong>{addSummary.where ? addSummary.where.name : "No location"}</strong></li>
                  <li>When: <strong>{addSummary.when}</strong></li>
                  {confirmAdd.department && <li>Working as: <strong>{confirmAdd.department}</strong></li>}
                  {confirmAdd.pattern !== "once" && (
                    <li>Repeats: <strong>{confirmAdd.label} — {confirmAdd.dates.length} shifts, {addSummary.range}</strong></li>
                  )}
                  {addSummary.first.notes && <li>Notes: {addSummary.first.notes}</li>}
                </ul>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={confirmAddShift} disabled={adding} style={{ ...button, flex: 1 }}>
                    {adding ? "Creating…" : confirmAdd.dates.length > 1 ? `Create ${confirmAdd.dates.length} shifts` : "Create shift"}
                  </button>
                  <button type="button" onClick={() => setConfirmAdd(null)} disabled={adding} style={{ ...secondaryButton, flex: 1 }}>Back</button>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
                  Nothing is created until you tap Create. Back returns to the form with everything still filled in.
                </p>
              </div>
            ) : (
              <button type="submit" style={button}>Add shift</button>
            )}
          </form>
        </section>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {view === "list" ? (
          <>
            {shifts.length === 0 && <p style={{ color: "var(--muted)" }}>No upcoming shifts yet.</p>}
            {shifts.map(shiftCard)}
          </>
        ) : view === "week" ? (
          weekView()
        ) : (
          monthView()
        )}
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

const repeatsLink = {
  border: "1px solid var(--line)",
  borderRadius: 999,
  padding: "6px 14px",
  textDecoration: "none",
  color: "inherit",
  fontWeight: 700,
  fontSize: "0.9rem",
  background: "#fff",
  whiteSpace: "nowrap",
};

const approveButton = {
  padding: "9px 18px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const denyButton = {
  padding: "9px 18px",
  borderRadius: 999,
  border: "1px solid #b3261e",
  background: "#fff",
  color: "#b3261e",
  fontWeight: 800,
  cursor: "pointer",
};

const ghostBtn = {
  border: "1px solid var(--line)",
  borderRadius: 999,
  padding: "8px 14px",
  background: "#fff",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const dayBlock = {
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 12,
  background: "#fff",
};

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

const monthGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 6,
};

const monthHeader = {
  textAlign: "center",
  fontWeight: 800,
  fontSize: "0.8rem",
  color: "var(--muted)",
  padding: "4px 0",
};

const monthBlank = {
  minHeight: 64,
};

const monthCell = {
  border: "1px solid var(--line)",
  borderRadius: 12,
  background: "#fff",
  padding: "6px 4px",
  minHeight: 64,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 1,
  cursor: "pointer",
  textAlign: "left",
  fontSize: "0.75rem",
  color: "inherit",
  overflow: "hidden",
};

const monthTodayCell = {
  border: "2px solid var(--brand)",
};

const monthSelectedCell = {
  background: "#e6f4ea",
  border: "2px solid #1e7e34",
};

const monthCount = {
  color: "#1e7e34",
  fontWeight: 800,
  fontSize: "0.72rem",
};

const monthName = {
  color: "var(--muted)",
  fontSize: "0.7rem",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "100%",
};
