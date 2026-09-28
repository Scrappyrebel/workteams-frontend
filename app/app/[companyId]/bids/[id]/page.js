"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { canUse } from "../../../../../lib/tiers";

const STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

const NEXT_STATUS = {
  draft: ["sent"],
  sent: ["accepted", "declined", "draft"],
  accepted: [],
  declined: ["draft"],
};

export default function BidDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bidId = params.id;
  const { company, member, loading } = useCompany();
  const [bid, setBid] = useState(null);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ description: "", quantity: "1", unit_price: "" });
  const [saving, setSaving] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.tier, "bidding");

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("bids")
      .select("*, locations(name)")
      .eq("id", bidId)
      .eq("company_id", company.id)
      .single();
    if (!data) {
      router.replace(`/app/${company.id}/bids`);
      return;
    }
    setBid(data);
    const { data: its } = await sb.from("bid_items").select("*").eq("bid_id", bidId).order("created_at");
    setItems(its || []);
  }

  useEffect(() => {
    if (!loading && company && allowed && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  const total = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price), 0);

  async function addItem(e) {
    e.preventDefault();
    if (!form.description.trim() || !form.unit_price) {
      alert("Describe the line item and set a price.");
      return;
    }
    setSaving(true);
    const { error } = await supabase().from("bid_items").insert({
      bid_id: bidId,
      description: form.description.trim(),
      quantity: parseFloat(form.quantity) || 1,
      unit_price: parseFloat(form.unit_price) || 0,
    });
    setSaving(false);
    if (error) alert("Could not add item: " + error.message);
    else {
      setForm({ description: "", quantity: "1", unit_price: "" });
      load();
    }
  }

  async function removeItem(id) {
    if (!confirm("Remove this line item?")) return;
    const { error } = await supabase().from("bid_items").delete().eq("id", id);
    if (error) alert("Could not remove: " + error.message);
    else load();
  }

  async function setStatus(status) {
    const { error } = await supabase().from("bids").update({ status }).eq("id", bidId);
    if (error) alert("Could not update status: " + error.message);
    else load();
  }

  async function deleteBid() {
    if (!confirm("Delete this bid and all its line items?")) return;
    const { error } = await supabase().from("bids").delete().eq("id", bidId);
    if (error) alert("Could not delete: " + error.message);
    else router.replace(`/app/${company.id}/bids`);
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed || !isManager) {
    return (
      <div>
        <p className="eyebrow">BIDS</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Bids & proposals</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Bids & proposals are a <strong>Pro</strong> feature.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }
  if (!bid) return <p>Loading…</p>;

  return (
    <div>
      <Link href={`/app/${company.id}/bids`} style={{ color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.9rem" }}>
        ← All bids
      </Link>
      <p className="eyebrow" style={{ marginTop: 12 }}>BID • {STATUS_LABELS[bid.status].toUpperCase()}</p>
      <h2 style={{ fontSize: "1.8rem", margin: "4px 0" }}>{bid.title}</h2>
      <p style={{ color: "var(--muted)" }}>
        {bid.client_name}
        {bid.locations?.name ? ` • ${bid.locations.name}` : ""}
        {bid.valid_until ? ` • valid until ${bid.valid_until}` : ""}
      </p>
      {bid.description && <p style={{ marginTop: 8 }}>{bid.description}</p>}

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>Line items</h3>
        {items.length === 0 && <p style={{ color: "var(--muted)" }}>No line items yet — add the first below.</p>}
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {items.map((it) => (
            <div key={it.id} className="portal-card" style={{ minHeight: 0, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <strong>{it.description}</strong>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  {it.quantity} × ${Number(it.unit_price).toFixed(2)}
                </div>
              </div>
              <strong>${(Number(it.quantity) * Number(it.unit_price)).toFixed(2)}</strong>
              <button onClick={() => removeItem(it.id)} style={dangerButton}>✕</button>
            </div>
          ))}
        </div>
        <p style={{ fontWeight: 800, fontSize: "1.2rem" }}>Total: ${total.toFixed(2)}</p>
        <form onSubmit={addItem} style={{ display: "grid", gap: 10, maxWidth: 520, marginTop: 12 }}>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Line item (e.g. Weekly cleaning — 4 visits)"
            style={input}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Qty
              <input
                type="number"
                min="0"
                step="any"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Unit price ($)
              <input
                type="number"
                min="0"
                step="any"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
          </div>
          <button type="submit" disabled={saving} style={button}>
            {saving ? "Adding…" : "Add line item"}
          </button>
        </form>
      </section>

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>Status</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(NEXT_STATUS[bid.status] || []).map((s) => (
            <button key={s} onClick={() => setStatus(s)} style={button}>
              Mark {STATUS_LABELS[s].toLowerCase()}
            </button>
          ))}
          {NEXT_STATUS[bid.status]?.length === 0 && (
            <p style={{ color: "var(--muted)" }}>This bid is {STATUS_LABELS[bid.status].toLowerCase()} — no further actions.</p>
          )}
        </div>
        <button onClick={deleteBid} style={{ ...dangerButton, marginTop: 16 }}>
          Delete bid
        </button>
      </section>
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
  padding: "12px 22px",
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
