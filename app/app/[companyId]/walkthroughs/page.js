"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUse } from "../../../../lib/tiers";

const emptyForm = { name: "", location_id: "", bid_id: "", notes: "" };

export default function WalkthroughsPage() {
  const { company, member, loading } = useCompany();
  const [walkthroughs, setWalkthroughs] = useState([]);
  const [locations, setLocations] = useState([]);
  const [draftBids, setDraftBids] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.effectiveTier || company?.tier, "walkthroughs");

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("walkthroughs")
      .select("id, name, notes, created_at, location_id, bid_id, locations(name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    const rows = data || [];
    // Area counts + total sqft per walkthrough in one batch.
    let stats = {};
    if (rows.length > 0) {
      const { data: areas } = await sb
        .from("walkthrough_areas")
        .select("walkthrough_id, square_footage")
        .in("walkthrough_id", rows.map((r) => r.id));
      for (const a of areas || []) {
        const s = stats[a.walkthrough_id] || { count: 0, sqft: 0 };
        s.count += 1;
        s.sqft += Number(a.square_footage || 0);
        stats[a.walkthrough_id] = s;
      }
    }
    setWalkthroughs(rows.map((r) => ({ ...r, ...stats[r.id], count: stats[r.id]?.count || 0, sqft: stats[r.id]?.sqft || 0 })));
    const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    setLocations(locs || []);
    const { data: bids } = await sb
      .from("bids")
      .select("id, title, client_name")
      .eq("company_id", company.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false });
    setDraftBids(bids || []);
  }

  useEffect(() => {
    if (!loading && company && allowed && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("Give the walkthrough a name.");
      return;
    }
    setSaving(true);
    const { error } = await supabase().from("walkthroughs").insert({
      company_id: company.id,
      name: form.name.trim(),
      location_id: form.location_id || null,
      bid_id: form.bid_id || null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) alert("Could not save walkthrough: " + error.message);
    else {
      setForm(emptyForm);
      load();
    }
  }

  async function remove(id) {
    if (!confirm("Delete this walkthrough and all its areas?")) return;
    const { error } = await supabase().from("walkthroughs").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed || !isManager) {
    return (
      <div>
        <p className="eyebrow">WALKTHROUGHS</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Walkthroughs</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Room-by-room walkthroughs are a <strong>Pro</strong> feature for owners and managers.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">WALKTHROUGHS</p>
      <h2 style={{ fontSize: "1.8rem", margin: "4px 0 16px" }}>Walkthroughs</h2>

      <section className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>New walkthrough</h3>
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Walkthrough name (e.g. St. Joseph walkthrough)"
            maxLength={120}
            style={input}
          />
          <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} style={input}>
            <option value="">No linked location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <select value={form.bid_id} onChange={(e) => setForm({ ...form, bid_id: e.target.value })} style={input}>
            <option value="">No linked bid (optional)</option>
            {draftBids.map((b) => (
              <option key={b.id} value={b.id}>{b.title} — {b.client_name}</option>
            ))}
          </select>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes (optional)"
            rows={2}
            style={{ ...input, borderRadius: 14 }}
          />
          <button type="submit" disabled={saving} style={primaryBtn}>
            {saving ? "Saving…" : "Start walkthrough"}
          </button>
        </form>
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {walkthroughs.length === 0 && (
          <p style={{ color: "var(--muted)" }}>No walkthroughs yet — start one above, then add rooms as you walk the building.</p>
        )}
        {walkthroughs.map((w) => (
          <div key={w.id} className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
              <Link href={`/app/${company.id}/walkthroughs/${w.id}`} style={{ flex: 1, padding: 16, textDecoration: "none", color: "inherit", display: "block" }}>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--brand-deep)" }}>
                  {w.name}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                  {w.locations?.name || "No location"} · {w.count} area{w.count === 1 ? "" : "s"} · {Math.round(w.sqft).toLocaleString()} sq ft
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  {new Date(w.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </Link>
              <button onClick={() => remove(w.id)} style={{ ...dangerGhost, alignSelf: "center", marginRight: 12 }} aria-label="Delete walkthrough">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const input = {
  padding: "12px 16px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  width: "100%",
};

const primaryBtn = {
  padding: "12px 24px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  fontSize: "1rem",
  cursor: "pointer",
};

const dangerGhost = {
  border: "1px solid #f3c1c1",
  background: "#fff",
  color: "#c0392b",
  borderRadius: 999,
  width: 36,
  height: 36,
  cursor: "pointer",
  flexShrink: 0,
};
