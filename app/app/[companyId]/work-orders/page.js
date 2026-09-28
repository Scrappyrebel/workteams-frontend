"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUse } from "../../../../lib/tiers";

const emptyForm = {
  title: "",
  description: "",
  location_id: "",
  priority: "normal",
  assigned_to: "",
  due_date: "",
};

const STATUS_LABELS = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PRIORITY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export default function WorkOrdersPage() {
  const { company, member, loading } = useCompany();
  const [orders, setOrders] = useState([]);
  const [locations, setLocations] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("open");

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.tier, "workorders");

  async function load() {
    const sb = supabase();
    let q = sb
      .from("work_orders")
      .select("id, title, description, priority, status, due_date, assigned_to, created_at, locations(name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    // Employees only see their own assigned work orders.
    if (!isManager) q = q.eq("assigned_to", member.id);
    const { data } = await q;
    const rows = data || [];
    const ids = [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))];
    let names = {};
    if (ids.length > 0) {
      const { data: ms } = await sb.from("company_members").select("id, display_name").in("id", ids);
      for (const m of ms || []) names[m.id] = m.display_name;
    }
    setOrders(rows.map((r) => ({ ...r, assignee_name: names[r.assigned_to] || "Unassigned" })));
    if (isManager) {
      const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
      setLocations(locs || []);
      const { data: ms } = await sb.from("company_members").select("id, display_name").eq("company_id", company.id).order("display_name");
      setMembers(ms || []);
    }
  }

  useEffect(() => {
    if (!loading && company && allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  async function save(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      alert("Give the work order a title.");
      return;
    }
    setSaving(true);
    const { error } = await supabase().from("work_orders").insert({
      company_id: company.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      location_id: form.location_id || null,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || null,
      status: "open",
    });
    setSaving(false);
    if (error) alert("Could not save work order: " + error.message);
    else {
      setForm(emptyForm);
      load();
    }
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed) {
    return (
      <div>
        <p className="eyebrow">WORK ORDERS</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Work orders</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Work orders are a <strong>Pro</strong> feature.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }

  const shown = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  return (
    <div>
      <p className="eyebrow">WORK ORDERS</p>
      <h2 style={{ fontSize: "1.8rem" }}>Work orders</h2>
      {!isManager && (
        <p style={{ color: "var(--muted)" }}>Showing work orders assigned to you.</p>
      )}

      {isManager && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>New work order</h3>
          <form onSubmit={save} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Title (e.g. Deep clean lobby)"
              required
              style={input}
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What needs to be done…"
              rows={3}
              style={{ ...input, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={form.location_id}
                onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                style={{ ...input, flex: 1 }}
              >
                <option value="">No location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                style={{ ...input, flex: 1 }}
              >
                {Object.keys(PRIORITY_LABELS).map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={form.assigned_to}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                style={{ ...input, flex: 1 }}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
              <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                Due date
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  style={{ ...input, marginTop: 6 }}
                />
              </label>
            </div>
            <button type="submit" disabled={saving} style={button}>
              {saving ? "Saving…" : "Create work order"}
            </button>
          </form>
        </section>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {["open", "in_progress", "completed", "cancelled", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              ...chip,
              background: filter === s ? "var(--brand)" : "#fff",
              color: filter === s ? "#fff" : "var(--ink)",
            }}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {shown.length === 0 && <p style={{ color: "var(--muted)" }}>No work orders here.</p>}
        {shown.map((o) => (
          <Link
            key={o.id}
            href={`/app/${company.id}/work-orders/${o.id}`}
            className="portal-card"
            style={{ minHeight: 0, padding: "16px 20px", textDecoration: "none", color: "inherit" }}
          >
            <span className="card-kicker">
              {STATUS_LABELS[o.status]} • {PRIORITY_LABELS[o.priority]}
              {o.priority === "urgent" ? " 🔥" : ""}
            </span>
            <p style={{ margin: "6px 0 0", fontWeight: 700 }}>{o.title}</p>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
              {o.locations?.name ? `${o.locations.name} • ` : ""}
              {o.assignee_name}
              {o.due_date ? ` • due ${o.due_date}` : ""}
            </p>
            <span className="card-link">Open →</span>
          </Link>
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

const chip = {
  border: "1px solid var(--line)",
  borderRadius: 999,
  padding: "7px 16px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};
