import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { checkRateLimit, clientIp } from "../../../../../lib/rate-limit";
import { requireManager } from "../../../../../lib/integrations/server-auth";
import {
  QBO_PROVIDER,
  getAccessToken,
  qboQuery,
  qboRequest,
  qboEscape,
  logSync,
  isMissingIntegrationSchema,
} from "../../../../../lib/integrations/quickbooks-server";

// POST { companyId, invoiceId } -> { ok, providerId, docNumber }
// Sends ONE WorkTeams customer invoice to the company's QuickBooks,
// once (handoff 15.5/15.7):
// * Only issued/paid invoices can be sent; drafts and voids are refused.
// * The invoice's QuickBooks income account (and tax code, when the
//   invoice carries tax) must be mapped first. Unmapped = the invoice
//   waits in the queue (integration_sync_items 'queued_unmapped') with a
//   plain reason. It is NEVER posted to a generic account.
// * Idempotent end to end: the sync item's idempotency_key is sent as
//   the QuickBooks create requestid, and a 'posted' item short-circuits
//   before any QuickBooks call. Retries, double-taps, and lost
//   responses can never create a duplicate in QuickBooks.
// * Posting records the link/status in integration_sync_items ONLY.
//   The WorkTeams invoice, its line items, and its payment ledger are
//   never edited by posting.

const SERVICE_ITEM_NAME = "WorkTeams Services";

