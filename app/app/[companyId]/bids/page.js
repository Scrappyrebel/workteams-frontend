"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUse } from "../../../../lib/tiers";
import RateLookup from "../../../../components/RateLookup";

const emptyForm = {
  client_name: "",
  title: "",
  description: "",
  location_id: "",
  valid_until: "",
  pricing_mode: "line_items",
  hours: "",
  hourly_rate: "",
  square_footage: "",
  rate_per_sqft: "",
};

const PRICING_MODES = ["line_items", "hourly", "sqft"];
const MODE_LABELS = { line_items: "Line items", hourly: "Hourly", sqft: "Sq footage" };

function modeTotal(b) {
  const mode = b.pricing_mode || "line_items";
  if (mode === "hourly") return Number(b.hours || 0) * Number(b.hourly_rate || 0);
  if (mode === "sqft") return Number(b.square_footage || 0) * Number(b.rate_per_sqft || 0);
  return 0;
}

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
  const [rateAreas, setRateAreas] = useState([]);
  const [raForm, setRaForm] = useState({ name: "", rate_per_sqft: "", rate_per_hour: "", notes: "" });
  const [editingRa, setEditingRa] = useState(null);
  const [raSaving, setRaSaving] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.tier, "bidding");

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("bids")
      .select("id, client_name, title, status, valid_until, created_at, pricing_mode, hours, hourly_rate, square_footage, rate_per_sqft, locations(name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    const rows = data || [];
    // Totals in one batch (line-item mode only; hourly/sqft compute directly).
    const lineIds = rows.filter((r) => (r.pricing_mode || "line_items") === "line_items").map((r) => r.id);
    let totals = {};
    if (lineIds.length > 0) {
      const { data: items } = await sb.from("bid_items").select("bid_id, quantity, unit_price").in("bid_id", lineIds);
      for (const it of items || []) {
        totals[it.bid_id] = (totals[it.bid_id] || 0) + Number(it.quantity) * Number(it.unit_price);
      }
    }
    setBids(rows.map((r) => ({ ...r, total: (r.pricing_mode || "line_items") === "line_items" ? (totals[r.id] || 0) : modeTotal(r) })));
    const { data: locs } = await sb.from("locations").select("id, name, address, rate_area_id").eq("company_id", company.id).order("name");
    setLocations(locs || []);
    const { data: ra } = await sb.from("rate_areas").select("*").eq("company_id", company.id).order("name");
    setRateAreas(ra || []);
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
    const pm = form.pricing_mode;
    const { error } = await supabase().from("bids").insert({
      company_id: company.id,
      client_name: form.client_name.trim(),
      title: form.title.trim(),
      description: form.description.trim() || null,
      location_id: form.location_id || null,
      valid_until: form.valid_until || null,
      status: "draft",
      pricing_mode: pm,
      hours: pm === "hourly" ? parseFloat(form.hours) || null : null,
      hourly_rate: pm === "hourly" ? parseFloat(form.hourly_rate) || null : null,
      square_footage: pm === "sqft" ? parseFloat(form.square_footage) || null : null,
      rate_per_sqft: pm === "sqft" ? parseFloat(form.rate_per_sqft) || null : null,
    });
    setSaving(false);
    if (error) alert("Could not save bid: " + error.message);
    else {
      setForm(emptyForm);
      load();
    }
  }

  // Rate area for the currently selected location (if any).
  const selectedRateArea = (() => {
    const loc = locations.find((l) => l.id === form.location_id);
    if (!loc?.rate_area_id) return null;
    return rateAreas.find((r) => r.id === loc.rate_area_id) || null;
  })();

  // Area suggestion for the live rate lookup: rate area name, else location address.
  const selectedLocation = locations.find((l) => l.id === form.location_id);
  const lookupArea =
    selectedRateArea?.name || selectedLocation?.address || "";

  // Fill empty rate inputs from the area's going rate (never overwrites typing).
  function prefillFromRateArea(next, ra) {
    if (!ra) return next;
    if (next.pricing_mode === "hourly" && !next.hourly_rate && ra.rate_per_hour != null) {
      next = { ...next, hourly_rate: String(ra.rate_per_hour) };
    }
    if (next.pricing_mode === "sqft" && !next.rate_per_sqft && ra.rate_per_sqft != null) {
      next = { ...next, rate_per_sqft: String(ra.rate_per_sqft) };
    }
    return next;
  }

  function onLocationChange(locId) {
    const loc = locations.find((l) => l.id === locId);
    const ra = loc?.rate_area_id ? rateAreas.find((r) => r.id === loc.rate_area_id) : null;
    setForm(prefillFromRateArea({ ...form, location_id: locId }, ra));
  }

  function onModeChange(mode) {
    setForm(prefillFromRateArea({ ...form, pricing_mode: mode }, selectedRateArea));
  }

  async function saveRateArea(e) {
    e.preventDefault();
    if (!raForm.name.trim()) {
      alert("Give the rate area a name (e.g. Chesterfield).");
      return;
    }
    setRaSaving(true);
    const sb = supabase();
    const payload = {
      company_id: company.id,
      name: raForm.name.trim(),
      rate_per_sqft: raForm.rate_per_sqft === "" ? null : parseFloat(raForm.rate_per_sqft),
      rate_per_hour: raForm.rate_per_hour === "" ? null : parseFloat(raForm.rate_per_hour),
      notes: raForm.notes.trim() || null,
    };
    let error;
    if (editingRa) {
      ({ error } = await sb.from("rate_areas").update(payload).eq("id", editingRa));
    } else {
      ({ error } = await sb.from("rate_areas").insert(payload));
    }
    setRaSaving(false);
    if (error) alert("Could not save rate area: " + error.message);
    else {
      setRaForm({ name: "", rate_per_sqft: "", rate_per_hour: "", notes: "" });
      setEditingRa(null);
      load();
    }
  }

  function startEditRa(r) {
    setEditingRa(r.id);
    setRaForm({
      name: r.name || "",
      rate_per_sqft: r.rate_per_sqft != null ? String(r.rate_per_sqft) : "",
      rate_per_hour: r.rate_per_hour != null ? String(r.rate_per_hour) : "",
      notes: r.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeRateArea(id) {
    if (!confirm("Delete this rate area? Locations using it will keep working, just without a reference rate.")) return;
    const { error } = await supabase().from("rate_areas").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
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
              onChange={(e) => onLocationChange(e.target.value)}
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
          {selectedRateArea && (
            <p style={{ margin: 0, fontSize: "0.9rem", background: "#f4f6fb", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px" }}>
              💲 Going rate in <strong>{selectedRateArea.name}</strong>:{" "}
              {selectedRateArea.rate_per_sqft != null ? `$${Number(selectedRateArea.rate_per_sqft).toFixed(2)}/sq ft` : "—"}
              {" · "}
              {selectedRateArea.rate_per_hour != null ? `$${Number(selectedRateArea.rate_per_hour).toFixed(2)}/hr` : "—"}
              <span style={{ color: "var(--muted)" }}> — reference only</span>
            </p>
          )}
          <RateLookup companyId={company.id} defaultArea={lookupArea} />
          <div>
            <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: 6 }}>Pricing</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PRICING_MODES.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => onModeChange(m)}
                  style={{
                    ...chip,
                    background: form.pricing_mode === m ? "var(--brand)" : "#fff",
                    color: form.pricing_mode === m ? "#fff" : "var(--ink)",
                  }}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
          {form.pricing_mode === "hourly" && (
            <div>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                  Estimated hours
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.hours}
                    onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    placeholder="e.g. 20"
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>
                <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                  Rate per hour ($)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.hourly_rate}
                    onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                    placeholder="e.g. 45"
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>
              </div>
              <p style={{ fontWeight: 800, margin: "8px 0 0" }}>
                Estimated total: ${((parseFloat(form.hours) || 0) * (parseFloat(form.hourly_rate) || 0)).toFixed(2)}
              </p>
            </div>
          )}
          {form.pricing_mode === "sqft" && (
            <div>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                  Square footage
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.square_footage}
                    onChange={(e) => setForm({ ...form, square_footage: e.target.value })}
                    placeholder="e.g. 5000"
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>
                <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                  Rate per sq ft ($)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.rate_per_sqft}
                    onChange={(e) => setForm({ ...form, rate_per_sqft: e.target.value })}
                    placeholder="e.g. 0.10"
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>
              </div>
              <p style={{ fontWeight: 800, margin: "8px 0 0" }}>
                Estimated total: ${((parseFloat(form.square_footage) || 0) * (parseFloat(form.rate_per_sqft) || 0)).toFixed(2)}
              </p>
            </div>
          )}
          <button type="submit" disabled={saving} style={button}>
            {saving ? "Saving…" : "Create draft bid"}
          </button>
        </form>
      </section>

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>💲 Rate areas</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
          Going rates by area, for reference when bidding. Assign areas to locations on the Locations page.
        </p>
        {rateAreas.length === 0 && <p style={{ color: "var(--muted)" }}>No rate areas yet.</p>}
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {rateAreas.map((r) => (
            <div key={r.id} className="portal-card" style={{ minHeight: 0, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <strong>{r.name}</strong>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  {r.rate_per_sqft != null ? `$${Number(r.rate_per_sqft).toFixed(2)}/sq ft` : "—"}
                  {" · "}
                  {r.rate_per_hour != null ? `$${Number(r.rate_per_hour).toFixed(2)}/hr` : "—"}
                  {r.notes ? ` • ${r.notes}` : ""}
                </div>
              </div>
              <button onClick={() => startEditRa(r)} style={ghostButton}>Edit</button>
              <button onClick={() => removeRateArea(r.id)} style={dangerButton}>✕</button>
            </div>
          ))}
        </div>
        <form onSubmit={saveRateArea} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <h4 style={{ margin: "4px 0 0" }}>{editingRa ? "Edit rate area" : "New rate area"}</h4>
          <input
            value={raForm.name}
            onChange={(e) => setRaForm({ ...raForm, name: e.target.value })}
            placeholder="Area name (e.g. Chesterfield)"
            style={input}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              $ per sq ft
              <input
                type="number"
                min="0"
                step="any"
                value={raForm.rate_per_sqft}
                onChange={(e) => setRaForm({ ...raForm, rate_per_sqft: e.target.value })}
                placeholder="e.g. 0.12"
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              $ per hour
              <input
                type="number"
                min="0"
                step="any"
                value={raForm.rate_per_hour}
                onChange={(e) => setRaForm({ ...raForm, rate_per_hour: e.target.value })}
                placeholder="e.g. 45"
                style={{ ...input, marginTop: 6 }}
              />
            </label>
          </div>
          <input
            value={raForm.notes}
            onChange={(e) => setRaForm({ ...raForm, notes: e.target.value })}
            placeholder="Notes (optional)"
            style={input}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={raSaving} style={{ ...button, flex: 1 }}>
              {raSaving ? "Saving…" : editingRa ? "Save changes" : "Add rate area"}
            </button>
            {editingRa && (
              <button
                type="button"
                onClick={() => { setEditingRa(null); setRaForm({ name: "", rate_per_sqft: "", rate_per_hour: "", notes: "" }); }}
                style={ghostButton}
              >
                Cancel
              </button>
            )}
          </div>
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

const ghostButton = {
  border: "1px solid var(--line)",
  background: "#fff",
  borderRadius: 999,
  padding: "7px 16px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const dangerButton = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "7px 16px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};
