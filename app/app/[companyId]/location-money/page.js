"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { chicagoToday } from "../../../../lib/dates";

function money(n) {
  const v = Number(n) || 0;
  return `$${v.toFixed(2)}`;
}

function counted(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function mapRows(data) {
  return (data || []).map((r) => ({
    id: r.location_id || "__unallocated",
    name: r.location_name || "No location",
    unallocated: !r.location_id,
    acceptedBids: Number(r.accepted_bids) || 0,
    estimated: Number(r.estimated) || 0,
    issuedInvoices: Number(r.issued_invoices) || 0,
    invoiced: Number(r.invoiced) || 0,
    paid: Number(r.paid) || 0,
    balance: Number(r.balance_due) || 0,
  }));
}

// Period presets, computed from "today" in the company's timezone.
// A period view counts the records that STARTED in the period:
// accepted bids by the date they were created, invoices by their
// issue date (migration 083 states the same basis in its header).
function periodRange(key, tz) {
  const today = chicagoToday(tz);
  const [y, m] = today.split("-").map(Number);
  if (key === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  if (key === "year") return { from: `${y}-01-01`, to: today };
  if (key === "lastMonth") {
    const first = new Date(Date.UTC(y, m - 2, 1));
    const last = new Date(Date.UTC(y, m - 1, 0));
    const iso = (d) => d.toISOString().slice(0, 10);
    return { from: iso(first), to: iso(last) };
  }
  return null;
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function downloadCsv(filename, lines) {
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LocationMoneyPage() {
  const { company, member, loading } = useCompany();
  const [rows, setRows] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [computing, setComputing] = useState(false);
  // Period view (migration 083). period === null means All time,
  // which keeps reading through the original 077 rollup below, so
  // the all-time figures never change. periodPending means a period
  // was asked for but the 083 functions are not live yet — the page
  // then keeps showing the all-time figures and says so.
  const [periodKey, setPeriodKey] = useState("all");
  const [period, setPeriod] = useState(null);
  const [periodPending, setPeriodPending] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({});

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    setComputing(true);
    // Migration 077 creates the rollup function. Until the owner runs
    // it, the call errors — show a calm "not switched on yet" state
    // instead of breaking the page (the same posture as Invoices/061).
    const { data, error } = await supabase().rpc("workteams_location_money_rollup", {
      p_company_id: company.id,
    });
    if (error) {
      setUnavailable(true);
      setComputing(false);
      return;
    }
    setUnavailable(false);
    setPeriodPending(false);
    setRows(mapRows(data));
    setComputing(false);
  }

  async function loadPeriod(range) {
    setComputing(true);
    // Migration 083 creates the period rollup. Until the owner runs
    // it, the call errors — fall back to the all-time figures through
    // the 077 rollup and label the view honestly instead of showing
    // period numbers the database did not compute.
    const { data, error } = await supabase().rpc("workteams_location_money_rollup_period", {
      p_company_id: company.id,
      p_from: range.from,
      p_to: range.to,
    });
    if (error) {
      setPeriodPending(true);
      const all = await supabase().rpc("workteams_location_money_rollup", {
        p_company_id: company.id,
      });
      if (!all.error) setRows(mapRows(all.data));
      setComputing(false);
      return;
    }
    setPeriodPending(false);
    setRows(mapRows(data));
    setComputing(false);
  }

  function choosePeriod(key) {
    setPeriodKey(key);
    setPeriodError("");
    setExpandedId(null);
    setDetails({});
    if (key === "all") {
      setPeriod(null);
      load();
      return;
    }
    if (key === "custom") return; // applied by the Show button below
    const range = periodRange(key, company.timezone);
    setPeriod(range);
    loadPeriod(range);
  }

  function applyCustomPeriod() {
    if (!customFrom || !customTo) {
      setPeriodError("Pick both a start date and an end date.");
      return;
    }
    if (customFrom > customTo) {
      setPeriodError("The start date must be on or before the end date.");
      return;
    }
    setPeriodError("");
    setExpandedId(null);
    setDetails({});
    const range = { from: customFrom, to: customTo };
    setPeriod(range);
    loadPeriod(range);
  }

  // The period actually in force for the figures on screen: a pending
  // period (083 not live yet) means the screen is showing all time.
  const activePeriod = period && !periodPending ? period : null;

  async function toggleDetail(row) {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    if (details[row.id]) return;
    setDetails((d) => ({ ...d, [row.id]: { loading: true } }));
    // Migration 083 also creates the detail function. Until it runs,
    // the expansion says so plainly; the totals above it are the
    // rollup's own and are unaffected.
    const { data, error } = await supabase().rpc("workteams_location_money_detail", {
      p_company_id: company.id,
      p_location_id: row.unallocated ? null : row.id,
      p_unallocated: row.unallocated,
      p_from: activePeriod ? activePeriod.from : null,
      p_to: activePeriod ? activePeriod.to : null,
    });
    if (error) {
      setDetails((d) => ({ ...d, [row.id]: { unavailable: true } }));
      return;
    }
    setDetails((d) => ({
      ...d,
      [row.id]: {
        items: (data || []).map((x) => ({
          kind: x.kind,
          id: x.record_id,
          label: x.label || "",
          detail: x.detail || "",
          date: x.record_date || "",
          status: x.status || "",
          total: Number(x.total) || 0,
          paid: x.paid === null || x.paid === undefined ? null : Number(x.paid) || 0,
          balance: x.balance_due === null || x.balance_due === undefined ? null : Number(x.balance_due) || 0,
        })),
      },
    }));
  }

  function exportSummaryCsv() {
    const periodLine = activePeriod
      ? `${activePeriod.from} to ${activePeriod.to}`
      : "All time";
    const basis = activePeriod
      ? "Estimated = accepted bids created in the period, valued as Profitability values them. Invoiced = issued invoices with an issue date in the period (drafts not billed yet; voided invoices not counted). Paid = everything paid on those invoices so far. Balance due = invoiced - paid."
      : "Estimated = accepted bids, valued as Profitability values them. Invoiced = issued invoices only (drafts not billed yet; voided invoices not counted). Paid = payments recorded against those invoices. Balance due = invoiced - paid.";
    const countTotals = rows.reduce(
      (s, r) => ({
        bids: s.bids + r.acceptedBids,
        invoices: s.invoices + r.issuedInvoices,
      }),
      { bids: 0, invoices: 0 }
    );
    const lines = [
      ["Money by Location"].map(csvCell).join(","),
      ["Company", company.name || ""].map(csvCell).join(","),
      ["Period", periodLine].map(csvCell).join(","),
      ["Basis", basis].map(csvCell).join(","),
      "",
      ["Location", "Accepted bids", "Estimated", "Issued invoices", "Invoiced", "Paid", "Balance due"]
        .map(csvCell)
        .join(","),
      ...rows.map((r) =>
        [r.name, r.acceptedBids, r.estimated.toFixed(2), r.issuedInvoices, r.invoiced.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2)]
          .map(csvCell)
          .join(",")
      ),
      ["All locations", countTotals.bids, totals.estimated.toFixed(2), countTotals.invoices, totals.invoiced.toFixed(2), totals.paid.toFixed(2), totals.balance.toFixed(2)]
        .map(csvCell)
        .join(","),
    ];
    downloadCsv(
      activePeriod
        ? `money-by-location_${activePeriod.from}_to_${activePeriod.to}.csv`
        : "money-by-location_all-time.csv",
      lines
    );
  }

  function exportDetailCsv(row, items) {
    const lines = [
      ["Money by Location — records behind the figures"].map(csvCell).join(","),
      ["Location", row.name].map(csvCell).join(","),
      ["Period", activePeriod ? `${activePeriod.from} to ${activePeriod.to}` : "All time"].map(csvCell).join(","),
      "",
      ["Kind", "Record", "Client", "Date", "Status", "Total / value", "Paid", "Balance due"].map(csvCell).join(","),
      ...items.map((x) =>
        [
          x.kind === "invoice" ? "Invoice" : "Accepted bid",
          x.label,
          x.detail,
          x.date,
          x.status,
          x.total.toFixed(2),
          x.paid === null ? "" : x.paid.toFixed(2),
          x.balance === null ? "" : x.balance.toFixed(2),
        ]
          .map(csvCell)
          .join(",")
      ),
    ];
    downloadCsv(`money-by-location_records_${row.id}.csv`, lines);
  }

  useEffect(() => {
    if (!loading && company && member && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member]);

  if (loading || !company) return <p>Loading…</p>;

  if (!isManager) {
    return (
      <div>
        <p className="eyebrow">MONEY BY LOCATION</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Money by Location</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p style={{ margin: 0 }}>
            Billing totals are a financial record — owners and managers only.
          </p>
        </section>
      </div>
    );
  }

  // The totals are the plain sum of the rows on screen — including the
  // "No location" row — so the company total reconciles with its parts
  // by construction.
  const totals = rows.reduce(
    (s, r) => ({
      estimated: s.estimated + r.estimated,
      invoiced: s.invoiced + r.invoiced,
      paid: s.paid + r.paid,
      balance: s.balance + r.balance,
    }),
    { estimated: 0, invoiced: 0, paid: 0, balance: 0 }
  );

  return (
    <div>
      <p className="eyebrow">MONEY BY LOCATION</p>
      <h2 style={{ fontSize: "1.8rem" }}>Money by location</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Every location is a client. <strong>Estimated</strong> = accepted bids, valued the
        same way Profitability values them. <strong>Invoiced</strong> = issued invoices
        only (drafts are not billed yet; voided invoices are not counted).{" "}
        <strong>Paid</strong> = payments recorded against those invoices.{" "}
        <strong>Balance due</strong> = invoiced − paid. WorkTeams does not issue
        credit notes — an issued invoice is corrected by voiding it and issuing a new
        one. This page is read-only;
        it changes nothing. See also{" "}
        <Link href={`/app/${company.id}/invoices`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
          Invoices
        </Link>{" "}
        and{" "}
        <Link href={`/app/${company.id}/profitability`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
          Profitability
        </Link>
        .
      </p>

      {!unavailable && (
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6, fontSize: "0.88rem", fontWeight: 700 }}>
              Period
              <select
                value={periodKey}
                onChange={(e) => choosePeriod(e.target.value)}
                disabled={computing}
                style={{ padding: "8px 10px" }}
              >
                <option value="all">All time</option>
                <option value="month">This month</option>
                <option value="lastMonth">Last month</option>
                <option value="year">This year</option>
                <option value="custom">Custom range…</option>
              </select>
            </label>
            {periodKey === "custom" && (
              <>
                <label style={{ display: "grid", gap: 6, fontSize: "0.88rem", fontWeight: 700 }}>
                  From
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    style={{ padding: "8px 10px" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 6, fontSize: "0.88rem", fontWeight: 700 }}>
                  To
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    style={{ padding: "8px 10px" }}
                  />
                </label>
                <button type="button" onClick={applyCustomPeriod} disabled={computing}>
                  Show that range
                </button>
              </>
            )}
            <button type="button" onClick={exportSummaryCsv} disabled={computing || rows.length === 0}>
              Download CSV for your bookkeeper
            </button>
          </div>
          {periodError && (
            <p style={{ color: "#b3261e", marginBottom: 0 }}>{periodError}</p>
          )}
          {periodPending ? (
            <p style={{ color: "var(--muted)", marginBottom: 0 }}>
              <strong>Period views aren't switched on yet.</strong> They turn on with the
              latest WorkTeams update. Until then, this page shows all-time figures —
              pick All time, or keep reading the figures below as all-time totals.
            </p>
          ) : activePeriod ? (
            <p style={{ color: "var(--muted)", marginBottom: 0 }}>
              Showing {activePeriod.from} to {activePeriod.to}. In a period view,{" "}
              <strong>Estimated</strong> counts accepted bids created in those dates,
              and <strong>Invoiced</strong>, <strong>Paid</strong> and{" "}
              <strong>Balance due</strong> come from invoices issued in those dates —
              Paid is everything paid on those invoices so far, whenever the payment
              arrived. A payment received in these dates on an older invoice counts
              in All time, not here.
            </p>
          ) : (
            <p style={{ color: "var(--muted)", marginBottom: 0 }}>
              Showing all time. Pick a period to see the bids created and invoices
              issued in just those dates, open a location below to see the records
              behind its figures, or download the figures as a CSV.
            </p>
          )}
        </section>
      )}

      {unavailable ? (
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <p style={{ margin: 0 }}>
            <strong>This view isn't switched on yet.</strong>
          </p>
          <p style={{ color: "var(--muted)", marginBottom: 0 }}>
            This view turns on with the latest WorkTeams update. Until then, this page
            stays empty — nothing else in the app is affected, and Invoices and
            Profitability keep working as they do today.
          </p>
        </section>
      ) : computing ? (
        <p>Crunching numbers…</p>
      ) : (
        <>
          <section className="panel" style={{ padding: 22, marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Stat label="Estimated" value={totals.estimated} />
              <Stat label="Invoiced" value={totals.invoiced} />
              <Stat label="Paid" value={totals.paid} />
              <Stat label="Balance due" value={totals.balance} highlight />
            </div>
          </section>

          <div style={{ display: "grid", gap: 10 }}>
            {rows.length === 0 && <p style={{ color: "var(--muted)" }}>No locations yet.</p>}
            {rows.map((r) => (
              <div key={r.id} className="portal-card" style={{ minHeight: 0, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <strong style={{ flex: 1 }}>{r.name}</strong>
                  <span style={{ fontWeight: 800, color: r.balance > 0 ? "#b3261e" : "var(--success-ink)" }}>
                    {money(r.balance)} due
                  </span>
                </div>
                <div style={{ fontSize: "0.88rem", color: "var(--muted)", marginTop: 6 }}>
                  Estimated {money(r.estimated)} • Invoiced {money(r.invoiced)} • Paid{" "}
                  {money(r.paid)} • Balance {money(r.balance)}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                  {counted(r.acceptedBids, "accepted bid", "accepted bids")} •{" "}
                  {counted(r.issuedInvoices, "issued invoice", "issued invoices")}
                </div>
                {r.unallocated && (
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                    Bids and invoices with no location assigned — a typed-in client name, or
                    a location that was later removed. Counted here in full and included in
                    the totals above, never spread across real locations.
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <button type="button" onClick={() => toggleDetail(r)}>
                    {expandedId === r.id
                      ? "Hide the records behind these figures"
                      : "See the records behind these figures"}
                  </button>
                </div>
                {expandedId === r.id && (
                  <DetailList
                    row={r}
                    state={details[r.id]}
                    companyId={company.id}
                    periodLabel={
                      activePeriod ? `${activePeriod.from} to ${activePeriod.to}` : "all time"
                    }
                    onExport={() => exportDetailCsv(r, details[r.id]?.items || [])}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DetailList({ row, state, companyId, periodLabel, onExport }) {
  if (!state || state.loading) return <p style={{ marginTop: 10 }}>Loading records…</p>;
  if (state.unavailable) {
    return (
      <p style={{ color: "var(--muted)", marginTop: 10, marginBottom: 0 }}>
        <strong>The record list isn't switched on yet.</strong> It turns on with the
        latest WorkTeams update. The figures above are the rollup's own and are
        unaffected — the same invoices and bids are listed under Invoices and Bids.
      </p>
    );
  }
  const items = state.items || [];
  const invoices = items.filter((x) => x.kind === "invoice");
  const bids = items.filter((x) => x.kind === "bid");
  if (items.length === 0) {
    return (
      <p style={{ color: "var(--muted)", marginTop: 10, marginBottom: 0 }}>
        No issued invoices or accepted bids for this location in {periodLabel} —
        that is why the figures above are what they are for this view.
      </p>
    );
  }
  return (
    <div style={{ marginTop: 12 }}>
      {invoices.length > 0 && (
        <>
          <div style={{ fontWeight: 800, fontSize: "0.88rem" }}>
            Issued invoices ({periodLabel})
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {invoices.map((x) => (
              <div key={x.id} style={{ fontSize: "0.88rem" }}>
                <Link
                  href={`/app/${companyId}/invoices/${x.id}`}
                  style={{ color: "var(--brand-deep)", fontWeight: 700 }}
                >
                  {x.label}
                </Link>{" "}
                {x.detail ? `— ${x.detail} ` : ""}· Issued {x.date} · Total{" "}
                {money(x.total)} • Paid {money(x.paid)} • Balance {money(x.balance)}
              </div>
            ))}
          </div>
        </>
      )}
      {bids.length > 0 && (
        <>
          <div style={{ fontWeight: 800, fontSize: "0.88rem", marginTop: invoices.length ? 12 : 0 }}>
            Accepted bids ({periodLabel})
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {bids.map((x) => (
              <div key={x.id} style={{ fontSize: "0.88rem" }}>
                <Link
                  href={`/app/${companyId}/bids/${x.id}`}
                  style={{ color: "var(--brand-deep)", fontWeight: 700 }}
                >
                  {x.label || "Untitled bid"}
                </Link>{" "}
                {x.detail ? `— ${x.detail} ` : ""}· Created {x.date} · Valued at{" "}
                {money(x.total)}
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ marginTop: 10 }}>
        <button type="button" onClick={onExport}>
          Download these records (CSV)
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 700 }}>{label.toUpperCase()}</div>
      <div
        style={{
          fontSize: "1.5rem",
          fontWeight: 800,
          color: highlight ? (value > 0 ? "#b3261e" : "var(--success-ink)") : "var(--ink)",
        }}
      >
        {money(value)}
      </div>
    </div>
  );
}