async function upsertSyncItem(db, fields, patch) {
  const { data, error } = await db
    .from("integration_sync_items")
    .upsert({ ...fields, ...patch }, { onConflict: "company_id,provider,source_table,source_id,operation" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function findOrCreateCustomer(ctx, clientName, requestKey) {
  const found = await qboQuery(
    ctx.connection,
    ctx.accessToken,
    `select * from Customer where DisplayName = '${qboEscape(clientName)}'`
  );
  const existing = (found.Customer || [])[0];
  if (existing) return String(existing.Id);
  const created = await qboRequest(ctx.connection, ctx.accessToken, "customer", {
    method: "POST",
    body: { DisplayName: clientName },
    requestId: requestKey,
  });
  return String(created?.Customer?.Id || "");
}

async function findOrCreateServiceItem(ctx, incomeAccountId, requestKey) {
  const found = await qboQuery(
    ctx.connection,
    ctx.accessToken,
    `select * from Item where Name = '${qboEscape(SERVICE_ITEM_NAME)}'`
  );
  const existing = (found.Item || [])[0];
  if (existing) {
    // Keep the item pointed at the company's CURRENT mapped income
    // account -- a mapping change must never silently post to the
    // account the item was first created with.
    if (String(existing.IncomeAccountRef?.value || "") !== String(incomeAccountId)) {
      await qboRequest(ctx.connection, ctx.accessToken, "item", {
        method: "POST",
        body: {
          Id: existing.Id,
          SyncToken: existing.SyncToken,
          sparse: true,
          IncomeAccountRef: { value: String(incomeAccountId) },
        },
        requestId: `${requestKey}-itemfix`,
      });
    }
    return String(existing.Id);
  }
  const created = await qboRequest(ctx.connection, ctx.accessToken, "item", {
    method: "POST",
    body: {
      Name: SERVICE_ITEM_NAME,
      Type: "Service",
      IncomeAccountRef: { value: String(incomeAccountId) },
    },
    requestId: requestKey,
  });
  return String(created?.Item?.Id || "");
}

export async function POST(req) {
  try {
    const rl = checkRateLimit(`qbo-post-invoice:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const { companyId, invoiceId } = await req.json().catch(() => ({}));
    if (!invoiceId) return NextResponse.json({ error: "Missing invoice" }, { status: 400 });
    const auth = await requireManager(req, companyId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const db = auth.db;

    // ---- Load the invoice (read-only: posting never edits it) ----
    const { data: invoice, error: invErr } = await db
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (invErr) {
      if (isMissingIntegrationSchema(invErr)) {
        return NextResponse.json({ error: "Invoicing setup is pending.", code: "setup_pending" }, { status: 503 });
      }
      throw invErr;
    }
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoice.status === "draft") {
      return NextResponse.json({ error: "Only an issued invoice can be sent to QuickBooks. Issue it first." }, { status: 422 });
    }
    if (invoice.status === "void") {
      return NextResponse.json({ error: "A voided invoice can't be sent to QuickBooks." }, { status: 422 });
    }
    if (!(Number(invoice.total) > 0)) {
      return NextResponse.json({ error: "This invoice totals $0 -- there's nothing to send." }, { status: 422 });
    }
    const clientName = (invoice.client_name || "").trim();
    if (!clientName) {
      return NextResponse.json({ error: "This invoice has no client name. Add one before sending it to QuickBooks." }, { status: 422 });
    }

    // ---- Existing sync item: posted means done, forever ----
    const { data: existingItem, error: itemErr } = await db
      .from("integration_sync_items")
      .select("*")
      .eq("company_id", companyId)
      .eq("provider", QBO_PROVIDER)
      .eq("source_table", "invoices")
      .eq("source_id", invoiceId)
      .eq("operation", "post")
      .maybeSingle();
    if (itemErr) {
      if (isMissingIntegrationSchema(itemErr)) {
        return NextResponse.json(
          { error: "QuickBooks setup is pending -- the database step hasn't been run yet.", code: "setup_pending" },
          { status: 503 }
        );
      }
      throw itemErr;
    }
    if (existingItem?.status === "posted") {
      return NextResponse.json({
        ok: true,
        alreadyPosted: true,
        providerId: existingItem.provider_id,
        docNumber: existingItem.provider_doc_number,
      });
    }
    if (
      existingItem?.status === "posting" &&
      existingItem.last_attempt_at &&
      Date.now() - new Date(existingItem.last_attempt_at).getTime() < 2 * 60_000
    ) {
      return NextResponse.json(
        { error: "This invoice is already being sent. Give it a moment, then check its status." },
        { status: 409 }
      );
    }

    // ---- Mapping gate: unmapped never posts ----
    const { data: mappings } = await db
      .from("integration_account_mappings")
      .select("*")
      .eq("company_id", companyId)
      .eq("provider", QBO_PROVIDER);
    const byCategory = {};
    for (const m of mappings || []) byCategory[m.app_category] = m;
    const incomeMap = byCategory.invoice_income;
    const taxMap = byCategory.invoice_tax;
    const hasTax = Number(invoice.tax_amount) > 0;
    const unmappedReason = !incomeMap
      ? "Waiting: map your customer invoice income account on the QuickBooks page before this invoice can be sent."
      : hasTax && !taxMap
        ? "Waiting: this invoice has sales tax. Map your sales tax code on the QuickBooks page before it can be sent."
        : "";

    const baseItem = {
      company_id: companyId,
      provider: QBO_PROVIDER,
      source_table: "invoices",
      source_id: invoiceId,
      operation: "post",
      idempotency_key: existingItem?.idempotency_key || crypto.randomUUID(),
      created_by: existingItem?.created_by || auth.user.id,
    };

    if (unmappedReason) {
      const item = await upsertSyncItem(db, baseItem, {
        status: "queued_unmapped",
        detail: unmappedReason,
        attempt_count: (existingItem?.attempt_count || 0) + 1,
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await logSync(db, {
        companyId,
        direction: "out",
        event: "invoice_queued_unmapped",
        summary: `Invoice #${invoice.invoice_number} held in the queue: ${unmappedReason}`,
        syncItemId: item.id,
        userId: auth.user.id,
      });
      return NextResponse.json({ error: unmappedReason, queued: true }, { status: 422 });
    }

    // ---- Claim the attempt under the SAME idempotency key ----
    const item = await upsertSyncItem(db, baseItem, {
      status: "posting",
      detail: "",
      attempt_count: (existingItem?.attempt_count || 0) + 1,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    let ctx;
    try {
      ctx = await getAccessToken(db, companyId);
    } catch (e) {
      await db
        .from("integration_sync_items")
        .update({ status: "failed", detail: e.message, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      return NextResponse.json({ error: e.message }, { status: 409 });
    }

    try {
      const customerId = await findOrCreateCustomer(ctx, clientName, `${item.idempotency_key}-customer`);
      if (!customerId) throw new Error("QuickBooks did not return a customer for this invoice");
      const itemId = await findOrCreateServiceItem(ctx, incomeMap.provider_ref_id, `${item.idempotency_key}-item`);
      if (!itemId) throw new Error("QuickBooks did not return a service item for this invoice");

      const { data: lineRows } = await db
        .from("invoice_line_items")
        .select("*")
        .eq("company_id", companyId)
        .eq("invoice_id", invoiceId)
        .order("sort_order")
        .order("created_at");
      const sourceLines =
        lineRows && lineRows.length > 0
          ? lineRows
          : [
              {
                description: `WorkTeams invoice #${invoice.invoice_number}`,
                quantity: 1,
                unit_price: Number(invoice.subtotal) || Number(invoice.total) || 0,
                amount: Number(invoice.subtotal) || Number(invoice.total) || 0,
              },
            ];
      const lines = sourceLines.map((l) => {
        const detail = {
          ItemRef: { value: itemId },
          Qty: Number(l.quantity) || 1,
          UnitPrice: Number(l.unit_price) || 0,
        };
        if (hasTax) detail.TaxCodeRef = { value: String(taxMap.provider_ref_id) };
        return {
          DetailType: "SalesItemLineDetail",
          Amount: Number(l.amount) || 0,
          Description: String(l.description || "").slice(0, 4000),
          SalesItemLineDetail: detail,
        };
      });

      const payload = {
        CustomerRef: { value: customerId },
        TxnDate: invoice.issue_date || undefined,
        DueDate: invoice.due_date || undefined,
        PrivateNote: `WorkTeams invoice #${invoice.invoice_number}`,
        Line: lines,
      };
      if (hasTax) payload.TxnTaxDetail = { TotalTax: Number(invoice.tax_amount) };

      const created = await qboRequest(ctx.connection, ctx.accessToken, "invoice", {
        method: "POST",
        body: payload,
        requestId: item.idempotency_key,
      });
      const providerId = String(created?.Invoice?.Id || "");
      const docNumber = created?.Invoice?.DocNumber || "";
      if (!providerId) throw new Error("QuickBooks did not confirm the invoice was created");

      await db
        .from("integration_sync_items")
        .update({
          status: "posted",
          provider_id: providerId,
          provider_doc_number: docNumber,
          detail: "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      await db
        .from("integration_connections")
        .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("provider", QBO_PROVIDER);
      await logSync(db, {
        companyId,
        direction: "out",
        event: "invoice_posted",
        summary: `Invoice #${invoice.invoice_number} (${clientName}, $${Number(invoice.total).toFixed(2)}) posted to QuickBooks as invoice ${docNumber || providerId}.`,
        syncItemId: item.id,
        userId: auth.user.id,
      });
      return NextResponse.json({ ok: true, providerId, docNumber });
    } catch (e) {
      const message = e.message || "QuickBooks refused the invoice";
      await db
        .from("integration_sync_items")
        .update({ status: "failed", detail: message.slice(0, 1000), updated_at: new Date().toISOString() })
        .eq("id", item.id);
      await logSync(db, {
        companyId,
        direction: "out",
        event: "invoice_post_failed",
        summary: `Invoice #${invoice.invoice_number} did not post: ${message}`,
        syncItemId: item.id,
        userId: auth.user.id,
      });
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (e) {
    console.error("qbo post-invoice error", e.message);
    return NextResponse.json({ error: "Could not send the invoice to QuickBooks" }, { status: 500 });
  }
}
