"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { UI_TO_DB_ROLE, roleLabel } from "../../../../lib/roles";
import { formatTime12h } from "../../../../lib/dates";

export default function TeamPage() {
  const { company, member, loading } = useCompany();
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ email: "", display_name: "", role: "employee" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ display_name: "", email: "" });
  // Team availability (migration 069): null = table not there yet / section
  // hidden; otherwise the company's availability rows for the viewer below.
  const [availability, setAvailability] = useState(null);
  // Two-tap confirm when changing the email of a member who already signed in.
  const [confirmEmailId, setConfirmEmailId] = useState(null);
  // Two-tap remove: native confirm() doesn't fire on some mobile browsers.
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  // Roster orientation (depth D-WT-19): whether the member_pay read in
  // load() succeeded — the summary below must never print a pay count
  // from a failed read.
  const [payLoaded, setPayLoaded] = useState(false);
  // Roster search: filters the member CARDS only. The availability
  // section further down always shows the full roster, as before.
  const [rosterQuery, setRosterQuery] = useState("");

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const isOwner = member && member.role === "owner";

  // My profile (migration 068): the member row from the layout is selected
  // with *, so the contact columns are simply absent until the migration
  // runs — that absence is the probe. No columns = read-only note, no crash.
  const profileReady = !!member && Object.prototype.hasOwnProperty.call(member, "phone");
  const [profileForm, setProfileForm] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    if (member && profileForm === null) {
      setProfileForm({
        display_name: member.display_name || "",
        phone: member.phone || "",
        emergency_contact_name: member.emergency_contact_name || "",
        emergency_contact_phone: member.emergency_contact_phone || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member]);

  async function saveProfile(e) {
    e.preventDefault();
    if (!profileForm.display_name.trim()) {
      alert("Your name can't be blank.");
      return;
    }
    setProfileSaving(true);
    // The ONLY self-service write path for member rows: a narrow RPC that
    // updates the caller's own name + contact fields — never role, pay,
    // departments or email.
    const { error } = await supabase().rpc("update_my_profile", {
      p_company_id: company.id,
      p_display_name: profileForm.display_name.trim(),
      p_phone: profileForm.phone.trim(),
      p_emergency_contact_name: profileForm.emergency_contact_name.trim(),
      p_emergency_contact_phone: profileForm.emergency_contact_phone.trim(),
    });
    setProfileSaving(false);
    if (error) {
      alert("Could not save your profile: " + error.message);
      return;
    }
    setProfileSaved(true);
    // Refresh so the new name shows in the header and everywhere else.
    setTimeout(() => window.location.reload(), 800);
  }

  // Department assignment: null/empty = all departments.
  const DEPTS = [
    { key: "hr", label: "👥 HR" },
    { key: "sales", label: "📞 Sales" },
    { key: "service", label: "💬 Customer Service" },
    { key: "accounting", label: "🧾 Accounting" },
    { key: "field", label: "🦺 Field Ops" },
    { key: "compliance", label: "⚖️ Compliance" },
  ];

  async function toggleDept(m, deptKey) {
    const cur = m.departments || null;
    const base = cur === null ? DEPTS.map((d) => d.key) : [...cur];
    const next = base.includes(deptKey)
      ? base.filter((k) => k !== deptKey)
      : [...base, deptKey];
    const { error } = await supabase()
      .from("company_members")
      .update({ departments: next })
      .eq("id", m.id);
    if (!error) {
      setMembers((ms) => ms.map((x) => (x.id === m.id ? { ...x, departments: next } : x)));
    }
  }

  async function load() {
    // Managers see the full roster (email/user_id needed for invites and
    // role changes). Everyone else sees the directory: id, display name,
    // role — no emails, no user ids.
    let data = null;
    if (isManager) {
      // Widest select first (departments from 045, contact fields from
      // 068); step down on the specific missing column rather than ever
      // locking a manager out over a not-yet-run migration.
      const selectMembers = (cols) =>
        supabase().from("company_members").select(cols).eq("company_id", company.id).order("display_name");
      const widest = await selectMembers(
        "id, user_id, email, display_name, role, created_at, departments, phone, emergency_contact_name, emergency_contact_phone"
      );
      if (!widest.error) {
        data = widest.data;
      } else if (/phone|emergency_contact/i.test(widest.error.message || "")) {
        const withDepts = await selectMembers("id, user_id, email, display_name, role, created_at, departments");
        data = withDepts.error
          ? (await selectMembers("id, user_id, email, display_name, role, created_at")).data
          : withDepts.data;
      } else if (/departments/i.test(widest.error.message || "")) {
        data = (await selectMembers("id, user_id, email, display_name, role, created_at")).data;
      } else {
        data = widest.data;
      }
    } else {
      const res = await supabase()
        .from("team_directory")
        .select("id, display_name, role")
        .eq("company_id", company.id)
        .order("display_name");
      data = res.data;
    }
    let rows = data || [];
    if (isManager) {
      // Pay rates live in member_pay, readable only by owners/admins.
      const { data: pay, error: payError } = await supabase()
        .from("member_pay")
        .select("member_id, cleaner_hourly_rate, manager_hourly_rate, cleaner_title, manager_title")
        .eq("company_id", company.id);
      const payByMember = {};
      for (const p of pay || []) payByMember[p.member_id] = p;
      setPayLoaded(!payError);
      rows = rows.map((m) => ({ ...m, pay: payByMember[m.id] || {} }));
    }
    setMembers(rows);
    if (isManager) {
      // Availability is probed: until migration 069 runs, the section
      // simply stays hidden — never an error in a manager's face.
      const av = await supabase()
        .from("employee_availability")
        .select("member_id, day_of_week, available, start_time, end_time, note")
        .eq("company_id", company.id);
      if (!av.error) setAvailability(av.data || []);
    }
  }

  const AVAIL_DAYS = [
    { dow: 1, short: "Mon" },
    { dow: 2, short: "Tue" },
    { dow: 3, short: "Wed" },
    { dow: 4, short: "Thu" },
    { dow: 5, short: "Fri" },
    { dow: 6, short: "Sat" },
    { dow: 0, short: "Sun" },
  ];

  function availabilityCells(memberId) {
    const rows = (availability || []).filter((r) => r.member_id === memberId);
    const byDow = {};
    for (const r of rows) byDow[r.day_of_week] = r;
    return AVAIL_DAYS.map((d) => {
      const r = byDow[d.dow];
      if (!r) return { ...d, text: "–", title: "No availability set" };
      if (!r.available) return { ...d, text: "✗", title: "Not available" };
      if (r.start_time && r.end_time) {
        return { ...d, text: `${formatTime12h(r.start_time)}–${formatTime12h(r.end_time)}`, title: "Available window" };
      }
      return { ...d, text: "✓", title: "Available" };
    });
  }

  function availabilityNotes(memberId) {
    return (availability || [])
      .filter((r) => r.member_id === memberId && r.note)
      .map((r) => `${AVAIL_DAYS.find((d) => d.dow === r.day_of_week)?.short || ""}: ${r.note}`);
  }

  useEffect(() => {
    if (!loading && company) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, isManager]);

  async function addMember(e) {
    e.preventDefault();
    const { error } = await supabase().from("company_members").insert({
      company_id: company.id,
      user_id: null,
      email: form.email.trim().toLowerCase(),
      display_name: form.display_name.trim(),
      role: UI_TO_DB_ROLE[form.role] || "employee",
    });
    if (error) alert("Could not add member: " + error.message);
    else {
      setForm({ email: "", display_name: "", role: "employee" });
      load();
    }
  }

  function startEdit(m) {
    setEditingId(m.id);
    setEditForm({ display_name: m.display_name || "", email: m.email || "" });
    setConfirmEmailId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setConfirmEmailId(null);
  }

  async function saveEdit(m) {
    const name = editForm.display_name.trim();
    const email = editForm.email.trim().toLowerCase();
    if (!name) {
      alert("Name can't be blank.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert("Enter a valid email address.");
      return;
    }
    const emailChanged = email !== (m.email || "").toLowerCase();
    // Changing the email of someone who already signed in can break the
    // auto-claim match — require a deliberate second tap.
    if (emailChanged && m.user_id && confirmEmailId !== m.id) {
      setConfirmEmailId(m.id);
      return;
    }
    const { error } = await supabase()
      .from("company_members")
      .update({ display_name: name, email })
      .eq("id", m.id);
    if (error) alert("Could not save: " + error.message);
    else {
      setEditingId(null);
      setConfirmEmailId(null);
      load();
    }
  }

  async function removeMember(m) {
    if (m.user_id === member.user_id) {
      alert("You can't remove yourself.");
      return;
    }
    if (m.role === "owner" && members.filter((x) => x.role === "owner").length === 1) {
      alert("You can't remove the last owner.");
      return;
    }
    if (confirmRemoveId !== m.id) {
      setConfirmRemoveId(m.id);
      return;
    }
    setConfirmRemoveId(null);
    const { error } = await supabase().from("company_members").delete().eq("id", m.id);
    if (error) alert("Could not remove: " + error.message);
    else load();
  }

  async function changeRole(m, uiRole) {
    const role = UI_TO_DB_ROLE[uiRole] || "employee";
    if (m.role === "owner" && role !== "owner" && members.filter((x) => x.role === "owner").length === 1) {
      alert("A company needs at least one owner.");
      return;
    }
    const { error } = await supabase().from("company_members").update({ role }).eq("id", m.id);
    if (error) alert("Could not change role: " + error.message);
    else load();
  }

  // Dual pay rates: cleaner $/hr + title, manager $/hr + title.
  // Setting both rates is what unlocks the "clock in as" picker for that person.
  async function changePayField(m, field, value) {
    let parsed = value;
    if (field.endsWith("_hourly_rate")) {
      parsed = value === "" ? null : parseFloat(value);
      if (value !== "" && (isNaN(parsed) || parsed < 0)) {
        alert("Enter a valid hourly rate.");
        return;
      }
    } else {
      parsed = value.trim() === "" ? null : value.trim();
    }
    const { error } = await supabase()
      .from("member_pay")
      .upsert(
        { member_id: m.id, company_id: company.id, [field]: parsed },
        { onConflict: "member_id" }
      );
    if (error) alert("Could not update pay: " + error.message);
    else load();
  }

  // Roster summary figures — computed only from rows load() already
  // fetched; nothing new is queried and nothing is written.
  const activeCount = members.filter((m) => m.user_id).length;
  const bothRatesCount = members.filter(
    (m) => m.pay && m.pay.cleaner_hourly_rate != null && m.pay.manager_hourly_rate != null
  ).length;
  const query = rosterQuery.trim().toLowerCase();
  const visibleMembers = query
    ? members.filter(
        (m) =>
          (m.display_name || "").toLowerCase().includes(query) ||
          (m.email || "").toLowerCase().includes(query)
      )
    : members;

  if (loading || !company) return <p>Loading…</p>;

  return (
    <div>
      <p className="eyebrow">TEAM</p>
      <h2 style={{ fontSize: "1.8rem" }}>Team members</h2>
      {members.length > 0 && (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "6px 0 0" }}>
          {members.length} team member{members.length === 1 ? "" : "s"}
          {isManager && (
            <>
              {" "}· {activeCount} active · {members.length - activeCount} invite pending
              {payLoaded && <> · {bothRatesCount} of {members.length} have both pay rates set</>}
            </>
          )}
        </p>
      )}

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>👤 My profile</h3>
        {profileReady && profileForm ? (
          <form onSubmit={saveProfile} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <label style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Your name (as the team sees it)
              <input
                value={profileForm.display_name}
                onChange={(e) => setProfileForm({ ...profileForm, display_name: e.target.value })}
                placeholder="Name"
                maxLength={80}
                required
                style={input}
              />
            </label>
            <label style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Your phone
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                placeholder="Phone (optional)"
                maxLength={40}
                style={input}
              />
            </label>
            <label style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Emergency contact — name
              <input
                value={profileForm.emergency_contact_name}
                onChange={(e) => setProfileForm({ ...profileForm, emergency_contact_name: e.target.value })}
                placeholder="Emergency contact name (optional)"
                maxLength={80}
                style={input}
              />
            </label>
            <label style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Emergency contact — phone
              <input
                type="tel"
                value={profileForm.emergency_contact_phone}
                onChange={(e) => setProfileForm({ ...profileForm, emergency_contact_phone: e.target.value })}
                placeholder="Emergency contact phone (optional)"
                maxLength={40}
                style={input}
              />
            </label>
            <button type="submit" disabled={profileSaving} style={button}>
              {profileSaving ? "Saving…" : profileSaved ? "Saved ✓ — refreshing…" : "Save my profile"}
            </button>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
              Only your name and contact details live here. Your role, pay and schedule
              are managed by your owner/manager.
            </p>
          </form>
        ) : (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Profile editing turns on with the latest WorkTeams update. Until then,
            ask an owner or manager to update your details.
          </p>
        )}
      </section>

      {isManager && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Invite a team member</h3>
          <form onSubmit={addMember} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Name" required style={input} />
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" required style={input} />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={input}>
              <option value="employee">Employee</option>
              <option value="supervisor">Supervisor</option>
              <option value="manager">Manager</option>
              {member.role === "owner" && <option value="owner">Owner</option>}
            </select>
            <button type="submit" style={button}>Add member</button>
          </form>
          <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 10 }}>
            They'll be linked automatically the first time they sign in with this email.
          </p>
        </section>
      )}

      {members.length > 1 && (
        <input
          value={rosterQuery}
          onChange={(e) => setRosterQuery(e.target.value)}
          placeholder="Search the team by name or email…"
          aria-label="Search team members"
          style={{ ...input, maxWidth: 420, margin: "14px 0 12px" }}
        />
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {visibleMembers.map((m) => (
          <div key={m.id} className="portal-card" style={{ minHeight: 0, padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                {editingId === m.id ? (
                  <div style={{ display: "grid", gap: 8, marginBottom: 4 }}>
                    <input
                      value={editForm.display_name}
                      onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                      placeholder="Name"
                      style={input}
                    />
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      placeholder="Email"
                      style={input}
                    />
                    {confirmEmailId === m.id && (
                      <p style={warnStyle}>
                        ⚠️ {m.display_name} already signed in with the old email — changing it may unlink
                        their account. Tap Save again to confirm.
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => saveEdit(m)} style={confirmEmailId === m.id ? confirmButton : smallButton}>
                        {confirmEmailId === m.id ? "Tap again to confirm" : "Save"}
                      </button>
                      <button onClick={cancelEdit} style={secondaryButton}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <strong>{m.display_name}</strong>
                    {isManager && <span style={{ color: "var(--muted)", fontSize: "0.88rem" }}> • {m.email}</span>}
                    {isManager && (
                      m.user_id ? (
                        <span style={activeBadge}>Active</span>
                      ) : (
                        <span style={pendingBadge}>Invite pending</span>
                      )
                    )}
                  </>
                )}
                <div style={{ fontSize: "0.85rem", color: "var(--brand-deep)", fontWeight: 700 }}>{roleLabel(m.role)}</div>
                {m.created_at && (
                  <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                    On the team since{" "}
                    {new Date(m.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </div>
                )}
                {isManager && (m.phone || m.emergency_contact_name || m.emergency_contact_phone) && (
                  <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 2 }}>
                    {m.phone && <span>📞 {m.phone}</span>}
                    {(m.emergency_contact_name || m.emergency_contact_phone) && (
                      <span>
                        {m.phone ? " · " : ""}Emergency: {m.emergency_contact_name || ""}
                        {m.emergency_contact_phone ? ` ${m.emergency_contact_phone}` : ""}
                      </span>
                    )}
                  </div>
                )}
                {isManager && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8, maxWidth: 420 }}>
                    {[
                      { label: "Cleaner title", field: "cleaner_title", ph: "Cleaner", type: "text" },
                      { label: "Cleaner $/hr", field: "cleaner_hourly_rate", ph: "—", type: "number" },
                      { label: "Manager title", field: "manager_title", ph: "Manager", type: "text" },
                      { label: "Manager $/hr", field: "manager_hourly_rate", ph: "—", type: "number" },
                    ].map((f) => (
                      <label key={f.field} style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                        {f.label}
                        <input
                          type={f.type}
                          min={f.type === "number" ? "0" : undefined}
                          step={f.type === "number" ? "any" : undefined}
                          defaultValue={m.pay?.[f.field] ?? ""}
                          placeholder={f.ph}
                          onBlur={(e) => {
                            if ((e.target.value || "") !== String(m.pay?.[f.field] ?? "")) changePayField(m, f.field, e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.target.blur();
                          }}
                          style={{ ...input, width: "100%", padding: "7px 10px", boxSizing: "border-box" }}
                        />
                      </label>
                    ))}
                    <p style={{ gridColumn: "1 / -1", fontSize: "0.78rem", color: "var(--muted)", margin: "2px 0 0" }}>
                      Set both rates and they'll pick Cleaner or Manager at clock-in.
                    </p>
                    <p style={{ gridColumn: "1 / -1", fontSize: "0.78rem", color: "var(--muted)", margin: 0 }}>
                      Rates and titles save on their own as soon as you tap out of a field — there is no Save button for pay.
                    </p>
                  </div>
                )}
                {isOwner && m.role !== "owner" && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 4 }}>
                      Departments {(!m.departments || m.departments.length === 0) && "(all)"}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {DEPTS.map((d) => {
                        const checked = !m.departments || m.departments.length === 0 || m.departments.includes(d.key);
                        return (
                          <label key={d.key} style={{ fontSize: "0.8rem", display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDept(m, d.key)}
                              style={{ width: 18, height: 18 }}
                            />
                            {d.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {isManager && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {editingId !== m.id && (
                    <button onClick={() => startEdit(m)} style={editButton}>Edit</button>
                  )}
                  {m.user_id !== member.user_id && (
                    <>
                      <select value={m.role === "admin" ? "manager" : m.role} onChange={(e) => changeRole(m, e.target.value)} style={{ ...input, width: "auto" }}>
                        <option value="employee">Employee</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="manager">Manager</option>
                        {member.role === "owner" && <option value="owner">Owner</option>}
                      </select>
                      <button onClick={() => removeMember(m)} style={confirmRemoveId === m.id ? dangerButton : { ...dangerButton, background: "#fff", color: "#b3261e", border: "1px solid #b3261e" }}>
                        {confirmRemoveId === m.id ? "Tap again to remove" : "Remove"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {query && visibleMembers.length === 0 && (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            No team members match “{rosterQuery.trim()}”.
          </p>
        )}
      </div>

      {isManager && availability !== null && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>🗓️ Team availability</h3>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>
            The days and times each person says they can normally work. A dash means
            they haven't set their availability yet.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {members.map((m) => {
              const notes = availabilityNotes(m.id);
              return (
                <div key={m.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px" }}>
                  <strong>{m.display_name}</strong>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {availabilityCells(m.id).map((c) => (
                      <span
                        key={c.dow}
                        title={c.title}
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          border: "1px solid var(--line)",
                          borderRadius: 999,
                          padding: "3px 9px",
                          color: c.text === "✗" ? "#b3261e" : "inherit",
                          background: c.text === "✗" ? "#fdecea" : "#fff",
                        }}
                      >
                        {c.short} {c.text}
                      </span>
                    ))}
                  </div>
                  {notes.length > 0 && (
                    <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 6 }}>
                      {notes.join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
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
  padding: "12px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
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

const editButton = {
  border: "1px solid var(--line)",
  background: "#fff",
  color: "inherit",
  borderRadius: 999,
  padding: "7px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButton = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "7px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const confirmButton = {
  padding: "9px 18px",
  borderRadius: 999,
  border: "none",
  background: "#b3261e",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const warnStyle = {
  fontSize: "0.85rem",
  color: "#92400e",
  background: "#fef3c7",
  borderRadius: 10,
  padding: "8px 12px",
  margin: 0,
};

const activeBadge = {
  display: "inline-block",
  marginLeft: 8,
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: "0.75rem",
  fontWeight: 700,
  background: "#e6f4ea",
  color: "#1a7f37",
  verticalAlign: "middle",
};

const pendingBadge = {
  display: "inline-block",
  marginLeft: 8,
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: "0.75rem",
  fontWeight: 700,
  background: "#fef3c7",
  color: "#92400e",
  verticalAlign: "middle",
};
