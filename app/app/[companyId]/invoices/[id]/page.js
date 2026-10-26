"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { getUser } from "../../../../../lib/session";
import { chicagoToday } from "../../../../../lib/dates";
import QuickBooksInvoicePanel from "../../../../../components/QuickBooksInvoicePanel";

const STATUS_LABELS = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  void: "Void",
};

const METHODS = ["", "Cash", "Card", "Check", "Bank transfer", "Other"];

function money(n) {
  const v = Number(n) || 0;
  return `$${v.toFixed(2)}`;
}

function dollarsToNumber(s) {
  if (s === "" || s === null || s === undefined) return NaN;
  const v = Number(s);
  if (Number.isNaN(v)) return NaN;
  return Math.round(v * 100) / 100;
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id;
  const { company, member, loading } = useCompany();
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [header, setHeader] = useState(null);
  const [itemForm, setItemForm] = useState({ description: "", quantity: "1", unit_price: "" });
  const [payForm, setPayForm] = useState({ amount: "", payment_date: "", method: "", reference: "", note: "" });
  const [voidPayment, setVoidPayment] = useState({ id: null, reason: "" });
  const [voidInvoice, setVoidInvoice] = useState({ open: false, reason: "" });
  const [emailTo, setEmailTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState("");

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const isDraft = invoice?.status === "draft";
  const balance = invoice ? Math.max(0, (Number(invoice.total) || 0) - (Number(invoice.amount_paid) || 0)) : 0;

  async function load() {
    const sb = supabase();
    const { data, error: invError } = await sb
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("company_id", company.id)
      .single();
    if (invError) {
      // A missing table (migration 061 not run yet) reads the same as a
      // load failure from here; show the calm state, never a crash.
      setUnavailable(true);
      return;
    }
    if (!data) {
      setNotFound(true);
      return;
    }
    setInvoice(data);
    if (data.client_contact && data.client_contact.includes("@")) {
      setEmailTo(data.client_contact);
    }
    setHeader({
      location_id: data.location_id || "",
      client_name: data.client_name || "",
      client_contact: data.client_contact || "",
      issue_date: data.issue_date || "",
      due_date: data.due_date || "",
      tax_rate: data.tax_rate != null ? String(data.tax_rate) : "",
      notes: data.notes || "",
    });
    const [{ data: itemRows }, { data: payRows }, { data: locs }] = await Promise.all([
      sb.from("invoice_line_items").select("*").eq("company_id", company.id).eq("invoice_id", invoiceId).order("sort_order").order("created_at"),
      sb.from("invoice_payments").select("*").eq("company_id", company.id).eq("invoice_id", invoiceId).order("payment_date", { ascending: false }).order("created_at", { ascending: false }),
      sb.from("locations").select("id, name, client_name, client_phone").eq("company_id", company.id).order("name"),
    ]);
    setItems(itemRows || []);
    setPayments(payRows || []);
    setLocations(locs || []);
  }

  useEffect(() => {
    if (!loading && company && member && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member]);

  useEffect(() => {
    if (company?.timezone && !payForm.payment_date) {
      setPayForm((f) => ({ ...f, payment_date: chicagoToday(company.timezone) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.timezone]);

  async function saveHeader(e) {
    e.preventDefault();
    setError("");
    const tax = header.tax_rate === "" ? 0 : Number(header.tax_rate);
    if (Number.isNaN(tax) || tax < 0 || tax > 100) {
      setError("Tax rate must be between 0 and 100 (percent).");
      return;
    }
    if (!header.client_name.trim()) {
      setError("Client name can't be empty.");
      return;
    }
    setSaving(true);
    const { error: updError } = await supabase()
      .from("invoices")
      .update({
        location_id: header.location_id || null,
        client_name: header.client_name.trim(),
        client_contact: header.client_contact.trim(),
        issue_date: header.issue_date || invoice.issue_date,
        due_date: header.due_date || null,
        tax_rate: tax,
        notes: header.notes.trim(),
      })
      .eq("id", invoice.id)
      .eq("company_id", company.id);
    setSaving(false);
    if (updError) {
      setError("Could not save. " + (updError.message || ""));
      return;
    }
    load();
  }

  async function addItem(e) {
    e.preventDefault();
    setError("");
    const qty = Number(itemForm.quantity);
    const price = dollarsToNumber(itemForm.unit_price);
    if (!itemForm.description.trim()) {
      setError("A line item needs a description.");
      return;
    }
    if (Number.isNaN(qty) || qty <= 0) {
      setError("Quantity must be more than 0.");
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      setError("Unit price must be 0 or more.");
      return;
    }
    setSaving(true);
    const { error: insError } = await supabase()
      .from("invoice_line_items")
      .insert({
        company_id: company.id,
        invoice_id: invoice.id,
        description: itemForm.description.trim(),
        quantity: qty,
        unit_price: price,
        sort_order: items.length,
      });
    setSaving(false);
    if (insError) {
      setError("Could not add the line item. " + (insError.message || ""));
      return;
    }
    setItemForm({ description: "", quantity: "1", unit_price: "" });
    load();
  }

  async function removeItem(item) {
    setError("");
    const { error: delError } = await supabase()
      .from("invoice_line_items")
      .delete()
      .eq("id", item.id)
      .eq("company_id", company.id);
    if (delError) {
      setError("Could not remove the line item. " + (delError.message || ""));
      return;
    }
    load();
  }

  async function issueInvoice() {
    setError("");
    if ((Number(invoice.total) || 0) <= 0) {
      setError("Add at least one line item with a price before issuing.");
      return;
    }
    setSaving(true);
    const { error: updError } = await supabase()
      .from("invoices")
      .update({ status: "issued", issued_at: new Date().toISOString() })
      .eq("id", invoice.id)
      .eq("company_id", company.id);
    setSaving(false);
    if (updError) {
      setError("Could not issue the invoice. " + (updError.message || ""));
      return;
    }
    load();
  }

  async function deleteDraft() {
    setError("");
    setSaving(true);
    const { error: delError } = await supabase()
      .from("invoices")
      .delete()
      .eq("id", invoice.id)
      .eq("company_id", company.id);
    setSaving(false);
    if (delError) {
      setError("Could not delete the draft. " + (delError.message || ""));
      return;
    }
    router.push(`/app/${company.id}/invoices`);
  }

  async function recordPayment(e) {
    e.preventDefault();
    setError("");
    const amount = dollarsToNumber(payForm.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Enter a payment amount above 0.");
      return;
    }
    if (amount > balance) {
      setError(`That is more than the remaining balance (${money(balance)}).`);
      return;
    }
    setSaving(true);
    const user = await getUser();
    const { error: insError } = await supabase()
      .from("invoice_payments")
      .insert({
        company_id: company.id,
        invoice_id: invoice.id,
        amount,
        payment_date: payForm.payment_date || chicagoToday(company?.timezone),
        method: payForm.method,
        reference: payForm.reference.trim(),
        note: payForm.note.trim(),
        recorded_by: user?.id || null,
      });
    setSaving(false);
    if (insError) {
      setError("Could not record the payment. " + (insError.message || ""));
      return;
    }
    setPayForm({ amount: "", payment_date: chicagoToday(company?.timezone), method: "", reference: "", note: "" });
    load();
  }

  // Delivery is read-only: emailing renders the stored invoice, its line
  // items, and its payment-ledger state. Nothing here writes to the invoice.
  async function sendInvoice() {
    setError("");
    setSentMsg("");
    const to = emailTo.trim();
    if (!to || !to.includes("@")) {
      setError("Enter the client's email address first.");
      return;
    }
    if (!confirm(`Email invoice #${invoice.invoice_number} to ${to}?`)) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch("/api/invoices/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ invoiceId: invoice.id, to }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(out.error || "Could not email the invoice.");
      } else if (out.emailed) {
        setSentMsg(`Invoice emailed to ${to}.`);
      } else {
        setError("The email service didn't send it — you can print or save a PDF instead." + (out.emailDebug ? ` (${out.emailDebug})` : ""));
      }
    } catch {
      setError("Could not email the invoice.");
    }
    setSending(false);
  }

  async function confirmVoidPayment() {
    setError("");
    const reason = voidPayment.reason.trim();
    if (reason.length < 10 || reason.length > 500) {
      setError("A void reason must be 10–500 characters.");
      return;
    }
    setSaving(true);
    const user = await getUser();
    const { error: updError } = await supabase()
      .from("invoice_payments")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: user?.id || null,
        void_reason: reason,
      })
      .eq("id", voidPayment.id)
      .eq("company_id", company.id);
    setSaving(false);
    if (updError) {
      setError("Could not void the payment. " + (updError.message || ""));
      return;
    }
    setVoidPayment({ id: null, reason: "" });
    load();
  }

  async function confirmVoidInvoice() {
    setError("");
    const reason = voidInvoice.reason.trim();
    if (reason.length < 10 || reason.length > 500) {
      setError("A void reason must be 10–500 characters.");
      return;
    }
    setSaving(true);
    const user = await getUser();
    const { error: updError } = await supabase()
      .from("invoices")
      .update({
        status: "void",
        voided_at: new Date().toISOString(),
        voided_by: user?.id || null,
        void_reason: reason,
      })
      .eq("id", invoice.id)
      .eq("company_id", company.id);
    setSaving(false);
    if (updError) {
      setError("Could not void the invoice. " + (updError.message || ""));
      return;
    }
    setVoidInvoice({ open: false, reason: "" });
    load();
  }

  if (loading || !company) return <p>Loading…</p>;

  if (!isManager) {
    return (
      <div>
        <p className="eyebrow">INVOICES</p>
        <h2 style={{ fontSize: "1.8rem" }}>Invoice</h2>
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Invoices are a financial record — owners and managers only.
          </p>
        </section>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div>
        <Link href={`/app/${company.id}/invoices`} className="back-link">← Back to invoices</Link>
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <p style={{ margin: 0 }}>
            <strong>Invoicing isn't switched on for this database yet.</strong>
          </p>
          <p style={{ color: "var(--muted)", marginBottom: 0 }}>
            A one-time database update (migration 061) creates the invoice tables. Until the
            owner runs it, invoices can't be opened — nothing else in the app is affected.
          </p>
        </section>
      </div>
    );
  }

  if (notFound) {
    return (
      <div>
        <Link href={`/app/${company.id}/invoices`} className="back-link">← Back to invoices</Link>
        <p style={{ color: "var(--muted)" }}>That invoice doesn't exist in this company.</p>
      </div>
    );
  }

  if (!invoice || !header) return <p>Loading…</p>;

  const activePayments = payments.filter((p) => !p.voided_at);

  return (
    <div>
      <Link href={`/app/${company.id}/invoices`} className="back-link">← Back to invoices</Link>
      <p className="eyebrow" style={{ marginTop: 10 }}>INVOICE #{invoice.invoice_number}</p>
      <h2 style={{ fontSize: "1.8rem", marginTop: 4 }}>
        {invoice.client_name || "Unnamed client"}{" "}
        <span style={badge(invoice.status)}>{STATUS_LABELS[invoice.status] || invoice.status}</span>
      </h2>
      <p style={{ color: "var(--muted)" }}>
        Issued {invoice.issue_date || "—"}
        {invoice.due_date && <> • Due {invoice.due_date}</>}
        {invoice.client_contact && <> • {invoice.client_contact}</>}
      </p>
      {error && (
        <p style={{ color: "#9b2d15", fontWeight: 700 }}>{error}</p>
      )}

      {invoice.status === "void" && (
        <section className="panel" style={{ padding: 20, margin: "16px 0", borderColor: "#9b2d15" }}>
          <p style={{ margin: 0 }}>
            <strong>This invoice was voided.</strong>
          </p>
          <p style={{ color: "var(--muted)", marginBottom: 0 }}>
            Reason: {invoice.void_reason || "—"}
            {invoice.voided_at && <> • {new Date(invoice.voided_at).toLocaleString()}</>}
          </p>
        </section>
      )}

      {(invoice.status === "issued" || invoice.status === "paid") && (
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <h3 style={{ marginTop: 0 }}>Send or print this invoice</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ ...labelStyle, flex: "1 1 240px" }}>
              Client email
              <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} style={input} placeholder="client@example.com" />
            </label>
            <button onClick={sendInvoice} disabled={sending} style={button}>
              {sending ? "Sending…" : "✉️ Email invoice"}
            </button>
            <a href={`/print/invoice/${invoice.id}`} target="_blank" rel="noreferrer"
              style={{ ...button, textDecoration: "none", display: "inline-block" }}>
              🖨 Print / PDF
            </a>
          </div>
          {sentMsg && <p style={{ color: "#1c6b32", fontWeight: 700, marginBottom: 0 }}>{sentMsg}</p>}
          <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: 0 }}>
            The email carries the full invoice — line items, payments received, and the
            balance due — exactly as recorded. Sending never changes any amount.
          </p>
        </section>
      )}

      {isDraft && (
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <h3 style={{ marginTop: 0 }}>Invoice details (draft — editable)</h3>
          <form onSubmit={saveHeader} style={{ display: "grid", gap: 10 }}>
            <label style={labelStyle}>
              Client location (optional)
              <select
                value={header.location_id}
                onChange={(e) => {
                  const loc = locations.find((l) => l.id === e.target.value);
                  setHeader((h) => ({
                    ...h,
                    location_id: e.target.value,
                    client_name: loc ? loc.client_name || loc.name || h.client_name : h.client_name,
                    client_contact: loc ? loc.client_phone || h.client_contact : h.client_contact,
                  }));
                }}
                style={input}
              >
                <option value="">— None —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.client_name ? ` (${l.client_name})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ ...labelStyle, flex: "2 1 220px" }}>
                Client name
                <input value={header.client_name} onChange={(e) => setHeader({ ...header, client_name: e.target.value })} style={input} />
              </label>
              <label style={{ ...labelStyle, flex: "1 1 160px" }}>
                Client contact
                <input value={header.client_contact} onChange={(e) => setHeader({ ...header, client_contact: e.target.value })} style={input} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ ...labelStyle, flex: "1 1 140px" }}>
                Issue date
                <input type="date" value={header.issue_date} onChange={(e) => setHeader({ ...header, issue_date: e.target.value })} style={input} />
              </label>
              <label style={{ ...labelStyle, flex: "1 1 140px" }}>
                Due date
                <input type="date" value={header.due_date} onChange={(e) => setHeader({ ...header, due_date: e.target.value })} style={input} />
              </label>
              <label style={{ ...labelStyle, flex: "1 1 120px" }}>
                Tax rate %
                <input type="number" min="0" max="100" step="0.001" value={header.tax_rate} onChange={(e) => setHeader({ ...header, tax_rate: e.target.value })} style={input} />
              </label>
            </div>
            <label style={labelStyle}>
              Notes
              <input value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} style={input} />
            </label>
            <div>
              <button type="submit" disabled={saving} style={button}>{saving ? "Saving…" : "Save details"}</button>
            </div>
          </form>
        </section>
      )}

      <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
        <h3 style={{ marginTop: 0 }}>Line items</h3>
        <div style={{ display: "grid", gap: 6 }}>
          {items.length === 0 && <p style={{ color: "var(--muted)", margin: 0 }}>No line items yet.</p>}
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ flex: 1 }}>
                {it.description}
                <span style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
                  {" "}• {Number(it.quantity)} × {money(it.unit_price)}
                </span>
              </span>
              <strong>{money(it.amount)}</strong>
              {isDraft && (
                <button onClick={() => removeItem(it)} style={smallGhost} aria-label="Remove line item">✕</button>
              )}
            </div>
          ))}
        </div>
        {isDraft && (
          <form onSubmit={addItem} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "end" }}>
            <label style={{ ...labelStyle, flex: "2 1 200px" }}>
              Description
              <input value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} style={input} placeholder="e.g. Monthly cleaning — October" />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 90px" }}>
              Qty
              <input type="number" min="0" step="0.001" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} style={input} />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 120px" }}>
              Unit price
              <input type="number" min="0" step="0.01" value={itemForm.unit_price} onChange={(e) => setItemForm({ ...itemForm, unit_price: e.target.value })} style={input} placeholder="0.00" />
            </label>
            <button type="submit" disabled={saving} style={button}>Add item</button>
          </form>
        )}
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 10, display: "grid", gap: 4, justifyItems: "end" }}>
          <span>Subtotal: <strong>{money(invoice.subtotal)}</strong></span>
          <span>Tax ({Number(invoice.tax_rate) || 0}%): <strong>{money(invoice.tax_amount)}</strong></span>
          <span style={{ fontSize: "1.1rem" }}>Total: <strong>{money(invoice.total)}</strong></span>
          {invoice.status !== "draft" && (
            <>
              <span>Paid: <strong>{money(invoice.amount_paid)}</strong></span>
              <span>Balance due: <strong>{money(balance)}</strong></span>
            </>
          )}
        </div>
      </section>

      {invoice.status === "issued" && (
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <h3 style={{ marginTop: 0 }}>Record a payment</h3>
          <form onSubmit={recordPayment} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ ...labelStyle, flex: "0 1 130px" }}>
              Amount
              <input type="number" min="0" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} style={input} placeholder={balance.toFixed(2)} />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 150px" }}>
              Date
              <input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} style={input} />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 140px" }}>
              Method
              <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} style={input}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>{m === "" ? "—" : m}</option>
                ))}
              </select>
            </label>
            <label style={{ ...labelStyle, flex: "1 1 140px" }}>
              Reference
              <input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} style={input} placeholder="Check # / transaction id" />
            </label>
            <label style={{ ...labelStyle, flex: "1 1 140px" }}>
              Note
              <input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} style={input} />
            </label>
            <button type="submit" disabled={saving} style={button}>{saving ? "Recording…" : "Record payment"}</button>
          </form>
          <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: 0 }}>
            Payments are never edited or deleted. A mistake is fixed by voiding the payment
            (with a reason) and recording a corrected one.
          </p>
        </section>
      )}

      {payments.length > 0 && (
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <h3 style={{ marginTop: 0 }}>Payments</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {payments.map((p) => (
              <div key={p.id} className="portal-card" style={{ minHeight: 0, padding: "12px 16px", opacity: p.voided_at ? 0.65 : 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ flex: 1 }}>
                    {money(p.amount)}
                    {p.voided_at && <span style={{ color: "#9b2d15" }}> — VOIDED</span>}
                  </strong>
                  <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                    {p.payment_date}
                    {p.method && <> • {p.method}</>}
                    {p.reference && <> • Ref {p.reference}</>}
                  </span>
                  {!p.voided_at && invoice.status !== "void" && voidPayment.id !== p.id && (
                    <button onClick={() => setVoidPayment({ id: p.id, reason: "" })} style={smallGhost}>Void</button>
                  )}
                </div>
                {p.note && <div style={{ fontSize: "0.88rem", color: "var(--muted)", marginTop: 4 }}>{p.note}</div>}
                {p.voided_at && (
                  <div style={{ fontSize: "0.88rem", color: "#9b2d15", marginTop: 4 }}>
                    Void reason: {p.void_reason || "—"}
                  </div>
                )}
                {voidPayment.id === p.id && (
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    <label style={labelStyle}>
                      Why is this payment being voided? (10–500 characters)
                      <input value={voidPayment.reason} onChange={(e) => setVoidPayment({ ...voidPayment, reason: e.target.value })} style={input} />
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={confirmVoidPayment} disabled={saving} style={dangerButton}>Void this payment</button>
                      <button onClick={() => setVoidPayment({ id: null, reason: "" })} style={smallGhost}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {activePayments.length > 0 && (
            <p style={{ fontWeight: 800, marginTop: 12, marginBottom: 0 }}>
              Total paid: {money(activePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0))}
            </p>
          )}
        </section>
      )}

      <QuickBooksInvoicePanel companyId={company.id} invoice={invoice} />

      {invoice.status !== "void" && (
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <h3 style={{ marginTop: 0 }}>{isDraft ? "Finish this invoice" : "Void this invoice"}</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {isDraft && (
              <>
                <button onClick={issueInvoice} disabled={saving} style={button}>Issue invoice</button>
                <button onClick={deleteDraft} disabled={saving} style={dangerButton}>Delete draft</button>
              </>
            )}
            {!voidInvoice.open && (
              <button onClick={() => setVoidInvoice({ open: true, reason: "" })} style={isDraft ? smallGhost : dangerButton}>
                Void invoice…
              </button>
            )}
          </div>
          {isDraft && (
            <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: 0 }}>
              Issuing locks the details and totals. After that, payments can be recorded, and
              mistakes are fixed by voiding — never by editing.
            </p>
          )}
          {voidInvoice.open && (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <label style={labelStyle}>
                Why is this invoice being voided? (10–500 characters)
                <input value={voidInvoice.reason} onChange={(e) => setVoidInvoice({ ...voidInvoice, reason: e.target.value })} style={input} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={confirmVoidInvoice} disabled={saving} style={dangerButton}>Void this invoice</button>
                <button onClick={() => setVoidInvoice({ open: false, reason: "" })} style={smallGhost}>Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function badge(status) {
  const colors = {
    draft: { background: "#e8ecf9", color: "#243b96" },
    issued: { background: "#fdf3d7", color: "#7a5b00" },
    paid: { background: "#e2f4e5", color: "#1c6b32" },
    void: { background: "#f6e3de", color: "#9b2d15" },
  };
  return {
    ...(colors[status] || colors.draft),
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: "0.8rem",
    fontWeight: 800,
    verticalAlign: "middle",
  };
}

const labelStyle = { fontSize: "0.9rem", fontWeight: 700, display: "block" };

const input = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
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

const dangerButton = {
  padding: "11px 22px",
  borderRadius: 999,
  border: "1px solid #9b2d15",
  background: "#fff",
  color: "#9b2d15",
  fontWeight: 800,
  cursor: "pointer",
};

const smallGhost = {
  padding: "7px 14px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  color: "var(--brand-deep)",
  fontWeight: 700,
  cursor: "pointer",
};
