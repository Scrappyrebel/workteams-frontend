"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { UI_TO_DB_ROLE, roleLabel } from "../../../../lib/roles";

export default function TeamPage() {
  const { company, member, loading } = useCompany();
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ email: "", display_name: "", role: "employee" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ display_name: "", email: "" });
  // Two-tap confirm when changing the email of a member who already signed in.
  const [confirmEmailId, setConfirmEmailId] = useState(null);

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    // Managers see the full roster (email/user_id needed for invites and
    // role changes). Everyone else sees the directory: id, display name,
    // role — no emails, no user ids.
    const { data } = isManager
      ? await supabase()
          .from("company_members")
          .select("id, user_id, email, display_name, role, created_at")
          .eq("company_id", company.id)
          .order("display_name")
      : await supabase()
          .from("team_directory")
          .select("id, display_name, role")
          .eq("company_id", company.id)
          .order("display_name");
    let rows = data || [];
    if (isManager) {
      // Pay rates live in member_pay, readable only by owners/admins.
      const { data: pay } = await supabase()
        .from("member_pay")
        .select("member_id, cleaner_hourly_rate, manager_hourly_rate, cleaner_title, manager_title")
        .eq("company_id", company.id);
      const payByMember = {};
      for (const p of pay || []) payByMember[p.member_id] = p;
      rows = rows.map((m) => ({ ...m, pay: payByMember[m.id] || {} }));
    }
    setMembers(rows);
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
    if (!confirm(`Remove ${m.display_name} from the team?`)) return;
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

  if (loading || !company) return <p>Loading…</p>;

  return (
    <div>
      <p className="eyebrow">TEAM</p>
      <h2 style={{ fontSize: "1.8rem" }}>Team members</h2>

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

      <div style={{ display: "grid", gap: 8 }}>
        {members.map((m) => (
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
                      <button onClick={() => removeMember(m)} style={dangerButton}>Remove</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
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
