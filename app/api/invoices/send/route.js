import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function money(n) {
  const v = Number(n) || 0;
  return `$${v.toFixed(2)}`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Same Resend transport the bid-send route already uses (RESEND_API_KEY /
// RESEND_FROM_DOMAIN). No new service, no new dependency.
async function tryEmail({ to, subject, text, html, fromName }) {
  const key = process.env.RESEND_API_KEY;
  const domain = (process.env.RESEND_FROM_DOMAIN || "lillybsjanitorial.com").trim();
  const from = fromName
    ? `${fromName} <noreply@${domain}>`
    : process.env.RESEND_FROM || `WorkTeams <noreply@${domain}>`;
  if (!key || !to) return { ok: false, reason: !key ? "missing-key" : "missing-to" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => "");
    console.error("resend error", res.status, body.slice(0, 300));
    return { ok: false, reason: `resend-${res.status}`, detail: body.slice(0, 200) };
  } catch (e) {
    console.error("resend fetch failed", e?.message);
    return { ok: false, reason: "fetch-failed" };
  }
}

// POST /api/invoices/send — emails an issued/paid invoice to the client.
// Body: { invoiceId, to } — caller must be an authenticated owner/admin of
// the invoice's company (verified via the Supabase access token).
// Delivery is READ-ONLY: this route never writes to the invoice, its line
// items, or the payment ledger. Amounts in the email are rendered from the
// stored records exactly as the manager app shows them.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`invoice-send:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

    const authHeader = req.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!accessToken) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { invoiceId, to } = await req.json();
    if (!invoiceId || !to || typeof to !== "string" || !to.includes("@")) {
      return NextResponse.json({ error: "An invoice and a valid client email are required." }, { status: 400 });
    }

    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const client = sb();
    const { data: invoice } = await client
      .from("invoices")
      .select("*, companies(name), locations(name)")
      .eq("id", invoiceId)
      .maybeSingle();
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    const { data: membership } = await client
      .from("company_members")
      .select("role")
      .eq("company_id", invoice.company_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Only an owner or manager can send invoices." }, { status: 403 });
    }

    if (invoice.status === "draft") {
      return NextResponse.json(
        { error: "Issue this invoice before emailing it — a draft can still change." },
        { status: 400 }
      );
    }
    if (invoice.status === "void") {
      return NextResponse.json({ error: "A voided invoice can't be sent." }, { status: 400 });
    }

    const [{ data: items }, { data: payRows }] = await Promise.all([
      client
        .from("invoice_line_items")
        .select("description, quantity, unit_price, amount")
        .eq("company_id", invoice.company_id)
        .eq("invoice_id", invoice.id)
        .order("sort_order")
        .order("created_at"),
      client
        .from("invoice_payments")
        .select("amount, payment_date, method, reference, voided_at")
        .eq("company_id", invoice.company_id)
        .eq("invoice_id", invoice.id)
        .order("payment_date", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    const lineItems = items || [];
    const payments = (payRows || []).filter((p) => !p.voided_at);
    const companyName = invoice.companies?.name || "WorkTeams";
    const locationName = invoice.locations?.name || "";
    const balance = Math.max(0, (Number(invoice.total) || 0) - (Number(invoice.amount_paid) || 0));
    const statusWord = balance <= 0 && (Number(invoice.total) || 0) > 0 ? "Paid in full" : invoice.status === "paid" ? "Paid" : "Issued";

    const textLines = [
      `Invoice #${invoice.invoice_number} from ${companyName}`,
      "",
      `Billed to: ${invoice.client_name || ""}${invoice.client_contact ? ` (${invoice.client_contact})` : ""}`,
      ...(locationName ? [`Location: ${locationName}`] : []),
      `Issued: ${invoice.issue_date || "—"}${invoice.due_date ? ` • Due: ${invoice.due_date}` : ""}`,
      `Status: ${statusWord}`,
      "",
      "Line items:",
      ...lineItems.map((it) => `- ${it.description} — ${Number(it.quantity)} × ${money(it.unit_price)} = ${money(it.amount)}`),
      "",
      `Subtotal: ${money(invoice.subtotal)}`,
      `Tax (${Number(invoice.tax_rate) || 0}%): ${money(invoice.tax_amount)}`,
      `Total: ${money(invoice.total)}`,
      ...(payments.length > 0
        ? [
            "",
            "Payments received:",
            ...payments.map((p) => `- ${p.payment_date} — ${money(p.amount)}${p.method ? ` (${p.method})` : ""}${p.reference ? ` — Ref ${p.reference}` : ""}`),
            `Total paid: ${money(invoice.amount_paid)}`,
          ]
        : []),
      `Balance due: ${money(balance)}`,
      ...(invoice.notes ? ["", `Notes: ${invoice.notes}`] : []),
      "",
      "Thank you!",
      "Questions about this invoice? Just reply to this email.",
    ];
    const text = textLines.join("\n");

    const rowsHtml = lineItems
      .map(
        (it) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(it.description)}</td>` +
          `<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${esc(Number(it.quantity))}</td>` +
          `<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${money(it.unit_price)}</td>` +
          `<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${money(it.amount)}</td></tr>`
      )
      .join("");
    const paymentsHtml =
      payments.length > 0
        ? `<p style="margin:16px 0 4px"><strong>Payments received</strong></p>` +
          payments
            .map(
              (p) =>
                `<p style="margin:2px 0;color:#374151">${esc(p.payment_date)} — ${money(p.amount)}${p.method ? ` (${esc(p.method)})` : ""}${p.reference ? ` — Ref ${esc(p.reference)}` : ""}</p>`
            )
            .join("") +
          `<p style="margin:4px 0">Total paid: <strong>${money(invoice.amount_paid)}</strong></p>`
        : "";
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:640px">
  <h1 style="font-size:20px;margin:0 0 2px">${esc(companyName)}</h1>
  <p style="margin:0 0 16px;color:#6b7280">Invoice #${esc(invoice.invoice_number)} • ${esc(statusWord)}</p>
  <p style="margin:2px 0"><strong>Billed to:</strong> ${esc(invoice.client_name || "")}${invoice.client_contact ? ` (${esc(invoice.client_contact)})` : ""}</p>
  ${locationName ? `<p style="margin:2px 0"><strong>Location:</strong> ${esc(locationName)}</p>` : ""}
  <p style="margin:2px 0"><strong>Issued:</strong> ${esc(invoice.issue_date || "—")}${invoice.due_date ? ` &nbsp; <strong>Due:</strong> ${esc(invoice.due_date)}` : ""}</p>
  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <thead><tr>
      <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #111827">Description</th>
      <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #111827">Qty</th>
      <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #111827">Unit price</th>
      <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #111827">Amount</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p style="margin:12px 0 2px;text-align:right">Subtotal: ${money(invoice.subtotal)}</p>
  <p style="margin:2px 0;text-align:right">Tax (${esc(Number(invoice.tax_rate) || 0)}%): ${money(invoice.tax_amount)}</p>
  <p style="margin:2px 0;text-align:right;font-size:17px"><strong>Total: ${money(invoice.total)}</strong></p>
  ${paymentsHtml}
  <p style="margin:8px 0;text-align:right;font-size:17px"><strong>Balance due: ${money(balance)}</strong></p>
  ${invoice.notes ? `<p style="margin:16px 0 2px"><strong>Notes:</strong> ${esc(invoice.notes)}</p>` : ""}
  <p style="margin:20px 0 2px">Thank you!</p>
  <p style="margin:2px 0;color:#6b7280;font-size:13px">Questions about this invoice? Just reply to this email.</p>
</div>`;

    const subject =
      balance > 0
        ? `Invoice #${invoice.invoice_number} from ${companyName} — balance due ${money(balance)}`
        : `Invoice #${invoice.invoice_number} from ${companyName} — paid in full`;

    const result = await tryEmail({ to: to.trim(), subject, text, html, fromName: companyName });

    return NextResponse.json({
      ok: true,
      emailed: result.ok,
      emailDebug: result.ok ? undefined : `${result.reason}: ${result.detail || "no detail"}`,
    });
  } catch (e) {
    console.error("invoice send error", e);
    return NextResponse.json({ error: "Could not send the invoice." }, { status: 500 });
  }
}
