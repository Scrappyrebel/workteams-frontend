"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { useClockedIn } from "../../../../lib/use-clocked-in";
import { canUseWithRole } from "../../../../lib/tiers";
import { resolveEntryPayRate, MEMBER_PAY_RATE_COLUMNS } from "../../../../lib/pay-rate";
import { chicagoToday, chicagoDaysAgo } from "../../../../lib/dates";

const RANGES = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

const emptyEntry = (tz) => ({ location_id: "", amount: "", description: "", entry_date: chicagoToday(tz) });

export default function ProfitabilityPage() {
  const { company, member, loading } = useCompany();
  const { clockedIn, checking } = useClockedIn(true);
  const [locations, setLocations] = useState([]);
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState("90");
  const [computing, setComputing] = useState(false);
  const [revForm, setRevForm] = useState(() => emptyEntry());
  const [expForm, setExpForm] = useState(() => emptyEntry());
  const [saving, setSaving] = useState(false);
  // Manual entry lists (migration 066 adds actor/void columns; until it
  // runs, auditReady stays false and the page keeps its pre-066 behavior:
  // entries still list and edit, void controls stay hidden).
  const [revEntries, setRevEntries] = useState([]);
  const [expEntries, setExpEntries] = useState([]);
  const [auditReady, setAuditReady] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  // Company-local date default once the company's timezone is known.
  useEffect(() => {
    if (company?.timezone) {
      const d = chicagoToday(company.timezone);
      setRevForm((f) => ({ ...f, entry_date: f.entry_date || d }));
      setExpForm((f) => ({ ...f, entry_date: f.entry_date || d }));
    }
  }, [company?.timezone]);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "profitability", member?.role);

  async function compute() {
    setComputing(true);
    const sb = supabase();
    const sel = RANGES.find((r) => r.key === range);
    const since = sel.days ? chicagoDaysAgo(sel.days, company?.timezone) : null;

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
    // Money with no location is never dropped: it collects in an explicit
    // "No location" bucket (with counts) that is rendered as its own row
    // and included in the page totals.
    let unallocBidRevenue = 0;
    let unallocBidCount = 0;
    const unallocLineBidIds = new Set();
    for (const b of bids || []) {
      bidLoc[b.id] = b.location_id;
      const mode = b.pricing_mode || "line_items";
      if (mode === "line_items") {
        lineIds.push(b.id);
        if (!b.location_id) {
          unallocLineBidIds.add(b.id);
          unallocBidCount += 1;
        }
        continue;
      }
      const lid = b.location_id;
      const amt =
        mode === "hourly"
          ? Number(b.hours || 0) * Number(b.hourly_rate || 0)
          : Number(b.square_footage || 0) * Number(b.rate_per_sqft || 0);
      if (!lid) {
        unallocBidRevenue += amt;
        unallocBidCount += 1;
        continue;
      }
      bidTotals[lid] = (bidTotals[lid] || 0) + amt;
    }
    if (lineIds.length > 0) {
      const { data: items } = await sb.from("bid_items").select("bid_id, quantity, unit_price").in("bid_id", lineIds);
      for (const it of items || []) {
        const lid = bidLoc[it.bid_id];
        const amt = Number(it.quantity) * Number(it.unit_price);
        if (!lid) {
          if (unallocLineBidIds.has(it.bid_id)) unallocBidRevenue += amt;
          continue;
        }
        bidTotals[lid] = (bidTotals[lid] || 0) + amt;
      }
    }

    // Manual revenue + expense entries. Full rows are kept for the entry
    // lists below the add forms; voided rows (migration 066) are listed
    // as voided and excluded from every total.
    let revQ = sb.from("revenue_entries")
      .select("id, location_id, amount, description, entry_date, created_at")
      .eq("company_id", company.id)
      .order("entry_date", { ascending: false });
    if (since) revQ = revQ.gte("entry_date", since);
    const { data: revs } = await revQ;
    let expQ = sb.from("expense_entries")
      .select("id, location_id, amount, description, entry_date, created_at")
      .eq("company_id", company.id)
      .order("entry_date", { ascending: false });
    if (since) expQ = expQ.gte("entry_date", since);
    const { data: exps } = await expQ;

    // The 066 audit columns may not exist yet (the owner runs migrations
    // separately). Probe them tolerantly — the widest read that fails
    // falls back to legacy behavior instead of breaking the page.
    const auditByKey = {};
    let auditOk = false;
    {
      const probe = "id, voided_at, voided_by, void_reason";
      const { data: ra, error: raErr } = await sb.from("revenue_entries").select(probe).eq("company_id", company.id);
      const { data: ea, error: eaErr } = await sb.from("expense_entries").select(probe).eq("company_id", company.id);
      if (!raErr && !eaErr) {
        auditOk = true;
        for (const r of ra || []) auditByKey["rev:" + r.id] = r;
        for (const r of ea || []) auditByKey["exp:" + r.id] = r;
      }
    }
    setAuditReady(auditOk);
    const withAudit = (list, kind) =>
      (list || []).map((e) => ({
        ...e,
        kind,
        voided_at: auditByKey[kind + ":" + e.id]?.voided_at || null,
        void_reason: auditByKey[kind + ":" + e.id]?.void_reason || null,
      }));
    const revList = withAudit(revs, "rev");
    const expList = withAudit(exps, "exp");
    setRevEntries(revList);
    setExpEntries(expList);

    let revTotals = {};
    let unallocRev = 0;
    let unallocRevCount = 0;
    for (const r of revList) {
      if (r.voided_at) continue;
      if (!r.location_id) {
        unallocRev += Number(r.amount);
        unallocRevCount += 1;
        continue;
      }
      revTotals[r.location_id] = (revTotals[r.location_id] || 0) + Number(r.amount);
    }

    let expTotals = {};
    let unallocExp = 0;
    let unallocExpCount = 0;
    for (const e of expList) {
      if (e.voided_at) continue;
      if (!e.location_id) {
        unallocExp += Number(e.amount);
        unallocExpCount += 1;
        continue;
      }
      expTotals[e.location_id] = (expTotals[e.location_id] || 0) + Number(e.amount);
    }

    // Labor cost: closed time entries × each entry's effective pay rate.
    // The rate MUST come from the shared chain in lib/pay-rate — the same
    // resolution the Payroll report uses (clock-in snapshot → per-hat dual
    // rate → legacy hourly_rate). This page previously read only the legacy
    // hourly_rate column, which the dual-rate Team editor no longer
    // maintains, so labor priced at $0/stale and profit was overstated.
    let timeQ = sb
      .from("time_entries")
      .select("location_id, clock_in, clock_out, member_id, clock_in_role, pay_rate_applied")
      .eq("company_id", company.id)
      .not("clock_out", "is", null);
    if (since) timeQ = timeQ.gte("clock_in", since + "T00:00:00");
    const { data: entries } = await timeQ;
    // Pay rates live in member_pay (owner/admin-only table).
    const { data: pay } = await sb.from("member_pay").select(MEMBER_PAY_RATE_COLUMNS).eq("company_id", company.id);
    const payByMember = {};
    for (const p of pay || []) payByMember[p.member_id] = p;
    let laborTotals = {};
    let unallocLabor = 0;
    let unallocLaborCount = 0;
    for (const e of entries || []) {
      const hours = (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000;
      if (hours <= 0) continue;
      const cost = hours * resolveEntryPayRate(e, payByMember[e.member_id]);
      if (!e.location_id) {
        // Manager-stamped shifts carry no location. Their labor is real
        // cost: count it in the No location bucket, never drop it.
        unallocLabor += cost;
        unallocLaborCount += 1;
        continue;
      }
      laborTotals[e.location_id] = (laborTotals[e.location_id] || 0) + cost;
    }

    const out = locList.map((l) => {
      const revenue = (bidTotals[l.id] || 0) + (revTotals[l.id] || 0);
      const labor = laborTotals[l.id] || 0;
      const expenses = expTotals[l.id] || 0;
      const cost = labor + expenses;
      const profit = revenue - cost;
      return { id: l.id, name: l.name, revenue, labor, expenses, cost, profit };
    });
    if (unallocBidCount > 0 || unallocRevCount > 0 || unallocExpCount > 0 || unallocLaborCount > 0) {
      const revenue = unallocBidRevenue + unallocRev;
      const cost = unallocLabor + unallocExp;
      out.push({
        id: "__unallocated",
        name: "No location",
        revenue,
        labor: unallocLabor,
        expenses: unallocExp,
        cost,
        profit: revenue - cost,
        unallocated: {
          bids: unallocBidCount,
          revEntries: unallocRevCount,
          expEntries: unallocExpCount,
          shifts: unallocLaborCount,
        },
      });
    }
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
    const row = {
      company_id: company.id,
      location_id: form.location_id,
      amount: parseFloat(form.amount) || 0,
      description: form.description.trim() || null,
      entry_date: form.entry_date,
    };
    // created_by exists only after migration 066; stamp it when present.
    if (auditReady) row.created_by = member.user_id;
    const { error } = await supabase().from(table).insert(row);
    setSaving(false);
    if (error) alert("Could not save: " + error.message);
    else {
      reset(() => emptyEntry(company?.timezone));
      compute();
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const amount = parseFloat(editing.amount);
    if (!editing.entry_date || Number.isNaN(amount) || amount < 0) {
      alert("Enter an amount of 0 or more and a date.");
      return;
    }
    setBusy(true);
    const table = editing.kind === "rev" ? "revenue_entries" : "expense_entries";
    const patch = {
      location_id: editing.location_id || null,
      amount,
      description: editing.description.trim() || null,
      entry_date: editing.entry_date,
    };
    if (auditReady) {
      patch.updated_at = new Date().toISOString();
      patch.updated_by = member.user_id;
    }
    const { error } = await supabase().from(table).update(patch)
      .eq("id", editing.id)
      .eq("company_id", company.id);
    setBusy(false);
    if (error) alert("Could not save the correction: " + error.message);
    else {
      setEditing(null);
      compute();
    }
  }

  async function voidEntry(entry) {
    const reason = window.prompt(
      "Void this entry? It stays on record with your reason and stops counting in the totals.\n\nReason (10-500 characters):"
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10 || trimmed.length > 500) {
      alert("Enter a reason of 10 to 500 characters.");
      return;
    }
    setBusy(true);
    const table = entry.kind === "rev" ? "revenue_entries" : "expense_entries";
    const now = new Date().toISOString();
    const { error } = await supabase().from(table).update({
      voided_at: now,
      voided_by: member.user_id,
      void_reason: trimmed,
      updated_at: now,
      updated_by: member.user_id,
    }).eq("id", entry.id).eq("company_id", company.id).is("voided_at", null);
    setBusy(false);
    if (error) alert("Could not void: " + error.message);
    else compute();
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
        Revenue from accepted bids + manual entries. Cost = clocked hours × each shift's
        pay rate (the same rate the payroll report uses) + manual expenses. Anything with
        no location is grouped under "No location" below and still counts in the totals.
        Informational only — WorkTeams never runs payroll.
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
                  {r.unallocated && (
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                      Counts {unallocatedParts(r.unallocated)} with no location assigned — included in
                      the totals above, never dropped.
                    </div>
                  )}
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
          <EntriesList
            title="Revenue entries in this range"
            entries={revEntries}
            locations={locations}
            auditReady={auditReady}
            editing={editing}
            setEditing={setEditing}
            busy={busy}
            onSaveEdit={saveEdit}
            onVoid={voidEntry}
          />
          <EntriesList
            title="Expense entries in this range"
            entries={expEntries}
            locations={locations}
            auditReady={auditReady}
            editing={editing}
            setEditing={setEditing}
            busy={busy}
            onSaveEdit={saveEdit}
            onVoid={voidEntry}
          />
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

function counted(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function unallocatedParts(u) {
  const parts = [];
  if (u.bids) parts.push(counted(u.bids, "accepted bid", "accepted bids"));
  if (u.revEntries) parts.push(counted(u.revEntries, "revenue entry", "revenue entries"));
  if (u.expEntries) parts.push(counted(u.expEntries, "expense entry", "expense entries"));
  if (u.shifts) parts.push(counted(u.shifts, "shift", "shifts"));
  return parts.join(", ");
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

function EntriesList({ title, entries, locations, auditReady, editing, setEditing, busy, onSaveEdit, onVoid }) {
  if (!entries || entries.length === 0) return null;
  const locName = (id) => (locations.find((l) => l.id === id) || {}).name || "No location";
  return (
    <section className="panel" style={{ padding: 22, marginTop: 18 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ display: "grid", gap: 10 }}>
        {entries.map((e) => {
          if (editing && editing.id === e.id && editing.kind === e.kind) {
            return (
              <div key={e.kind + e.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "grid", gap: 8, maxWidth: 520 }}>
                <select
                  value={editing.location_id}
                  onChange={(ev) => setEditing({ ...editing, location_id: ev.target.value })}
                  style={input}
                >
                  <option value="">No location</option>
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
                      value={editing.amount}
                      onChange={(ev) => setEditing({ ...editing, amount: ev.target.value })}
                      style={{ ...input, marginTop: 6 }}
                    />
                  </label>
                  <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                    Date
                    <input
                      type="date"
                      value={editing.entry_date}
                      onChange={(ev) => setEditing({ ...editing, entry_date: ev.target.value })}
                      style={{ ...input, marginTop: 6 }}
                    />
                  </label>
                </div>
                <input
                  value={editing.description}
                  onChange={(ev) => setEditing({ ...editing, description: ev.target.value })}
                  placeholder="Description (optional)"
                  style={input}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={onSaveEdit} disabled={busy} style={button}>
                    {busy ? "Saving…" : "Save correction"}
                  </button>
                  <button onClick={() => setEditing(null)} disabled={busy} style={smallButton}>
                    Cancel
                  </button>
                </div>
              </div>
            );
          }
          const voided = !!e.voided_at;
          return (
            <div key={e.kind + e.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, opacity: voided ? 0.65 : 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong style={{ textDecoration: voided ? "line-through" : "none" }}>
                  ${Number(e.amount).toFixed(2)}
                </strong>
                <span>{e.entry_date}</span>
                <span style={{ color: "var(--muted)" }}>{locName(e.location_id)}</span>
                {e.description && <span style={{ color: "var(--muted)" }}>{e.description}</span>}
                <span style={{ flex: 1 }} />
                {!voided && (
                  <>
                    <button
                      onClick={() => setEditing({
                        kind: e.kind,
                        id: e.id,
                        location_id: e.location_id || "",
                        amount: String(e.amount),
                        description: e.description || "",
                        entry_date: e.entry_date,
                      })}
                      disabled={busy}
                      style={smallButton}
                    >
                      Edit
                    </button>
                    {auditReady && (
                      <button onClick={() => onVoid(e)} disabled={busy} style={smallButton}>
                        Void
                      </button>
                    )}
                  </>
                )}
              </div>
              {voided && (
                <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                  Voided {String(e.voided_at).slice(0, 10)}
                  {e.void_reason ? ` — ${e.void_reason}` : ""} · not counted in totals
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
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

const smallButton = {
  border: "1px solid var(--line)",
  borderRadius: 999,
  padding: "5px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
  background: "#fff",
};
