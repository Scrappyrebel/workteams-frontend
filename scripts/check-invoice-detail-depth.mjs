import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Invoice detail depth (D-WT-35) invariants:
// * Catalog verdict was P (professional) and the verification on main
//   confirmed it for everything the page renders: manager gate, draft
//   editing, totals from stored fields, payment recording capped at
//   the balance, void-with-reason for payments and for the invoice,
//   email + print delivery. None of that changes here.
// * The gaps were stored-but-never-shown facts (migration 061): once
//   an invoice left draft, its notes and its site (location_id) were
//   invisible on this page — even though the print page renders both —
//   and the record timestamps (invoices.created_at / issued_at,
//   invoice_payments.created_at / voided_at) were never displayed.
//   The invoices list also marks issued invoices overdue; the detail
//   page did not.
// * The depth build is expansion-only and display-only: it adds an
//   "Invoice record" panel fed by the already-loaded invoice row and
//   the already-loaded locations list, an overdue marker using the
//   list page's own derivation, and recorded/voided timestamps on the
//   payment cards. No new query, no write, no amount is recomputed,
//   and no existing wording, layout order or total changes.
// * Money stays exactly as stored: totals render the stored
//   subtotal / tax_amount / total / amount_paid, the balance stays
//   total - amount_paid floored at 0, and legal-flavoured text is
//   untouched (no new terms, tax or payment wording is introduced).

const PAGE = "app/app/[companyId]/invoices/[id]/page.js";

test("existing money behaviour is unchanged", () => {
  const page = read(PAGE);
  for (const needle of [
    "const balance = invoice ? Math.max(0, (Number(invoice.total) || 0) - (Number(invoice.amount_paid) || 0)) : 0;",
    "Subtotal: <strong>{money(invoice.subtotal)}</strong>",
    "Tax ({Number(invoice.tax_rate) || 0}%): <strong>{money(invoice.tax_amount)}</strong>",
    "Total: <strong>{money(invoice.total)}</strong>",
    "Paid: <strong>{money(invoice.amount_paid)}</strong>",
    "if (amount > balance) {",
    "reason.length < 10 || reason.length > 500",
    'member.role === "owner" || member.role === "admin"',
    "Invoices are a financial record — owners and managers only.",
    "Payments are never edited or deleted. A mistake is fixed by voiding the payment",
    "Issuing locks the details and totals. After that, payments can be recorded, and",
  ]) {
    assert.ok(page.includes(needle), `invoice detail keeps: ${needle}`);
  }
});

test("record panel surfaces stored site, notes and timestamps for non-drafts", () => {
  const page = read(PAGE);
  for (const needle of [
    "showRecordPanel",
    "Invoice record",
    "locations.find((l) => l.id === invoice.location_id)",
    "Site: <strong>{siteLocation.name}</strong>",
    "Created {String(invoice.created_at).slice(0, 10)}",
    "Issued at {new Date(invoice.issued_at).toLocaleString()}",
    "{invoice.notes}",
    'whiteSpace: "pre-wrap"',
  ]) {
    assert.ok(page.includes(needle), `record panel shows: ${needle}`);
  }
  // Site and notes rows are non-draft only: drafts already show both
  // inside their edit form, and the panel must not duplicate them.
  assert.ok(
    page.includes("!isDraft && invoice.notes"),
    "notes row is gated to non-draft invoices",
  );
  assert.ok(
    page.includes("!isDraft && invoice.location_id"),
    "site resolution is gated to non-draft invoices",
  );
});

test("overdue marker reuses the invoices list derivation and wording", () => {
  const page = read(PAGE);
  assert.ok(page.includes('invoice.status === "issued"'), "overdue applies to issued invoices");
  assert.ok(
    page.includes("invoice.due_date < chicagoToday(company?.timezone)"),
    "overdue compares the stored due_date with today in the company timezone",
  );
  assert.ok(page.includes(" • Overdue</span>"), "overdue marker renders in the header line");
});

test("payment cards show the recorded date and the void timestamp", () => {
  const page = read(PAGE);
  assert.ok(
    page.includes("Recorded {String(p.created_at).slice(0, 10)}"),
    "payment card shows when the payment was recorded",
  );
  assert.ok(
    page.includes('Void reason: {p.void_reason || "—"} • Voided {new Date(p.voided_at).toLocaleString()}'),
    "voided payment shows its reason and its void timestamp",
  );
  assert.ok(
    page.includes("Total paid: {money(activePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0))}"),
    "total paid still sums active payments only",
  );
});

test("the depth additions perform no writes and read no protected area", () => {
  const page = read(PAGE);
  const start = page.indexOf("const isOverdue =");
  const end = page.indexOf("const showRecordPanel");
  assert.ok(start > 0 && end > start, "depth derivation block exists");
  const block = page.slice(start, page.indexOf(");", end) + 2);
  for (const banned of [".insert(", ".update(", ".delete(", ".upsert(", "time_entries", "shift_videos", "comm_book"]) {
    assert.ok(!block.includes(banned), `depth block does not touch ${banned}`);
  }
  // The page still performs exactly the writes it always did:
  // header save, line-item add/remove, issue, delete-draft, record
  // payment, void payment, void invoice — no new write path appears.
  assert.equal(
    (page.match(/\.from\("invoice_payments"\)\s*\.insert/g) || []).length,
    1,
    "exactly one payment insert path (the original record-payment form)",
  );
  assert.equal(
    (page.match(/\.from\("invoices"\)\s*\.delete/g) || []).length,
    1,
    "exactly one invoice delete path (the original delete-draft)",
  );
});
