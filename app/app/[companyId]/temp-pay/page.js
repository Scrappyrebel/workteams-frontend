"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { isManagerRole } from "../../../../lib/roles";
import { getUser } from "../../../../lib/session";
import { buildTempPayOwed, applyTempPayments, fmtMoney, fmtHours } from "../../../../lib/temp-pay-owed";

function isoDate(d) {
  // Local-timezone YYYY-MM-DD (same helper as the Payroll report).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Payment methods — the invoicing ledger's set (migration 061).
const METHODS = ["", "Cash", "Card", "Check", "Bank transfer", "Other"];

// "Table isn't there yet" — pre-migration databases answer the
// temp_payments select with one of these (migration 081 adds the
// table). Follow the repo's table-missing pattern: the report then
// shows owed exactly as before, with a plain note that recording
// turns on with the update — never a crash.
function tableMissing(error) {
  if (!error) return false;
  const msg = String(error.message || "");
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table|schema cache/i.test(msg)
  );
}

// Temp pay owed — owners/managers only. This is pay data: the page loads
// nothing at all for anyone else, and RLS on the temp tables is
// manager-scoped as a second wall (migration 043).
//
// What "owed" means here (also stated on the page): an assignment counts
// only when the temp accepted it, the job is marked completed, and the
// client confirmed the job's hours. Owed = the assignment's own recorded
// rate (temp_assignments.pay_rate_cents; the agency default when the
// assignment has none) x the client-confirmed hours. Assignments missing
// any of those recorded facts are listed under "Not yet payable" with
// the reason and no dollar amount — requested hours are never treated
// as hours worked.
//
// What "paid" means (migration 081): each payout a manager records is
// an immutable row in temp_payments — amount, date, method/reference,
// who recorded it. Paid reduces the balance still owed on that
// assignment; a recorded payment is never edited or deleted, only
// voided with a reason (the invoicing ledger's rule, migration 061).
export default function TempPayOwedPage() {
  const { company, member, loading } = useCompany();
  const [report, setReport] = useState(null);
  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 13);
    return { start: isoDate(start), end: isoDate(end) };
  });
  const [paymentsUnavailable, setPaymentsUnavailable] = useState(false);
  const [capped, setCapped] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [payForm, setPayForm] = useState({
    amount: "",
    payment_date: "",
    method: "",
    reference: "",
    note: "",
  });
  const [voidFor, setVoidFor] = useState({ id: null, reason: "" });
  const [saving, setSaving] = useState(false);

  const isManager = !!member && isManagerRole(member.role);

  async function load() {
    const sb = supabase();
    const [{ data: requests }, { data: members }, { data: config }] = await Promise.all([
      sb
        .from("temp_job_requests")
        .select("id, customer_name, service_type, job_date, status, hours_requested, hours_confirmed, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(500),
      sb
        .from("company_members")
        .select("id, display_name, email")
        .eq("company_id", company.id)
        .order("display_name"),
      sb
        .from("temp_agency_config")
        .select("temp_hourly_pay")
        .eq("company_id", company.id)
        .maybeSingle(),
    ]);
    const reqs = requests || [];
    let assignments = [];
    if (reqs.length > 0) {
      const { data: asg } = await sb
        .from("temp_assignments")
        .select("id, job_request_id, member_id, status, pay_rate_cents")
        .in("job_request_id", reqs.map((r) => r.id))
        .limit(1000);
      assignments = asg || [];
    }
    const base = buildTempPayOwed({
      assignments,
      requests: reqs,
      members: members || [],
      config: config || null,
      start: range.start,
      end: range.end,
    });
    // Recorded payments (081). If the table isn't there yet, the owed
    // report still renders exactly as before.
    let payments = [];
    let missing = false;
    if (assignments.length > 0) {
      const { data: pays, error: payErr } = await sb
        .from("temp_payments")
        .select("id, assignment_id, member_id, amount_cents, payment_date, method, reference, note, recorded_by, voided_at, voided_by, void_reason, created_at")
        .eq("company_id", company.id)
        .in("assignment_id", assignments.map((a) => a.id))
        .order("payment_date", { ascending: true });
      if (payErr) {
        if (tableMissing(payErr)) missing = true;
      } else {
        payments = pays || [];
      }
    }
    setCapped(reqs.length >= 500 || assignments.length >= 1000);
    setPaymentsUnavailable(missing);
    setReport(applyTempPayments(base, payments));
  }

  useEffect(() => {
    if (!loading && company && member && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member, isManager, range]);

  function openPaymentForm(d) {
    setVoidFor({ id: null, reason: "" });
    setPayFor(d.assignmentId);
    setPayForm({
      amount: (d.balanceCents / 100).toFixed(2),
      payment_date: isoDate(new Date()),
      method: "",
      reference: "",
      note: "",
    });
  }

  async function recordPayment(e, d) {
    e.preventDefault();
    const cents = Math.round(Number(payForm.amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      alert("Enter a payment amount above 0.");
      return;
    }
    if (cents > d.balanceCents) {
      alert(`That is more than the amount still owed on this job (${fmtMoney(d.balanceCents)}).`);
      return;
    }
    setSaving(true);
    const user = await getUser();
    const { error: insErr } = await supabase()
      .from("temp_payments")
      .insert({
        company_id: company.id,
        assignment_id: d.assignmentId,
        member_id: d.memberId,
        amount_cents: cents,
        payment_date: payForm.payment_date || isoDate(new Date()),
        method: payForm.method,
        reference: payForm.reference.trim(),
        note: payForm.note.trim(),
        recorded_by: user?.id || null,
      });
    setSaving(false);
    if (insErr) {
      alert("Could not record the payment: " + (insErr.message || ""));
      return;
    }
    setPayFor(null);
    load();
  }

  async function confirmVoidPayment(e, p) {
    e.preventDefault();
    const reason = voidFor.reason.trim();
    if (reason.length < 10 || reason.length > 500) {
      alert("A void reason must be 10–500 characters.");
      return;
    }
    setSaving(true);
    const user = await getUser();
    const { error: updErr } = await supabase()
      .from("temp_payments")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: user?.id || null,
        void_reason: reason,
      })
      .eq("id", p.id)
      .eq("company_id", company.id);
    setSaving(false);
    if (updErr) {
      alert("Could not void the payment: " + (updErr.message || ""));
      return;
    }
    setVoidFor({ id: null, reason: "" });
    load();
  }

  function exportCsv() {
    if (!report) return;
    const lines = ["temp,email,client,date,hours,rate_per_hour,amount_owed,amount_paid,amount_still_owed"];
    for (const t of report.perTemp) {
      for (const d of t.details) {
        lines.push(
          [
            `"${t.memberName}"`,
            t.memberEmail,
            `"${d.client}"`,
            d.date,
            fmtHours(d.hoursHundredths),
            (d.rateCents / 100).toFixed(2),
            (d.owedCents / 100).toFixed(2),
            ((d.paidCents ?? 0) / 100).toFixed(2),
            ((d.balanceCents ?? d.owedCents) / 100).toFixed(2),
          ].join(",")
        );
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `temp_pay_owed_${range.start}_${range.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !company) return <p>Loading…</p>;

  if (!isManager) {
    return (
      <div>
        <p className="eyebrow">TEMP STAFFING — PAY</p>
        <h2 style={{ fontSize: "1.8rem" }}>Temp pay owed</h2>
        <p style={{ color: "var(--muted)" }}>This report is for owners and managers only.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">TEMP STAFFING — PAY</p>
      <h2 style={{ fontSize: "1.8rem" }}>Temp pay owed</h2>
      <p style={{ color: "var(--muted)" }}>
        What each temp is owed for finished temp jobs. An assignment counts here only when the
        temp accepted it, the job is marked completed, and the client confirmed the hours —
        owed is that assignment&rsquo;s recorded pay rate × the client-confirmed hours (the same
        per-cleaner hours the job was quoted on). Jobs missing any of those steps are listed
        below under &ldquo;Not yet payable&rdquo; with no amount, so nothing is ever guessed
        from requested hours. When you pay a temp, record it on the job below — the payment
        stays on record and the amount still owed drops by what you paid.
      </p>

      <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.9rem", fontWeight: 700 }}>
            From
            <input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} style={input} />
          </label>
          <label style={{ fontSize: "0.9rem", fontWeight: 700 }}>
            To
            <input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} style={input} />
          </label>
          <button onClick={exportCsv} style={button}>Export CSV</button>
        </div>
      </section>

      {report && paymentsUnavailable && (
        <section className="panel" style={{ padding: 16, margin: "0 0 16px", background: "#fffbe8" }}>
          <p style={{ margin: 0 }}>
            Recording payments turns on with the latest WorkTeams update. Until then, this
            report shows what is owed exactly as before.
          </p>
        </section>
      )}

      {!report && <p style={{ color: "var(--muted)" }}>Loading…</p>}

      {report && report.perTemp.length === 0 && (
        <p style={{ color: "var(--muted)" }}>
          No temp pay is owed in this range yet — no completed jobs with client-confirmed hours.
        </p>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {(report?.perTemp || []).map((t) => (
          <div key={t.memberId} className="portal-card" style={{ minHeight: 0, padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <strong>{t.memberName}</strong>
                {t.memberEmail && (
                  <span style={{ color: "var(--muted)", fontSize: "0.88rem" }}> • {t.memberEmail}</span>
                )}
              </div>
              <span style={{ fontWeight: 800, fontSize: "1.15rem" }}>{fmtMoney(t.balanceCents ?? t.totalCents)}</span>
              <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                {fmtHours(t.totalHoursHundredths)} h • {t.assignments} assignment{t.assignments === 1 ? "" : "s"}
                {t.paidCents > 0
                  ? ` • ${fmtMoney(t.paidCents)} paid of ${fmtMoney(t.totalCents)} owed${t.balanceCents <= 0 ? " • Paid in full" : ""}`
                  : ""}
              </span>
            </div>
            <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
              {t.details.map((d) => (
                <div key={d.assignmentId}>
                  <div style={{ fontSize: "0.88rem", color: "var(--muted)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span>{d.date}</span>
                    <span style={{ flex: 1 }}>
                      {d.client}
                      {d.serviceType ? ` · ${d.serviceType.replace(/_/g, " ")}` : ""}
                    </span>
                    <span>{fmtHours(d.hoursHundredths)} h confirmed</span>
                    <span>
                      × {fmtMoney(d.rateCents)}/hr
                      {d.rateSource === "agency default" ? " (agency default)" : ""}
                    </span>
                    <span style={{ fontWeight: 700, color: "var(--brand-deep)" }}>{fmtMoney(d.owedCents)}</span>
                  </div>

                  {!paymentsUnavailable && (
                    <div style={{ fontSize: "0.88rem", margin: "2px 0 6px" }}>
                      {d.paidCents > 0 && (
                        <div style={{ color: "var(--muted)" }}>
                          Paid {fmtMoney(d.paidCents)} •{" "}
                          {d.balanceCents > 0 ? (
                            <>
                              Still owed{" "}
                              <strong style={{ color: "var(--brand-deep)" }}>{fmtMoney(d.balanceCents)}</strong>
                            </>
                          ) : d.balanceCents < 0 ? (
                            <>Paid in full — payments exceed the current owed figure by {fmtMoney(-d.balanceCents)}</>
                          ) : (
                            "Paid in full"
                          )}
                        </div>
                      )}

                      {(d.payments || []).map((p) => (
                        <div key={p.id}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", color: p.voided_at ? "var(--muted)" : "inherit" }}>
                            <span style={{ flex: 1 }}>
                              {p.voided_at ? "Voided • " : ""}
                              {p.payment_date} • {fmtMoney(p.amount_cents)}
                              {p.method ? ` • ${p.method}` : ""}
                              {p.reference ? ` • ${p.reference}` : ""}
                              {p.note ? ` • ${p.note}` : ""}
                              {p.voided_at && p.void_reason ? ` • ${p.void_reason}` : ""}
                            </span>
                            {!p.voided_at && voidFor.id !== p.id && (
                              <button style={smallSecondary} onClick={() => setVoidFor({ id: p.id, reason: "" })}>
                                Void
                              </button>
                            )}
                          </div>
                          {voidFor.id === p.id && (
                            <form onSubmit={(e) => confirmVoidPayment(e, p)} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", margin: "4px 0" }}>
                              <label style={{ fontSize: "0.9rem", fontWeight: 700, flex: 1, minWidth: 240 }}>
                                Why is this payment void?
                                <input
                                  value={voidFor.reason}
                                  onChange={(e) => setVoidFor({ ...voidFor, reason: e.target.value })}
                                  placeholder="Reason (10–500 characters)"
                                  style={input}
                                />
                              </label>
                              <button type="submit" disabled={saving} style={smallButton}>
                                Void payment
                              </button>
                              <button type="button" style={smallSecondary} onClick={() => setVoidFor({ id: null, reason: "" })}>
                                Cancel
                              </button>
                            </form>
                          )}
                        </div>
                      ))}

                      {d.balanceCents > 0 && payFor !== d.assignmentId && (
                        <button style={{ ...smallButton, marginTop: 4 }} onClick={() => openPaymentForm(d)}>
                          Record payment
                        </button>
                      )}
                      {payFor === d.assignmentId && (
                        <form onSubmit={(e) => recordPayment(e, d)} style={{ display: "grid", gap: 8, maxWidth: 560, marginTop: 6 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                            <label style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                              Amount paid ($)
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={payForm.amount}
                                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                                style={{ ...input, width: 150 }}
                              />
                            </label>
                            <label style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                              Date paid
                              <input
                                type="date"
                                value={payForm.payment_date}
                                onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                                style={{ ...input, width: 180 }}
                              />
                            </label>
                            <label style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                              Method
                              <select
                                value={payForm.method}
                                onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                                style={{ ...input, width: 180 }}
                              >
                                {METHODS.map((m) => (
                                  <option key={m} value={m}>
                                    {m || "Method (optional)"}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <input
                            value={payForm.reference}
                            onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                            placeholder="Reference (check #, transfer id — optional)"
                            style={{ ...input, marginTop: 0 }}
                          />
                          <input
                            value={payForm.note}
                            onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
                            placeholder="Note (optional)"
                            style={{ ...input, marginTop: 0 }}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="submit" disabled={saving} style={smallButton}>
                              {saving ? "Recording…" : "Record payment"}
                            </button>
                            <button type="button" disabled={saving} style={smallSecondary} onClick={() => setPayFor(null)}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {report && report.perTemp.length > 0 && (
        <>
          <p style={{ fontWeight: 800, marginTop: 14 }}>
            Total owed: {fmtMoney(report.grandBalanceCents ?? report.grandTotalCents)}
          </p>
          {report.grandPaidCents > 0 && (
            <p style={{ color: "var(--muted)", marginTop: 4 }}>
              {fmtMoney(report.grandPaidCents)} already paid of {fmtMoney(report.grandTotalCents)} total
              owed in this range.
            </p>
          )}
          {capped && (
            <p style={{ color: "var(--muted)", marginTop: 4 }}>
              This report hit its loading limit (500 jobs / 1,000 assignments in range), so some
              jobs may not be shown — narrow the dates to see the rest.
            </p>
          )}
        </>
      )}

      {report && report.awaiting.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <h3 style={{ marginBottom: 8 }}>Not yet payable</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {report.awaiting.map((d) => (
              <div key={d.assignmentId} className="portal-card" style={{ minHeight: 0, padding: "12px 18px" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: "0.92rem" }}>
                  <strong>{d.memberName}</strong>
                  <span style={{ flex: 1, color: "var(--muted)" }}>
                    {d.date} · {d.client}
                    {d.serviceType ? ` · ${d.serviceType.replace(/_/g, " ")}` : ""}
                  </span>
                  <span style={{ color: "var(--muted)" }}>
                    {d.rateCents !== null ? `${fmtMoney(d.rateCents)}/hr` : "no rate recorded"}
                    {d.hoursRequested != null ? ` · ${Number(d.hoursRequested).toFixed(2)} h requested` : ""}
                  </span>
                  <span style={{ fontWeight: 700 }}>{d.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {report && report.excludedCount > 0 && (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 14 }}>
          {report.excludedCount} declined / no-show assignment{report.excludedCount === 1 ? "" : "s"} in
          this range {report.excludedCount === 1 ? "is" : "are"} not listed — no pay is owed on those.
        </p>
      )}

      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 18 }}>
        WorkTeams doesn&rsquo;t process payroll — hand this report (or the CSV) to your payroll
        provider, same as the Payroll report. Payments recorded here are pay you already made
        outside WorkTeams (check, cash, or transfer) — recording one never moves money; it keeps
        the record of who was paid what, and when.
      </p>
    </div>
  );
}

const input = {
  display: "block",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  marginTop: 6,
};

const button = {
  padding: "11px 22px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const smallButton = {
  padding: "8px 18px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 700,
  fontSize: "0.9rem",
  cursor: "pointer",
};

const smallSecondary = {
  padding: "8px 18px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  color: "inherit",
  fontWeight: 700,
  fontSize: "0.9rem",
  cursor: "pointer",
};
