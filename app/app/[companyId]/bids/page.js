"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUse } from "../../../../lib/tiers";

const emptyForm = {
  client_name: "",
  title: "",
  description: "",
  location_id: "",
  valid_until: "",
};

const STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

export default function BidsPage() {
  const { company, member, loading } = useCompany();
  const [bids, setBids] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("all");

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.tier, "bidding");

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("bids")
      .select("id, client_name, title, status, valid_until, created_at, locations(name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    const rows = data || [];
    // Totals in one batch.
    const ids = rows.map((r) => r.id);
    let totals = {};
    if (ids.length > 0) {
      const { data: items } = await sb.from("bid_items").select("bid_id, quantity, unit_price").in("bid_id", ids);
      for (const it of items || []) {
        totals[it.bid_id] = (totals[it.bid_id] || 0) + Number(it.quantity) * Number(it.unit_price);
      }
    }
    setBids(rows.map((r) => ({ ...r, total: totals[r.id] || 0 })));
    const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    setLocations(locs || []);
  }

  useEffect(() => {
    if (!loading && company && allowed && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  async function save(e) {
    e.preventDefault();
    if (!form.client_name.trim() || !form.title.trim()) {
      alert("Client name and title are required.");
      return;
    }
    setSaving(true);
    const { error } = await supabase().from("bids").insert({
      company_id: company.id,
      client_name: form.client_name.trim(),
      title: form.title.trim(),
      description: form.description.trim() || null,
      location_id: form.location_id || null,
      valid_until: form.valid_until || null,
      status: "draft",
    });
    setSaving(false);
    if (error) alert("Could not save bid: " + error.message);
    else {
      setForm(emptyForm);
      load();
    }
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

  const shown = filter === "all" ? bids : bids.filter((b) => b.status === filter);

  return (
    <div>
      <p className="eyebrow">BIDS</p>
      <h2 style={{ fontSize: "1.8rem" }}>Bids & proposals</h2>

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>New bid</h3>
        <form onSubmit={save} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input
            value={form.client_name}
            onChange={(e) => setForm({ ...form, client_name: e.target.value })}
            placeholder="Client name"
            required
            style={input}
          />
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Bid title (e.g. Weekly office cleaning)"
            required
            style={input}
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description of the work…"
            rows={3}
            style={{ ...input, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={form.location_id}
              onChange={(e) => setForm({ ...form, location_id: e.target.value })}
              style={{ ...input, flex: 1 }}
            >
              <option value="">No linked location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Valid until
              <input
                type="date"
                value={form.valid_until}
                onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
          </div>
          <button type="submit" disabled={saving} style={button}>
            {saving ? "Saving…" : "Create draft bid"}
          </button>
        </form>
      </section>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {["all", "draft", "sent", "accepted", "declined"].map((s) => (
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
        {shown.length === 0 && <p style={{ color: "var(--muted)" }}>No bids yet.</p>}
        {shown.map((b) => (
          <Link
            key={b.id}
            href={`/app/${company.id}/bids/${b.id}`}
            className="portal-card"
            style={{ minHeight: 0, padding: "16px 20px", textDecoration: "none", color: "inherit" }}
          >
            <span className="card-kicker">
              {STATUS_LABELS[b.status]} • ${b.total.toFixed(2)}
            </span>
            <p style={{ margin: "6px 0 0", fontWeight: 700 }}>{b.title}</p>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
              {b.client_name}
              {b.locations?.name ? ` • ${b.locations.name}` : ""}
              {b.valid_until ? ` • valid until ${b.valid_until}` : ""}
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
