"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { useClockedIn } from "../../../../lib/use-clocked-in";
import { canUse } from "../../../../lib/tiers";
import { chicagoToday, chicagoDaysAgo } from "../../../../lib/dates";

const RANGES = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

const emptyEntry = { location_id: "", amount: "", description: "", entry_date: chicagoToday() };

export default function ProfitabilityPage() {
  const { company, member, loading } = useCompany();
  const { clockedIn, checking } = useClockedIn();
  const [locations, setLocations] = useState([]);
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState("90");
  const [computing, setComputing] = useState(false);
  const [revForm, setRevForm] = useState(emptyEntry);
  const [expForm, setExpForm] = useState(emptyEntry);
  const [saving, setSaving] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.effectiveTier || company?.tier, "profitability");

  async function compute() {
    setComputing(true);
    const sb = supabase();
    const sel = RANGES.find((r) => r.key === range);
    const since = sel.days ? chicagoDaysAgo(sel.days) : null;

    const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    const locList = locs || [];
    setLocations(locList);

    // Accepted bid totals per location (pricing-mode aware).
    let bidQ = sb.from("bids")
      .select("id, location_id, pricing_mode, hours, hourly_rate, square_footage, rate_per_sqft")
      .eq("company_id", company.id)
      .eq("status", "accepted");
    const { data: bids } = await bidQ;
    const bidLoc = {};
    const lineIds = [];
    let bidTotals = {};
    for (const b of bids || []) {
      bidLoc[b.id] = b.location_id;
      const mode = b.pricing_mode || "line_items";
      if (mode === "line_items") {
        lineIds.push(b.id);
        continue;
      }
      const lid = b.location_id;
      if (!lid) continue;
      const amt =
        mode === "hourly"
          ? Number(b.hours || 0) * Number(b.hourly_rate || 0)
          : Number(b.square_footage || 0) * Number(b.rate_per_sqft || 0);
      bidTotals[lid] = (bidTotals[lid] || 0) + amt;
    }
    if (lineIds.length > 0) {
      const { data: items } = await sb.from("bid_items").select("bid_id, quantity, unit_price").in("bid_id", lineIds);
      for (const it of items || []) {
        const lid = bidLoc[it.bid_id];
        if (!lid) continue;
        bidTotals[lid] = (bidTotals[lid] || 0) + Number(it.quantity) * Number(it.unit_price);
      }
    }

    // Manual revenue entries.
    let revQ = sb.from("revenue_entries").select("location_id, amount, entry_date").eq("company_id", company.id);
    if (since) revQ = revQ.gte("entry_date", since);
    const { data: revs } = await revQ;
    let revTotals = {};
    for (const r of revs || []) {
      if (!r.location_id) continue;
      revTotals[r.location_id] = (revTotals[r.location_id] || 0) + Number(r.amount);
    }

    // Manual expense entries.
    let expQ = sb.from("expense_entries").select("location_id, amount, entry_date").eq("company_id", company.id);
    if (since) expQ = expQ.gte("entry_date", since);
    const { data: exps } = await expQ;
    let expTotals = {};
    for (const e of exps || []) {
      if (!e.location_id) continue;
      expTotals[e.location_id] = (expTotals[e.location_id] || 0) + Number(e.amount);
    }

    // Labor cost: time entries with clock_out × member hourly rate.
    let timeQ = sb
      .from("time_entries")
      .select("location_id, clock_in, clock_out, member_id")
      .eq("company_id", company.id)
      .not("clock_out", "is", null);
    if (since) timeQ = timeQ.gte("clock_in", since + "T00:00:00");
    const { data: entries } = await timeQ;
    // Pay rates live in member_pay (owner/admin-only table).
    const { data: pay } = await sb.from("member_pay").select("member_id, hourly_rate").eq("company_id", company.id);
    const rates = {};
    for (const p of pay || []) rates[p.member_id] = Number(p.hourly_rate) || 0;
    let laborTotals = {};
    for (const e of entries || []) {
      if (!e.location_id) continue;
      const hours = (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000;
      if (hours <= 0) continue;
      laborTotals[e.location_id] = (laborTotals[e.location_id] || 0) + hours * (rates[e.member_id] || 0);
    }

    const out = locList.map((l) => {
      const revenue = (bidTotals[l.id] || 0) + (revTotals[l.id] || 0);
      const labor = laborTotals[l.id] || 0;
      const expenses = expTotals[l.id] || 0;
      const cost = labor + expenses;
      const profit = revenue - cost;
      return { id: l.id, name: l.name, revenue, labor, expenses, cost, profit };
    });
    setRows(out);
    setComputing(false);
  }

  useEffect(() => {
    if (!loading && !checking && company && allowed && isManager && (member.role === "owner" || clockedIn)) compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed, range]);

  async function saveEntry(kind, form, reset) {
    if (!form.location_id || !form.amount) {
      alert("Pick a location and enter an amount.");
      return;
    }
    setSaving(true);
    const table = kind === "rev" ? "revenue_entries" : "expense_entries";
    const { error } = await supabase().from(table).insert({
      company_id: company.id,
      location_id: form.location_id,
      amount: parseFloat(form.amount) || 0,
      description: form.description.trim() || null,
      entry_date: form.entry_date,
    });
    setSaving(false);
    if (error) alert("Could not save: " + error.message);
    else {
      reset(emptyEntry);
      compute();
    }
  }

  if (loading || checking || !company) return <p>Loading…</p>;
  const needsClockIn = isManager && member.role !== 'owner' && !clockedIn;
  if (needsClockIn) {
    return (
      <div>
        <p className="eyebrow">PROFITABILITY</p>
        <h2 style={{ fontSize: '1.8rem' }}>🔒 Profitability</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Clock in on the Time Clock tab to view profitability.</p>
        </section>
      </div>
    );
  }
  if (!allowed || !isManager) {
    return (
      <div>
        <p className="eyebrow">PROFITABILITY</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Profitability</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Job profitability is a <strong>Pro</strong> feature for owners and admins.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }

  const totals = rows.reduce(
    (s, r) => ({ revenue: s.revenue + r.revenue, cost: s.cost + r.cost, profit: s.profit + r.profit }),
    { revenue: 0, cost: 0, profit: 0 }
  );

  return (
    <div>
      <p className="eyebrow">PROFITABILITY</p>
      <h2 style={{ fontSize: "1.8rem" }}>Job profitability</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Revenue from accepted bids + manual entries. Cost = clocked hours × each member's
        hourly rate + manual expenses. Informational only — WorkTeams never runs payroll.
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "14px 0" }}>
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            style={{
              ...chip,
              background: range === r.key ? "var(--brand)" : "#fff",
              color: range === r.key ? "#fff" : "var(--ink)",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {computing ? (
        <p>Crunching numbers…</p>
      ) : (
        <>
          <section className="panel" style={{ padding: 22, marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Stat label="Revenue" value={totals.revenue} />
              <Stat label="Cost" value={totals.cost} />
              <Stat label="Profit" value={totals.profit} highlight />
            </div>
          </section>

          <div style={{ display: "grid", gap: 10 }}>
            {rows.length === 0 && <p style={{ color: "var(--muted)" }}>No locations yet.</p>}
            {rows.map((r) => {
              const margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
              const good = r.profit >= 0;
              return (
                <div key={r.id} className="portal-card" style={{ minHeight: 0, padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong style={{ flex: 1 }}>{r.name}</strong>
                    <span style={{ fontWeight: 800, color: good ? "var(--success-ink)" : "#b3261e" }}>
                      {good ? "+" : ""}${r.profit.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.88rem", color: "var(--muted)", marginTop: 6 }}>
                    Revenue ${r.revenue.toFixed(2)} • Labor ${r.labor.toFixed(2)} • Expenses ${r.expenses.toFixed(2)}
                    {r.revenue > 0 && ` • Margin ${margin.toFixed(0)}%`}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gap: 18, marginTop: 26 }}>
            <EntryForm
              title="Add revenue"
              form={revForm}
              setForm={setRevForm}
              locations={locations}
              saving={saving}
              onSave={() => saveEntry("rev", revForm, setRevForm)}
            />
            <EntryForm
              title="Add expense"
              form={expForm}
              setForm={setExpForm}
              locations={locations}
              saving={saving}
              onSave={() => saveEntry("exp", expForm, setExpForm)}
            />
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 16 }}>
            Tip: set each team member's hourly rate on the{" "}
            <Link href={`/app/${company.id}/team`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
              Team page
            </Link>{" "}
            so labor cost is counted.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 700 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, color: highlight ? (value >= 0 ? "var(--success-ink)" : "#b3261e") : "var(--ink)" }}>
        {value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}
      </div>
    </div>
  );
}

function EntryForm({ title, form, setForm, locations, saving, onSave }) {
  return (
    <section className="panel" style={{ padding: 22 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
        <select
          value={form.location_id}
          onChange={(e) => setForm({ ...form, location_id: e.target.value })}
          style={input}
        >
          <option value="">Choose a location…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
            Amount ($)
            <input
              type="number"
              min="0"
              step="any"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              style={{ ...input, marginTop: 6 }}
            />
          </label>
          <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
            Date
            <input
              type="date"
              value={form.entry_date}
              onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
              style={{ ...input, marginTop: 6 }}
            />
          </label>
        </div>
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Description (optional)"
          style={input}
        />
        <button onClick={onSave} disabled={saving} style={button}>
          {saving ? "Saving…" : title}
        </button>
      </div>
    </section>
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
