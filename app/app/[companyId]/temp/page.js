"use client";

import { useContext, useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { CompanyContext } from "../../../../lib/company-context";
import Playbook from "./Playbook";
import { ClientsTab, OffersTab } from "./Intake";

const TABS = [
  { key: "requests", label: "Job Requests" },
  { key: "temps", label: "Temp Pool" },
  { key: "offers", label: "Shift Offers" },
  { key: "clients", label: "Clients" },
  { key: "hire", label: "Temp-to-Hire" },
  { key: "playbook", label: "📖 Playbook" },
  { key: "settings", label: "Agency Settings" },
];

const STAFFING_LANES = [
  { key: "cleaning", label: "Cleaning / Janitorial" },
  { key: "office", label: "Office / Administrative" },
  { key: "manufacturing", label: "Manufacturing / Industrial" },
  { key: "hospitality", label: "Hospitality / Events" },
  { key: "general_labor", label: "General Labor" },
];
const LANE_LABELS = Object.fromEntries(STAFFING_LANES.map((l) => [l.key, l.label]));
const ENGAGEMENT_LABELS = { temp: "Temp", temp_to_hire: "Temp-to-hire", direct_hire: "Direct hire" };

const STATUS_LABELS = {
  pending: "New",
  quoted: "Quoted",
  paid: "Paid",
  assigned: "Staffed",
  in_progress: "In Progress",
  completed: "Done",
  cancelled: "Cancelled",
};

export default function TempDashboard() {
  const { company, member } = useContext(CompanyContext) || {};
  const [tab, setTab] = useState("requests");
  const [isAgency, setIsAgency] = useState(null);
  const [requests, setRequests] = useState([]);
  const [apps, setApps] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState("");

  const isManager = member && ["owner", "admin", "manager"].includes(member.role);

  useEffect(() => {
    if (!company?.id) return;
    (async () => {
      const sb = supabase();
      const { data: session } = await sb.auth.getSession();
      const token = session?.session?.access_token;
      const r = await fetch(`/api/temp/agency?companyId=${company.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const j = await r.json();
      setIsAgency(!!j.isAgency);
      if (j.isAgency) { loadAll(); loadConversions(); }
    })();
  }, [company?.id]);

  async function loadAll() {
    const sb = supabase();
    const [{ data: rq }, { data: ap }, { data: cf }] = await Promise.all([
      sb.from("temp_job_requests").select("*").eq("company_id", company.id).order("created_at", { ascending: false }).limit(100),
      sb.from("temp_applications").select("*").eq("company_id", company.id).order("created_at", { ascending: false }).limit(200),
      sb.from("temp_agency_config").select("*").eq("company_id", company.id).maybeSingle(),
    ]);
    setRequests(rq || []);
    setApps(ap || []);
    setCfg(cf || null);
    // Skill tags (tolerant: table arrives with migration 046).
    try {
      const { data: sk, error: skErr } = await sb.from("temp_member_skills").select("*").eq("company_id", company.id).limit(500);
      setSkills(skErr ? [] : (sk || []));
    } catch {
      setSkills([]);
    }
    // Assignments for this company's requests (profiles + dispatch view).
    const ids = (rq || []).map((r) => r.id);
    if (ids.length > 0) {
      const { data: asg } = await sb.from("temp_assignments").select("*").in("job_request_id", ids).limit(500);
      setAssignments(asg || []);
    } else {
      setAssignments([]);
    }
  }

  async function setRequestStatus(id, status) {
    const { error } = await supabase().from("temp_job_requests").update({ status }).eq("id", id);
    setMsg(error ? "Update failed: " + error.message : "Updated.");
    if (!error) loadAll();
  }

  const [assigning, setAssigning] = useState({});
  const [hireTrack, setHireTrack] = useState({});
  const [conversions, setConversions] = useState([]);
  // Batch 1: temp profiles, skill tags, per-assignment pay.
  const [skills, setSkills] = useState([]);
  const [newSkill, setNewSkill] = useState({});
  const [assignments, setAssignments] = useState([]);
  const [expandedTemp, setExpandedTemp] = useState(null);
  const [payRate, setPayRate] = useState({});
  // Batch 2: backfill picker.
  const [replacing, setReplacing] = useState({});

  async function loadConversions() {
    const { data } = await supabase()
      .from("temp_hire_conversions")
      .select("*")
      .eq("company_id", company.id)
      .order("eligible_date", { ascending: true })
      .limit(100);
    setConversions(data || []);
  }

  async function markConverted(id) {
    const { error } = await supabase()
      .from("temp_hire_conversions")
      .update({ status: "converted", converted_at: new Date().toISOString() })
      .eq("id", id);
    setMsg(error ? "Update failed: " + error.message : "Marked as hired by client.");
    if (!error) loadConversions();
  }

  // ---------- Batch 1: profiles, skills, per-assignment pay ----------
  async function enableTemp() {
    const { error } = await supabase()
      .from("temp_agency_config")
      .insert({ company_id: company.id, enabled: true });
    if (error) {
      setMsg("Enable failed: " + error.message);
      return;
    }
    setIsAgency(true);
    setMsg("Temp staffing enabled for this company.");
    loadAll();
  }

  function skillsFor(memberId) {
    return skills.filter((s) => s.member_id === memberId);
  }

  async function addSkill(memberId) {
    const skill = (newSkill[memberId] || "").trim().toLowerCase();
    if (!skill || !memberId) return;
    const { error } = await supabase().from("temp_member_skills").insert({
      company_id: company.id,
      member_id: memberId,
      skill,
    });
    if (error) {
      setMsg("Add skill failed: " + error.message);
      return;
    }
    setNewSkill({ ...newSkill, [memberId]: "" });
    const { data } = await supabase().from("temp_member_skills").select("*").eq("company_id", company.id).limit(500);
    setSkills(data || []);
  }

  async function removeSkill(id) {
    const { error } = await supabase().from("temp_member_skills").delete().eq("id", id);
    if (error) {
      setMsg("Remove failed: " + error.message);
    } else {
      setSkills(skills.filter((s) => s.id !== id));
    }
  }

  function assignmentsFor(memberId) {
    return assignments.filter((a) => a.member_id === memberId);
  }

  function requestFor(jobId) {
    return requests.find((r) => r.id === jobId);
  }

  function fmtPay(cents) {
    return cents == null ? "" : ` · $${(cents / 100).toFixed(2)}/hr`;
  }

  // ---------- Batch 2: backfill ----------
  async function markNoShow(assignmentId) {
    if (!window.confirm("Mark this temp as a no-show?")) return;
    const { error } = await supabase()
      .from("temp_assignments")
      .update({ status: "no_show" })
      .eq("id", assignmentId);
    setMsg(error ? "Update failed: " + error.message : "Marked as no-show. Pick a replacement below.");
    if (!error) loadAll();
  }

  async function assignTemp(jobId, appId, payCents = null) {
    const app = apps.find((a) => a.id === appId);
    if (!app?.member_id) {
      setMsg("Temp needs an approved team invite first.");
      return;
    }
    const days = parseInt(hireTrack[jobId] || "90", 10);
    const eligible = new Date();
    eligible.setDate(eligible.getDate() + days);
    // Per-assignment pay: explicit override (backfill keeps the old rate),
    // otherwise the box input, otherwise the company default.
    let cents = payCents;
    if (cents == null) {
      const entered = payRate[jobId];
      const rate = (entered === undefined || entered === "")
        ? parseFloat(cfg?.temp_hourly_pay ?? 20) || 20
        : parseFloat(entered) || 0;
      cents = Math.round(rate * 100);
    }
    const { error } = await supabase().from("temp_assignments").insert({
      job_request_id: jobId,
      member_id: app.member_id,
      status: "offered",
      pay_rate_cents: cents,
      hire_track_days: days,
      hire_eligible_date: eligible.toISOString().slice(0, 10),
    });
    if (error) {
      setMsg("Assign failed: " + error.message);
    } else {
      // Create the temp-to-hire clock.
      await supabase().from("temp_hire_conversions").insert({
        company_id: company.id,
        member_id: app.member_id,
        client_name: requests.find((r) => r.id === jobId)?.customer_name || "",
        first_work_date: new Date().toISOString().slice(0, 10),
        hire_track_days: days,
        eligible_date: eligible.toISOString().slice(0, 10),
        status: "cooling",
      });
      setRequestStatus(jobId, "assigned");
      setMsg(`Assigned ${app.full_name}. Temp-to-hire eligible after ${days} days.`);
    }
  }

  async function setAppStatus(id, status, bgStatus) {
    const app = apps.find((a) => a.id === id);
    const patch = { status };
    if (bgStatus) patch.bg_check_status = bgStatus;
    // On approval, auto-create the pending team invite so the temp can sign
    // up with their email and clock in. claim_invite() links them on signup.
    if (status === "approved" && app && !app.member_id) {
      const { data: mem, error: memErr } = await supabase()
        .from("company_members")
        .insert({
          company_id: company.id,
          user_id: null,
          email: app.email,
          display_name: app.full_name,
          role: "employee",
        })
        .select("id")
        .single();
      if (!memErr && mem) patch.member_id = mem.id;
    }
    const { error } = await supabase().from("temp_applications").update(patch).eq("id", id);
    setMsg(error ? "Update failed: " + error.message : status === "approved" ? "Approved — invite sent. Temp signs up with their email to join." : "Updated.");
    if (!error) loadAll();
  }

  async function saveCfg(e) {
    e.preventDefault();
    const parsedRates = {};
    for (const [k, v] of Object.entries(cfg.service_rates || {})) {
      if (v !== "" && v != null) parsedRates[k] = parseFloat(v) || 0;
    }
    const base = {
      base_hourly_rate: parseFloat(cfg.base_hourly_rate) || 35,
      temp_hourly_pay: parseFloat(cfg.temp_hourly_pay) || 20,
      conversion_fee: parseFloat(cfg.conversion_fee) || 0,
      updated_at: new Date().toISOString(),
    };
    // Try with per-service rates + staffing lanes; fall back if migrations haven't run yet.
    const full = { ...base, service_rates: parsedRates };
    if (cfg.staffing_types) full.staffing_types = cfg.staffing_types;
    let { error } = await supabase()
      .from("temp_agency_config")
      .update(full)
      .eq("company_id", company.id);
    if (error && /service_rates|staffing_types/i.test(error.message)) {
      ({ error } = await supabase()
        .from("temp_agency_config")
        .update(base)
        .eq("company_id", company.id));
    }
    setMsg(error ? "Save failed: " + error.message : "Settings saved.");
  }

  if (isAgency === null) {
    return (
      <main className="site-shell"><section className="panel" style={{ padding: 30 }}>Loading…</section></main>
    );
  }
  if (!isManager) {
    return <TempOffersView companyId={company.id} />;
  }
  if (!isAgency) {
    return (
      <main className="site-shell">
        <section className="panel" style={{ padding: 30 }}>
          <h2>Temp staffing isn't enabled for this company</h2>
          <p style={{ color: "var(--muted)" }}>
            Turn it on to get job requests, the temp pool, per-assignment pay, and dispatch here.
            You can enable it for both your cleaning company and your staffing company — each keeps its own rates.
          </p>
          <button className="btn-primary" style={{ padding: "10px 20px", marginTop: 12 }} onClick={enableTemp}>
            Enable temp staffing
          </button>
          {msg && <p style={{ color: "var(--muted)", fontSize: 14 }}>{msg}</p>}
        </section>
      </main>
    );
  }

  const pendingApps = apps.filter((a) => a.status === "applied");
  const approvedTemps = apps.filter((a) => a.status === "approved");

  return (
    <main className="site-shell">
      <section className="panel" style={{ padding: 24 }}>
        <p className="kicker">Temp Staffing</p>
        <h1 style={{ marginTop: 4 }}>Agency dashboard</h1>
        <p style={{ marginTop: 8, fontSize: 14 }}>
          <a href="temp-pay" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            💵 Temp pay owed →
          </a>{" "}
          <span style={{ color: "var(--muted)" }}>what each temp is owed on completed jobs</span>
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={tab === t.key ? "btn-primary" : "btn-ghost"}
              style={{ padding: "8px 16px" }}
            >
              {t.label}
              {t.key === "requests" && requests.filter((r) => r.status === "pending").length > 0 && (
                <span> ({requests.filter((r) => r.status === "pending").length})</span>
              )}
              {t.key === "temps" && pendingApps.length > 0 && <span> ({pendingApps.length})</span>}
            </button>
          ))}
        </div>
        {msg && <p style={{ color: "var(--muted)", fontSize: 14 }}>{msg}</p>}
      </section>

      {tab === "requests" && (
        <section className="panel" style={{ padding: 24, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Job requests</h2>
          {requests.length === 0 && <p style={{ color: "var(--muted)" }}>No requests yet.</p>}
          {requests.map((r) => {
            const reqAsg = assignments.filter((a) => a.job_request_id === r.id);
            const assignedIds = new Set(reqAsg.map((a) => a.member_id));
            const reqLane = r.staffing_type || "cleaning";
            // Multi-type matching: lane overlap first, then skill hints.
            const laneMatched = approvedTemps.filter(
              (t) => t.member_id && !assignedIds.has(t.member_id) &&
                ((t.staffing_types || ["cleaning"]).includes(reqLane))
            );
            const laneOthers = approvedTemps.filter(
              (t) => t.member_id && !assignedIds.has(t.member_id) &&
                !((t.staffing_types || ["cleaning"]).includes(reqLane))
            );
            const availableTemps = [...laneMatched, ...laneOthers];
            const needsBackfill = reqAsg.some((a) => a.status === "no_show" || a.status === "declined");
            return (
            <div key={r.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <strong>{r.service_type.replace(/_/g, " ")}</strong>
                <span className="badge">{STATUS_LABELS[r.status] || r.status}</span>
              </div>
              <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>
                <span className="badge">{LANE_LABELS[r.staffing_type] || r.staffing_type || "Cleaning / Janitorial"}</span>{" "}
                <span className="badge">{ENGAGEMENT_LABELS[r.engagement_type] || "Temp"}</span>
                <br />
                {r.cleaners_needed} temp(s) × {r.hours_requested} hr · {r.customer_name}{r.customer_email ? ` · ${r.customer_email}` : ""}
                <br />
                {r.site_address} {r.job_date ? `· ${r.job_date}` : ""}
                {r.shift_start ? ` · ${String(r.shift_start).slice(0, 5)}–${String(r.shift_end || "").slice(0, 5)}` : ""}
                {r.recurring_days?.length ? <><br />Recurring: {r.recurring_days.join(", ")}{r.recurring_until ? ` until ${r.recurring_until}` : ""}</> : null}
                {r.on_site_contact_name ? <><br />On-site: {r.on_site_contact_name}{r.on_site_contact_phone ? ` (${r.on_site_contact_phone})` : ""}</> : null}
                {r.bill_rate_confirmed ? <><br />Rate confirmed: ${Number(r.bill_rate_confirmed).toFixed(2)}/hr</> : null}
                {r.quoted_cents ? <><br />Quoted: ${(r.quoted_cents / 100).toFixed(2)}</> : null}
                {r.hours_confirmed != null ? <><br />✅ Client confirmed {r.hours_confirmed} hr</> : null}
              </div>
              {r.job_details && <p style={{ fontSize: 14 }}>{r.job_details}</p>}
              {(r.status === "paid" || r.status === "assigned") && approvedTemps.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: "var(--panel-2, #f6f7fb)", borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Assign a temp</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      value={assigning[r.id] || ""}
                      onChange={(e) => setAssigning({ ...assigning, [r.id]: e.target.value })}
                      style={{ padding: 8, flex: 1, minWidth: 160 }}
                    >
                      <option value="">Choose temp…</option>
                      {availableTemps.map((t) => {
                        const sk = skillsFor(t.member_id).map((s) => s.skill).join(", ");
                        const crossLane = !((t.staffing_types || ["cleaning"]).includes(reqLane));
                        return (
                          <option key={t.id} value={t.id}>
                            {t.full_name}{sk ? ` (${sk})` : ""}{crossLane ? " — other lane" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                      Pay $/hr
                      <input
                        type="number" step="0.01" min="0"
                        value={payRate[r.id] ?? cfg?.temp_hourly_pay ?? 20}
                        onChange={(e) => setPayRate({ ...payRate, [r.id]: e.target.value })}
                        style={{ padding: 8, width: 84 }}
                        title="Pay rate for this assignment (blank = company default)"
                      />
                    </label>
                    <select
                      value={hireTrack[r.id] || "90"}
                      onChange={(e) => setHireTrack({ ...hireTrack, [r.id]: e.target.value })}
                      style={{ padding: 8 }}
                      title="Temp-to-hire track"
                    >
                      <option value="90">Hire after 90 days</option>
                      <option value="180">Hire after 6 months</option>
                    </select>
                    <button
                      className="btn-primary"
                      style={{ padding: "8px 16px" }}
                      disabled={!assigning[r.id]}
                      onClick={() => assignTemp(r.id, assigning[r.id])}
                    >
                      Assign
                    </button>
                  </div>
                </div>
              )}
              {reqAsg.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: "var(--panel-2, #f6f7fb)", borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Assigned temps</div>
                  {reqAsg.map((a) => {
                    const ta = apps.find((x) => x.member_id === a.member_id);
                    const actionable = ["offered", "accepted", "in_progress"].includes(a.status);
                    return (
                      <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13 }}>
                        <span>• {ta?.full_name || "Temp"} — {a.status}{fmtPay(a.pay_rate_cents)}</span>
                        {actionable && (
                          <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => markNoShow(a.id)}>
                            No-show
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {needsBackfill && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border, #e5e7eb)" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Backfill — send a replacement fast</div>
                      {availableTemps.length === 0 ? (
                        <div style={{ fontSize: 13, color: "var(--muted)" }}>No other approved temps available.</div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <select
                            value={replacing[r.id] || ""}
                            onChange={(e) => setReplacing({ ...replacing, [r.id]: e.target.value })}
                            style={{ padding: 8, flex: 1, minWidth: 160 }}
                          >
                            <option value="">Choose replacement…</option>
                            {availableTemps.map((t) => {
                              const sk = skillsFor(t.member_id).map((s) => s.skill).join(", ");
                              return <option key={t.id} value={t.id}>{t.full_name}{sk ? ` (${sk})` : ""}</option>;
                            })}
                          </select>
                          <button
                            className="btn-primary"
                            style={{ padding: "8px 16px" }}
                            disabled={!replacing[r.id]}
                            onClick={() => {
                              const ns = reqAsg.find((a) => a.status === "no_show" || a.status === "declined");
                              assignTemp(r.id, replacing[r.id], ns?.pay_rate_cents ?? null);
                              setReplacing({ ...replacing, [r.id]: "" });
                            }}
                          >
                            Send replacement
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {["paid", "assigned", "in_progress", "completed", "cancelled"].map((s) => (
                  <button key={s} className="btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}
                    onClick={() => setRequestStatus(r.id, s)} disabled={r.status === s}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            );
          })}
        </section>
      )}

      {tab === "temps" && (
        <section className="panel" style={{ padding: 24, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Applications ({pendingApps.length} pending)</h2>
          {pendingApps.map((a) => (
            <div key={a.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
              <strong>{a.full_name}</strong>
              <div style={{ fontSize: 14, color: "var(--muted)" }}>
                {a.email} {a.phone ? `· ${a.phone}` : ""}
                <br />
                Background check: {a.bg_check_status}
                {a.bg_check_consent ? " (consent on file)" : " (NO CONSENT)"}
                {a.experience ? <><br />Experience: {a.experience.slice(0, 200)}</> : null}
                {a.availability ? <><br />Availability: {a.availability.slice(0, 200)}</> : null}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn-primary" style={{ padding: "6px 14px" }}
                  onClick={() => setAppStatus(a.id, "approved", "clear")}>Approve</button>
                <button className="btn-ghost" style={{ padding: "6px 14px" }}
                  onClick={() => setAppStatus(a.id, "rejected")}>Reject</button>
              </div>
            </div>
          ))}
          <h2 style={{ marginTop: 24 }}>Approved temps ({approvedTemps.length})</h2>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Tap a temp to see their profile, skill tags, and past assignments.</p>
          {approvedTemps.map((a) => {
            const sk = skillsFor(a.member_id);
            const hist = assignmentsFor(a.member_id);
            const open = expandedTemp === a.id;
            return (
              <div key={a.id} className="card" style={{ padding: 12, marginBottom: 8, fontSize: 14 }}>
                <div
                  onClick={() => setExpandedTemp(open ? null : a.id)}
                  style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
                >
                  <span>
                    <strong>{a.full_name}</strong> · {a.email} {a.phone ? `· ${a.phone}` : ""}
                    {sk.length > 0 && (
                      <span style={{ color: "var(--muted)" }}> · {sk.map((s) => s.skill).join(", ")}</span>
                    )}
                  </span>
                  <span style={{ color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
                </div>
                {open && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 10 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>
                      <strong>Lanes:</strong> {(a.staffing_types || ["cleaning"]).map((k) => LANE_LABELS[k] || k).join(", ")}
                    </div>
                    {a.availability && <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Availability:</strong> {a.availability}</div>}
                    {(a.earliest_start || a.latest_end) && (
                      <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Hours:</strong> {a.earliest_start ? String(a.earliest_start).slice(0, 5) : "?"}–{a.latest_end ? String(a.latest_end).slice(0, 5) : "?"}{a.max_hours_per_week ? ` · max ${a.max_hours_per_week}/wk` : ""}</div>
                    )}
                    {a.city && <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Location:</strong> {a.city}{a.zip ? ` ${a.zip}` : ""}</div>}
                    {a.reliable_transportation != null && <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Transportation:</strong> {a.reliable_transportation ? "Yes" : "No"}</div>}
                    {a.experience && <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Experience:</strong> {a.experience}</div>}
                    {a.years_experience != null && <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Years:</strong> {a.years_experience}</div>}
                    {(a.emergency_contact_name || a.emergency_contact_phone) && (
                      <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Emergency:</strong> {a.emergency_contact_name}{a.emergency_contact_relation ? ` (${a.emergency_contact_relation})` : ""}{a.emergency_contact_phone ? ` · ${a.emergency_contact_phone}` : ""}</div>
                    )}
                    <div style={{ fontSize: 13, marginBottom: 6 }}>
                      <strong>Screening:</strong> BG {a.bg_check_status}{a.bg_check_consent ? " (consent ✓)" : " (NO CONSENT)"}
                      {a.drug_policy_ack ? " · drug policy acknowledged" : ""}{a.i9_completed != null ? ` · I-9 ${a.i9_completed ? "done" : "pending"}` : ""}
                    </div>
                    {(a.reference_1_name || a.reference_2_name) && (
                      <div style={{ fontSize: 13, marginBottom: 6 }}><strong>References:</strong> {[a.reference_1_name && `${a.reference_1_name} (${a.reference_1_phone || "no phone"})`, a.reference_2_name && `${a.reference_2_name} (${a.reference_2_phone || "no phone"})`].filter(Boolean).join(" · ")}</div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Skill tags</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      {sk.map((s) => (
                        <span key={s.id} className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {s.skill}
                          <button
                            onClick={() => removeSkill(s.id)}
                            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
                            title="Remove skill"
                          >×</button>
                        </span>
                      ))}
                      {sk.length === 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>No skills yet.</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={newSkill[a.member_id] || ""}
                        onChange={(e) => setNewSkill({ ...newSkill, [a.member_id]: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") addSkill(a.member_id); }}
                        placeholder="Add a skill, e.g. floor care"
                        style={{ padding: 8, flex: 1, fontSize: 13 }}
                      />
                      <button className="btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => addSkill(a.member_id)}>
                        Add
                      </button>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>
                      Past assignments ({hist.length})
                    </div>
                    {hist.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>No assignments yet.</div>}
                    {hist.map((h) => {
                      const rq = requestFor(h.job_request_id);
                      return (
                        <div key={h.id} style={{ fontSize: 13, padding: "4px 0" }}>
                          • {rq ? `${rq.service_type.replace(/_/g, " ")} — ${rq.customer_name}${rq.job_date ? ` (${rq.job_date})` : ""}` : "Job"} — {h.status}{fmtPay(h.pay_rate_cents)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === "offers" && (
        <OffersTab companyId={company.id} typeLabels={LANE_LABELS}
          temps={apps.filter((a) => a.status === "approved" && a.member_id)} />
      )}

      {tab === "clients" && (
        <ClientsTab companyId={company.id}
          staffingTypes={cfg?.staffing_types?.length ? cfg.staffing_types : ["cleaning"]}
          typeLabels={LANE_LABELS} />
      )}

      {tab === "hire" && (
        <section className="panel" style={{ padding: 24, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Temp-to-hire tracking</h2>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Clients may hire temps directly once the track period ends. Early
            buyouts use your conversion fee.
          </p>
          {conversions.length === 0 && (
            <p style={{ color: "var(--muted)" }}>No active hire tracks yet.</p>
          )}
          {conversions.map((c) => {
            const eligible = new Date(c.eligible_date) <= new Date();
            return (
              <div key={c.id} className="card" style={{ padding: 14, marginBottom: 10, fontSize: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <strong>{c.client_name}</strong>
                  <span className="badge">
                    {c.status === "converted" ? "Hired" : eligible ? "Eligible now" : `Eligible ${c.eligible_date}`}
                  </span>
                </div>
                <div style={{ color: "var(--muted)", marginTop: 4 }}>
                  Track: {c.hire_track_days} days · Since {c.first_work_date}
                  {c.conversion_fee_cents > 0 ? ` · Fee: $${(c.conversion_fee_cents / 100).toFixed(2)}` : ""}
                </div>
                {c.status !== "converted" && eligible && (
                  <button className="btn-primary" style={{ padding: "6px 14px", marginTop: 8 }}
                    onClick={() => markConverted(c.id)}>
                    Mark hired by client
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === "playbook" && <Playbook />}

      {tab === "settings" && cfg && (
        <section className="panel" style={{ padding: 24, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Agency settings</h2>
          <form onSubmit={saveCfg} style={{ display: "grid", gap: 12, maxWidth: 400 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Temp lanes this agency runs</div>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 8px" }}>
                Pick every kind of temp work you staff — cleaning, office, manufacturing, or all of them.
                Applications, skills and matching follow these lanes.
              </p>
              {STAFFING_LANES.map((l) => {
                const on = (cfg.staffing_types || ["cleaning"]).includes(l.key);
                return (
                  <label key={l.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const cur = cfg.staffing_types || ["cleaning"];
                        const next = e.target.checked ? [...cur, l.key] : cur.filter((k) => k !== l.key);
                        setCfg({ ...cfg, staffing_types: next.length ? next : ["cleaning"] });
                      }}
                    />
                    {l.label}
                  </label>
                );
              })}
            </div>
            <label>
              Default customer rate — per cleaner, per hour ($)
              <input type="number" step="0.01" min="0" value={cfg.base_hourly_rate}
                onChange={(e) => setCfg({ ...cfg, base_hourly_rate: e.target.value })}
                style={{ width: "100%", padding: 10, marginTop: 4 }} />
            </label>
            <div style={{ fontWeight: 700, marginTop: 4 }}>Rate per job type ($/hr)</div>
            {[
              ["commercial", "Office & Commercial"],
              ["residential", "Residential"],
              ["move_in_out", "Move In / Move Out"],
              ["construction_cleanup", "Construction Cleanup"],
              ["day_janitorial", "Warehouse & Day Janitorial"],
              ["other", "Other / Event"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input type="number" step="0.01" min="0"
                  value={cfg.service_rates?.[key] ?? ""}
                  placeholder="uses default"
                  onChange={(e) =>
                    setCfg({
                      ...cfg,
                      service_rates: { ...(cfg.service_rates || {}), [key]: e.target.value },
                    })
                  }
                  style={{ width: "100%", padding: 10, marginTop: 4 }} />
              </label>
            ))}
            <label>
              Temp pay — per hour ($)
              <input type="number" step="0.01" min="0" value={cfg.temp_hourly_pay}
                onChange={(e) => setCfg({ ...cfg, temp_hourly_pay: e.target.value })}
                style={{ width: "100%", padding: 10, marginTop: 4 }} />
            </label>
            <label>
              Temp-to-hire conversion fee ($, 0 = none)
              <input type="number" step="0.01" min="0" value={cfg.conversion_fee}
                onChange={(e) => setCfg({ ...cfg, conversion_fee: e.target.value })}
                style={{ width: "100%", padding: 10, marginTop: 4 }} />
            </label>
            <button type="submit" className="btn-primary" style={{ padding: 12 }}>Save</button>
          </form>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
            {`Your public links — always share these (they carry your company, so bookings and applications can't land on another agency): /temp/book?agency=${company.id} · /temp/apply?agency=${company.id}`}
          </p>
        </section>
      )}
    </main>
  );
}

// ---------------- Temp-facing shift offers (POINT 4) ----------------
function TempOffersView({ companyId }) {
  const [offers, setOffers] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: session } = await supabase().auth.getSession();
    const token = session?.session?.access_token;
    const r = await fetch(`/api/temp/offers?companyId=${companyId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const j = await r.json();
    if (j.offers) setOffers(j.offers);
    setLoading(false);
  }
  useEffect(() => { load(); }, [companyId]);

  async function respond(id, action) {
    setMsg("");
    const { data: session } = await supabase().auth.getSession();
    const token = session?.session?.access_token;
    const r = await fetch("/api/temp/offers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ id, companyId, action }),
    });
    const j = await r.json();
    setMsg(j.ok ? (action === "accepted" ? "Shift accepted — see you there." : "Offer declined.") : j.error || "Update failed.");
    if (j.ok) load();
  }

  const open = offers.filter((o) => o.status === "offered");
  const past = offers.filter((o) => o.status !== "offered");

  return (
    <main className="site-shell">
      <section className="panel" style={{ padding: 24 }}>
        <p className="kicker">Temp Staffing</p>
        <h1 style={{ marginTop: 4 }}>My shift offers ({open.length} open)</h1>
        {msg && <p style={{ color: "var(--muted)", fontSize: 14 }}>{msg}</p>}
        {loading && <p style={{ color: "var(--muted)" }}>Loading…</p>}
        {!loading && open.length === 0 && (
          <p style={{ color: "var(--muted)" }}>No open offers right now. New shift offers will appear here.</p>
        )}
        {open.map((o) => (
          <div key={o.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
            <strong>{o.client_name}</strong>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>
              {o.shift_date} · {String(o.start_time).slice(0, 5)}–{String(o.end_time).slice(0, 5)} · ${Number(o.pay_rate).toFixed(2)}/hr
              <br />{o.site_address}
              {o.respond_by && <><br />Respond by {new Date(o.respond_by).toLocaleString()}</>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn-primary" style={{ padding: "8px 20px" }} onClick={() => respond(o.id, "accepted")}>
                Accept
              </button>
              <button className="btn-ghost" style={{ padding: "8px 20px" }} onClick={() => respond(o.id, "declined")}>
                Decline
              </button>
            </div>
          </div>
        ))}
        {past.length > 0 && (
          <>
            <h2 style={{ marginTop: 24 }}>Past offers</h2>
            {past.slice(0, 20).map((o) => (
              <div key={o.id} className="card" style={{ padding: 12, marginBottom: 8, fontSize: 14 }}>
                <strong>{o.client_name}</strong>{" "}
                <span className="badge">{o.status}</span>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  {o.shift_date} · {String(o.start_time).slice(0, 5)}–{String(o.end_time).slice(0, 5)} · ${Number(o.pay_rate).toFixed(2)}/hr
                  {o.status === "accepted" && o.report_to && (
                    <><br />Report to: {o.report_to}{o.parking_info ? ` · Park: ${o.parking_info}` : ""}{o.access_info ? ` · Access: ${o.access_info}` : ""}</>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </section>
    </main>
  );
}
