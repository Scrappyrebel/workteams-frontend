"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

// Printable invoice view — the "save as PDF" path is the browser's own
// Print → Save as PDF. This page is a read-only rendering of the stored
// invoice, its line items, and its payment-ledger state; it never writes.
// Access is the same as the manager invoice page: row-level security only
// returns invoices to owners/admins of the invoice's company.
//
// Customer-copy honesty (Wave 2 Family 3): this sheet is handed to the
// customer, so it renders only facts from the stored records — seller
// name, the billed client's own name/contact/service address, the
// invoice's dates, items, totals, payments, and the manager's notes
// (the one place payment instructions can live today). WorkTeams stores
// NO seller address, phone, email, or payment-instructions field for a
// company (companies carries a name only), so none is printed — absent
// fields are omitted, never placeholdered. Internal ledger-integrity
// wording belongs on the manager screens, not on this customer sheet.

const STATUS_LABELS = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  void: "Void",
};

function money(n) {
  const v = Number(n) || 0;
  return `$${v.toFixed(2)}`;
}

export default function InvoicePrintPage() {
  const params = useParams();
  const invoiceId = params.id;
  const [state, setState] = useState("loading"); // loading | signin | missing | unavailable | ready
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [companyName, setCompanyName] = useState("");
  const printedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        setState("signin");
        return;
      }
      const { data, error } = await sb
        .from("invoices")
        .select("*, locations(name, address)")
        .eq("id", invoiceId)
        .maybeSingle();
      if (error) {
        setState("unavailable");
        return;
      }
      if (!data) {
        setState("missing");
        return;
      }
      setInvoice(data);
      const [{ data: itemRows }, { data: payRows }, { data: comp }] = await Promise.all([
        sb.from("invoice_line_items").select("*").eq("company_id", data.company_id).eq("invoice_id", invoiceId).order("sort_order").order("created_at"),
        sb.from("invoice_payments").select("*").eq("company_id", data.company_id).eq("invoice_id", invoiceId).order("payment_date", { ascending: true }).order("created_at", { ascending: true }),
        sb.from("companies").select("name").eq("id", data.company_id).maybeSingle(),
      ]);
      setItems(itemRows || []);
      setPayments((payRows || []).filter((p) => !p.voided_at));
      setCompanyName(comp?.name || "");
      setState("ready");
    })();
  }, [invoiceId]);

  useEffect(() => {
    if (state === "ready" && !printedRef.current) {
      printedRef.current = true;
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (state === "loading") return <p style={pageMsg}>Loading invoice…</p>;

  if (state === "signin") {
    return (
      <div style={pageMsg}>
        <p><strong>Sign in to view this invoice.</strong></p>
        <p>Invoices are financial records — owners and managers only.</p>
        <p><Link href="/login">Go to sign in →</Link></p>
      </div>
    );
  }

  if (state === "unavailable") {
    return (
      <div style={pageMsg}>
        <p><strong>Invoicing isn't switched on for this database yet.</strong></p>
        <p>A one-time database update (migration 061) creates the invoice tables.</p>
      </div>
    );
  }

  if (state === "missing" || !invoice) {
    return (
      <div style={pageMsg}>
        <p><strong>That invoice doesn't exist, or your account can't see it.</strong></p>
        <p>Invoices are only visible to owners and managers of the company that issued them.</p>
      </div>
    );
  }

  const balance = Math.max(0, (Number(invoice.total) || 0) - (Number(invoice.amount_paid) || 0));

  return (
    <div style={pageWrap}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
        @page { margin: 16mm; }
      `}</style>

      <div className="no-print" style={toolbar}>
        <Link href={`/app/${invoice.company_id}/invoices/${invoice.id}`} style={toolbarLink}>← Back to the invoice</Link>
        <button onClick={() => window.print()} style={toolbarBtn}>🖨 Print / Save as PDF</button>
      </div>

      <header style={{ borderBottom: "3px solid #111827", paddingBottom: 12, marginBottom: 16 }}>
        <p style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>{companyName || "Invoice"}</p>
        <p style={{ margin: "4px 0 0", color: "#4b5563" }}>
          INVOICE #{invoice.invoice_number} • {STATUS_LABELS[invoice.status] || invoice.status}
        </p>
      </header>

      <section style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: "1 1 220px" }}>
          <p style={docLabel}>Billed to</p>
          <p style={{ margin: "2px 0", fontWeight: 700 }}>{invoice.client_name || "—"}</p>
          {invoice.client_contact && <p style={{ margin: "2px 0" }}>{invoice.client_contact}</p>}
          {invoice.locations?.name && <p style={{ margin: "2px 0" }}>{invoice.locations.name}</p>}
          {invoice.locations?.address && <p style={{ margin: "2px 0" }}>{invoice.locations.address}</p>}
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <p style={docLabel}>Dates</p>
          <p style={{ margin: "2px 0" }}>Issued: {invoice.issue_date || "—"}</p>
          {invoice.due_date && <p style={{ margin: "2px 0" }}>Due: <strong>{invoice.due_date}</strong></p>}
        </div>
      </section>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={th}>Description</th>
            <th style={{ ...th, textAlign: "right" }}>Qty</th>
            <th style={{ ...th, textAlign: "right" }}>Unit price</th>
            <th style={{ ...th, textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td style={td}>{it.description}</td>
              <td style={{ ...td, textAlign: "right" }}>{Number(it.quantity)}</td>
              <td style={{ ...td, textAlign: "right" }}>{money(it.unit_price)}</td>
              <td style={{ ...td, textAlign: "right" }}>{money(it.amount)}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td style={td} colSpan={4}>No line items.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ display: "grid", gap: 3, justifyItems: "end", marginTop: 10 }}>
        <span>Subtotal: <strong>{money(invoice.subtotal)}</strong></span>
        <span>Tax ({Number(invoice.tax_rate) || 0}%): <strong>{money(invoice.tax_amount)}</strong></span>
        <span style={{ fontSize: "1.15rem" }}>Total: <strong>{money(invoice.total)}</strong></span>
      </div>

      {payments.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <p style={docLabel}>Payments received</p>
          {payments.map((p) => (
            <p key={p.id} style={{ margin: "3px 0" }}>
              {p.payment_date} — <strong>{money(p.amount)}</strong>
              {p.method && <> • {p.method}</>}
              {p.reference && <> • Ref {p.reference}</>}
            </p>
          ))}
          <p style={{ margin: "6px 0 0" }}>Total paid: <strong>{money(invoice.amount_paid)}</strong></p>
        </section>
      )}

      <p style={{ fontSize: "1.25rem", marginTop: 18, borderTop: "2px solid #111827", paddingTop: 10 }}>
        Balance due: <strong>{money(balance)}</strong>
      </p>

      {balance > 0 && invoice.status !== "void" && invoice.due_date && (
        <p style={{ fontSize: "1.05rem", fontWeight: 700, margin: "4px 0 0" }}>
          Payment due {invoice.due_date}
        </p>
      )}

      {invoice.status === "void" && (
        <p style={{ color: "#9b2d15", fontWeight: 700 }}>
          This invoice was voided{invoice.void_reason ? ` — ${invoice.void_reason}` : ""}.
        </p>
      )}

      {invoice.notes && (
        <section style={{ marginTop: 16 }}>
          <p style={docLabel}>Notes</p>
          <p style={{ margin: "2px 0", whiteSpace: "pre-wrap" }}>{invoice.notes}</p>
        </section>
      )}

      <footer style={{ marginTop: 28, color: "#6b7280", fontSize: "0.85rem" }}>
        <p style={{ margin: 0 }}>Thank you!</p>
      </footer>
    </div>
  );
}

const pageWrap = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "28px 22px 40px",
  fontFamily: "Arial, Helvetica, sans-serif",
  color: "#111827",
  background: "#fff",
};

const pageMsg = {
  maxWidth: 560,
  margin: "60px auto",
  padding: "0 22px",
  fontFamily: "Arial, Helvetica, sans-serif",
  color: "#111827",
};

const toolbar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 22,
};

const toolbarLink = { color: "#243b96", fontWeight: 700, textDecoration: "none" };

const toolbarBtn = {
  padding: "10px 20px",
  borderRadius: 999,
  border: "none",
  background: "#3457d5",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const docLabel = {
  fontSize: "0.78rem",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#6b7280",
  margin: "0 0 4px",
};

const th = {
  textAlign: "left",
  padding: "7px 8px",
  borderBottom: "2px solid #111827",
  fontSize: "0.9rem",
};

const td = {
  padding: "7px 8px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "0.95rem",
};
