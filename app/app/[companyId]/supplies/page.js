"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { useClockedIn, requireClockedIn } from "../../../../lib/use-clocked-in";
import { canUse } from "../../../../lib/tiers";

const emptyForm = {
  name: "",
  category: "",
  quantity_on_hand: "0",
  unit: "units",
  reorder_level: "0",
  cost_per_unit: "",
  notes: "",
};

export default function SuppliesPage() {
  const { company, member, loading } = useCompany();
  const { clockedIn } = useClockedIn();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.effectiveTier || company?.tier, "supplies");

  async function load() {
    const { data } = await supabase()
      .from("supplies")
      .select("*")
      .eq("company_id", company.id)
      .order("name");
    setItems(data || []);
  }

  useEffect(() => {
    if (!loading && company && allowed && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  async function save(e) {
    e.preventDefault();
    if (!requireClockedIn(clockedIn, "add a supply item")) return;
    if (!form.name.trim()) {
      alert("Name the supply.");
      return;
    }
    setSaving(true);
    const payload = {
      company_id: company.id,
      name: form.name.trim(),
      category: form.category.trim() || null,
      quantity_on_hand: parseFloat(form.quantity_on_hand) || 0,
      unit: form.unit.trim() || "units",
      reorder_level: parseFloat(form.reorder_level) || 0,
      cost_per_unit: form.cost_per_unit === "" ? null : parseFloat(form.cost_per_unit),
      notes: form.notes.trim() || null,
    };
    let error;
    if (editing) {
      ({ error } = await supabase().from("supplies").update(payload).eq("id", editing));
    } else {
      ({ error } = await supabase().from("supplies").insert(payload));
    }
    setSaving(false);
    if (error) alert("Could not save: " + error.message);
    else {
      setForm(emptyForm);
      setEditing(null);
      load();
    }
  }

  async function adjust(id, delta) {
    if (!requireClockedIn(clockedIn, "adjust inventory")) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const next = Math.max(0, Number(item.quantity_on_hand) + delta);
    const { error } = await supabase().from("supplies").update({ quantity_on_hand: next }).eq("id", id);
    if (error) alert("Could not adjust: " + error.message);
    else load();
  }

  async function removeItem(id, name) {
    if (!requireClockedIn(clockedIn, "remove a supply item")) return;
    if (!confirm(`Delete "${name}" from inventory?`)) return;
    const { error } = await supabase().from("supplies").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  function startEdit(item) {
    setEditing(item.id);
    setForm({
      name: item.name,
      category: item.category || "",
      quantity_on_hand: String(item.quantity_on_hand),
      unit: item.unit || "units",
      reorder_level: String(item.reorder_level),
      cost_per_unit: item.cost_per_unit == null ? "" : String(item.cost_per_unit),
      notes: item.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed || !isManager) {
    return (
      <div>
        <p className="eyebrow">SUPPLIES</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Supplies</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Supply tracking is a <strong>Pro</strong> feature.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }

  const lowStock = items.filter((i) => Number(i.quantity_on_hand) <= Number(i.reorder_level));

  return (
    <div>
      <p className="eyebrow">SUPPLIES</p>
      <h2 style={{ fontSize: "1.8rem" }}>Supply inventory</h2>
      {lowStock.length > 0 && (
        <p style={{ color: "#b3261e", fontWeight: 700 }}>
          ⚠️ {lowStock.length} item{lowStock.length === 1 ? "" : "s"} at or below reorder level
        </p>
      )}

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>{editing ? "Edit supply" : "Add supply"}</h3>
        <form onSubmit={save} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name (e.g. All-purpose cleaner)"
            required
            style={input}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Category (optional)"
              style={{ ...input, flex: 1 }}
            />
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="Unit (bottles, rolls…)"
              style={{ ...input, flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              On hand
              <input
                type="number"
                min="0"
                step="any"
                value={form.quantity_on_hand}
                onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Reorder at
              <input
                type="number"
                min="0"
                step="any"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Cost each ($)
              <input
                type="number"
                min="0"
                step="any"
                value={form.cost_per_unit}
                onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })}
                placeholder="Optional"
                style={{ ...input, marginTop: 6 }}
              />
            </label>
          </div>
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes (optional)"
            style={input}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={saving} style={{ ...button, flex: 1 }}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add supply"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => { setEditing(null); setForm(emptyForm); }}
                style={ghostButton}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <div style={{ display: "grid", gap: 10 }}>
        {items.length === 0 && <p style={{ color: "var(--muted)" }}>No supplies tracked yet.</p>}
        {items.map((i) => {
          const low = Number(i.quantity_on_hand) <= Number(i.reorder_level);
          return (
            <div
              key={i.id}
              className="portal-card"
              style={{
                minHeight: 0,
                padding: "14px 18px",
                borderLeft: low ? "4px solid #b3261e" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <strong>{i.name}</strong>
                  {low && <span style={{ color: "#b3261e", fontWeight: 800 }}> ⚠️ low</span>}
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                    {i.category ? `${i.category} • ` : ""}
                    {Number(i.quantity_on_hand)} {i.unit} on hand
                    {i.cost_per_unit != null ? ` • $${Number(i.cost_per_unit).toFixed(2)} each` : ""}
                  </div>
                  {i.notes && <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{i.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button onClick={() => adjust(i.id, -1)} style={stepButton} aria-label="Use one">−</button>
                  <button onClick={() => adjust(i.id, 1)} style={stepButton} aria-label="Add one">+</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => startEdit(i)} style={ghostButton}>Edit</button>
                <button onClick={() => removeItem(i.id, i.name)} style={dangerButton}>Delete</button>
              </div>
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

const button = {
  padding: "12px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const ghostButton = {
  border: "1px solid var(--line)",
  background: "#fff",
  borderRadius: 999,
  padding: "9px 18px",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButton = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "9px 18px",
  fontWeight: 700,
  cursor: "pointer",
};

const stepButton = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: "1px solid var(--line)",
  background: "#fff",
  fontSize: "1.3rem",
  fontWeight: 800,
  cursor: "pointer",
};
