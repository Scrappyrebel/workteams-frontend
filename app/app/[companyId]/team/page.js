"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { UI_TO_DB_ROLE, roleLabel } from "../../../../lib/roles";

export default function TeamPage() {
  const { company, member, loading } = useCompany();
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ email: "", display_name: "", role: "employee" });

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
        .select("member_id, hourly_rate")
        .eq("company_id", company.id);
      const payByMember = {};
      for (const p of pay || []) payByMember[p.member_id] = p.hourly_rate;
      rows = rows.map((m) => ({ ...m, hourly_rate: payByMember[m.id] ?? null }));
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

  async function changeRate(m, rate) {
    const parsed = rate === "" ? null : parseFloat(rate);
    if (rate !== "" && (isNaN(parsed) || parsed < 0)) {
      alert("Enter a valid hourly rate.");
      return;
    }
    // Pay rates are stored in member_pay (owner/admin-only table).
    const { error } = await supabase()
      .from("member_pay")
      .upsert(
        { member_id: m.id, company_id: company.id, hourly_rate: parsed },
        { onConflict: "member_id" }
      );
    if (error) alert("Could not update rate: " + error.message);
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <strong>{m.display_name}</strong>
                {isManager && <span style={{ color: "var(--muted)", fontSize: "0.88rem" }}> • {m.email}</span>}
                <div style={{ fontSize: "0.85rem", color: "var(--brand-deep)", fontWeight: 700 }}>{roleLabel(m.role)}</div>
                {isManager && (
                  <label style={{ fontSize: "0.85rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    $/hr
                    <input
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={m.hourly_rate ?? ""}
                      placeholder="—"
                      onBlur={(e) => {
                        if ((e.target.value || "") !== String(m.hourly_rate ?? "")) changeRate(m, e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.target.blur();
                      }}
                      style={{ ...input, width: 110, padding: "7px 10px" }}
                    />
                    <span style={{ fontSize: "0.78rem" }}>for labor-cost estimates</span>
                  </label>
                )}
              </div>
              {isManager && m.user_id !== member.user_id && (
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={m.role === "admin" ? "manager" : m.role} onChange={(e) => changeRole(m, e.target.value)} style={{ ...input, width: "auto" }}>
                    <option value="employee">Employee</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="manager">Manager</option>
                    {member.role === "owner" && <option value="owner">Owner</option>}
                  </select>
                  <button onClick={() => removeMember(m)} style={dangerButton}>Remove</button>
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

const dangerButton = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "7px 14px",
  fontWeight: 700,
  cursor: "pointer",
};
