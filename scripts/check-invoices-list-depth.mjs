import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Invoices list depth (D-WT-34) invariants:
// * The list page already loaded every field this build uses
//   (invoice_number, client_name, issue_date, due_date, status, total,
//   amount_paid — migration 061) and already showed an Outstanding
//   total + overdue count. The depth build is expansion-only: search,
//   a status filter, a per-filter summary, AR aging buckets, a
//   days-overdue figure and a CSV export, all derived on the client
//   from those stored fields. No query, form, insert, wording or
//   total that existed before is changed.
// * Money honesty: every figure is a stored amount or the page's own
//   balance derivation (total - amount_paid, floored at 0). Nothing
//   invents a late fee, interest, tax or terms representation.
// * Aging buckets cover issued invoices with a balance only, use the
//   company-timezone today and the stored due_date, and their
//   balances sum to the page's pre-existing Outstanding figure.
// * No reminder or recurring-invoice plumbing is added: those are
//   new sending/scheduling systems (no columns or tables exist in
//   061) and stay decision items. No writes of any kind are added.

const PAGE = "app/app/[companyId]/invoices/page.js";

test("existing load, create form and header figures are unchanged", () => {
  const page = read(PAGE);
  for (const needle of [
    '.select("id, invoice_number, location_id, client_name, issue_date, due_date, status, total, amount_paid")',
    '.eq("company_id", company.id)',
    '.order("created_at", { ascending: false })',
    "Create draft invoice",
    "Outstanding: {money(outstanding)}",
    "const outstanding = open.reduce((s, i) => s + Math.max(0, (Number(i.total) || 0) - (Number(i.amount_paid) || 0)), 0);",
    "const overdue = open.filter((i) => i.due_date && i.due_date < chicagoToday(company?.timezone)).length;",
    "No invoices yet. Create the first draft above.",
    "Invoices are a financial record — owners and managers only.",
  ]) {
    assert.ok(page.includes(needle), `invoices page keeps: ${needle}`);
  }
});

test("search and status filter act on stored fields only, list order untouched", () => {
  const page = read(PAGE);
  for (const needle of [
    "Search invoices",
    'placeholder="Client name or invoice number"',
    "String(inv.invoice_number ?? \"\").includes(q)",
    "(inv.client_name || \"\").toLowerCase().includes(q)",
    '<option value="all">All statuses</option>',
    '<option value="overdue">Overdue</option>',
    '<option value="partial">Partially paid</option>',
    "Showing {visible.length} of {invoices.length} invoices.",
    "No invoices match your search or status.",
    "{visible.map((inv) => {",
  ]) {
    assert.ok(page.includes(needle), `list depth adds: ${needle}`);
  }
  // Overdue / partially-paid are derived views over stored fields,
  // never new statuses written anywhere.
  assert.ok(page.includes('inv.status === "issued" && inv.due_date && inv.due_date < today'), "overdue view derives from stored due_date");
  assert.ok(page.includes('(Number(inv.amount_paid) || 0) > 0 && balanceOf(inv) > 0'), "partial view derives from stored amount_paid and balance");
});

test("summary and aging derive from stored amounts on the page's own basis", () => {
  const page = read(PAGE);
  for (const needle of [
    "Invoice summary",
    "Aging of open balances",
    '"Current (not yet due)"',
    '"1–30 days overdue"',
    '"31–60 days overdue"',
    '"61–90 days overdue"',
    '"90+ days overdue"',
    "function daysPastDue(dueDate, today)",
    "daysPastDue(inv.due_date, today)",
    "no due date",
  ]) {
    assert.ok(page.includes(needle), `aging/summary adds: ${needle}`);
  }
  // Aging iterates the same `open` (issued) set as the header figure.
  assert.ok(page.includes("for (const inv of open) {"), "aging iterates the issued set behind Outstanding");
  assert.ok(page.includes("if (bal <= 0) continue;"), "aging counts open balances only");
});

test("CSV export carries stored fields only, with formula-injection-safe cells", () => {
  const page = read(PAGE);
  for (const needle of [
    "Download CSV of the invoices shown",
    '"Invoice number", "Client", "Status", "Issue date", "Due date", "Total", "Amount paid", "Balance"',
    "function csvCell(value)",
    '"workteams-invoices.csv"',
    '"Totals for the invoices shown"',
  ]) {
    assert.ok(page.includes(needle), `csv export adds: ${needle}`);
  }
});

test("no writes, no reminder/recurring plumbing, no protected areas", () => {
  const page = read(PAGE);
  const start = page.indexOf("const today = chicagoToday");
  assert.ok(start > 0, "depth block exists");
  const added = page.slice(start, page.indexOf("  return (\n    <div>", start));
  for (const banned of [".insert(", ".update(", ".delete(", ".upsert(", "fetch("]) {
    assert.ok(!added.includes(banned), `depth block performs no writes or sends (${banned})`);
  }
  for (const banned of ["reminder", "recurring", "late fee", "late_fee", "interest", "time_entries", "shift_videos", "comm_book"]) {
    assert.ok(!page.toLowerCase().includes(banned), `page does not introduce ${banned}`);
  }
});
