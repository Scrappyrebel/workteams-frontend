import { createClient } from "@supabase/supabase-js";

// Server-only bridge from WorkTeams invoice payments to Ridgefront Accounting.
// The send stays inert unless BOTH server settings are present:
//   RIDGEFRONT_BOOKS_KEY       - the connection key made inside Ridgefront Accounting
//   RIDGEFRONT_BOOKS_COMPANIES - comma-separated company ids allowed to send
// Nothing about a specific company lives in this code; the operator's server
// settings decide which companies send. Records already in the books are
// skipped by the receiving door (same source_id), never doubled.

const DOOR_URL = "https://ridgefront-accounting.pages.dev/api/app-connect";
const SOURCE_APP = "workteams";
const WINDOW_DAYS = 45;
const SEND_CHUNK = 500;
const READ_PAGE = 1000;

export function booksKey() {
  return (process.env.RIDGEFRONT_BOOKS_KEY || "").trim();
}

export function booksCompanies() {
  return (process.env.RIDGEFRONT_BOOKS_COMPANIES || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function booksConfiguredFor(companyId) {
  return Boolean(booksKey()) && booksCompanies().includes(companyId);
}

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export function booksWindow() {
  const now = new Date();
  return {
    from: isoDay(new Date(now.getTime() - (WINDOW_DAYS - 1) * 86400000)),
    to: isoDay(now),
  };
}

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

async function fetchAll(build) {
  const rows = [];
  for (let lo = 0; ; lo += READ_PAGE) {
    const { data, error } = await build(lo, lo + READ_PAGE - 1);
    if (error) throw new Error(error.message);
    const page = data || [];
    rows.push(...page);
    if (page.length < READ_PAGE) return rows;
  }
}

function paymentToRow(payment, invoice) {
  const bits = [
    payment.method || null,
    payment.reference ? `Ref ${payment.reference}` : null,
    payment.note || null,
  ].filter(Boolean);
  const head = invoice
    ? `Invoice payment - ${invoice.client_name || "Client"} ${
        invoice.invoice_number || ""
      }`.trim()
    : "Invoice payment";
  const row = {
    date: payment.payment_date,
    type: "income",
    category: "Customer payments",
    description: bits.length ? `${head} - ${bits.join(" / ")}` : head,
    amount: roundMoney(payment.amount),
    source_id: payment.id,
  };
  if (payment.invoice_id) row.invoice_source_id = payment.invoice_id;
  return row;
}

function countOf(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  return 0;
}

async function postToDoor(companyId, rows) {
  const response = await fetch(DOOR_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-connection-key": booksKey(),
    },
    body: JSON.stringify({
      source_app: SOURCE_APP,
      source_company_id: companyId,
      kind: "money",
      rows,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      payload && typeof payload.error === "string"
        ? payload.error
        : `The books door answered ${response.status}.`;
    throw new Error(detail);
  }
  return {
    saved: countOf(payload && payload.saved),
    updated: countOf(payload && payload.updated),
    skipped: countOf(payload && payload.skipped),
  };
}

export async function sendCompanyToBooks(companyId) {
  const result = {
    companyId,
    paymentsFound: 0,
    paymentsSent: 0,
    heldBack: 0,
    saved: 0,
    updated: 0,
    skipped: 0,
  };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ...result,
      error: "The server is missing its service key, so records cannot be read.",
    };
  }
  const sb = admin();
  const { from, to } = booksWindow();
  try {
    // Received money in WorkTeams = payments that were never voided (the
    // same rule the invoice page itself uses for its totals).
    const payments = await fetchAll((lo, hi) =>
      sb
        .from("invoice_payments")
        .select(
          "id,company_id,invoice_id,amount,payment_date,method,reference,note,voided_at"
        )
        .eq("company_id", companyId)
        .is("voided_at", null)
        .gte("payment_date", from)
        .lte("payment_date", to)
        .order("payment_date", { ascending: true })
        .order("id", { ascending: true })
        .range(lo, hi)
    );
    result.paymentsFound = payments.length;

    const invoiceIds = [
      ...new Set(payments.map((p) => p.invoice_id).filter(Boolean)),
    ];
    const invoiceById = new Map();
    for (let at = 0; at < invoiceIds.length; at += 75) {
      const { data, error } = await sb
        .from("invoices")
        .select("id,invoice_number,client_name,status,voided_at")
        .eq("company_id", companyId)
        .in("id", invoiceIds.slice(at, at + 75));
      if (error) throw new Error(error.message);
      for (const invoice of data || []) invoiceById.set(invoice.id, invoice);
    }

    const rows = [];
    for (const payment of payments) {
      const invoice = payment.invoice_id
        ? invoiceById.get(payment.invoice_id)
        : null;
      if (invoice && (invoice.status === "void" || invoice.voided_at)) {
        result.heldBack += 1;
        continue;
      }
      if (!(roundMoney(payment.amount) > 0)) {
        result.heldBack += 1;
        continue;
      }
      rows.push(paymentToRow(payment, invoice || null));
      result.paymentsSent += 1;
    }

    for (let at = 0; at < rows.length; at += SEND_CHUNK) {
      const part = await postToDoor(companyId, rows.slice(at, at + SEND_CHUNK));
      result.saved += part.saved;
      result.updated += part.updated;
      result.skipped += part.skipped;
    }
    return result;
  } catch (cause) {
    return {
      ...result,
      error: cause instanceof Error ? cause.message : "The send did not finish.",
    };
  }
}

export async function sendAllConfiguredToBooks() {
  const { from, to } = booksWindow();
  const companies = booksCompanies();
  const summary = {
    configured: Boolean(booksKey()) && companies.length > 0,
    windowDays: WINDOW_DAYS,
    from,
    to,
    companies: [],
    totals: { paymentsSent: 0, heldBack: 0, saved: 0, updated: 0, skipped: 0 },
  };
  if (!summary.configured) return summary;
  for (const companyId of companies) {
    const result = await sendCompanyToBooks(companyId);
    summary.companies.push(result);
    summary.totals.paymentsSent += result.paymentsSent;
    summary.totals.heldBack += result.heldBack;
    summary.totals.saved += result.saved;
    summary.totals.updated += result.updated;
    summary.totals.skipped += result.skipped;
  }
  return summary;
}
