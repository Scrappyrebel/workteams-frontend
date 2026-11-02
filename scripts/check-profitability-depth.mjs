import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Profitability depth (D-WT-33) invariants. The page's original Revenue /
// Cost / Profit figures keep their exact definitions (accepted bids +
// manual entries; labor + manual expenses). Issued invoices are shown
// as a SEPARATE, honestly labeled figure -- an invoice can bill work
// already counted in an accepted bid, so the two are never added. The
// bookkeeper CSV mirrors the screen. Record voids run on an explicit
// in-page confirm panel, never a browser prompt: opening the panel or
// cancelling it writes nothing, and the confirmed write is the same
// void update this page has always made (migration 066 semantics).

const page = read("app/app/[companyId]/profitability/page.js");

test("Invoiced panel reads issued invoices only, cohort by issue_date in the selected range", () => {
  assert.ok(page.includes('.from("invoices")'), "page must read the invoices table");
  assert.ok(page.includes('.in("status", ["issued", "paid"])'), "only issued/paid invoices count (077 definition)");
  assert.ok(page.includes('.gte("issue_date", since)'), "invoice cohort must be bounded by issue_date in the range");
  assert.ok(page.includes("amount_paid"), "paid must come from the ledger-derived amount_paid");
  assert.ok(page.includes("Invoiced revenue — issued invoices in this range"), "panel heading must be present");
});

test("Invoiced figures are never added into the existing Revenue total", () => {
  assert.ok(
    page.includes("const revenue = (bidTotals[l.id] || 0) + (revTotals[l.id] || 0);"),
    "the original per-location revenue definition must be unchanged"
  );
  assert.ok(page.includes("never added to the Revenue total"), "the separation must be stated on screen");
  assert.ok(page.includes("do not add together"), "the separation must be stated in the CSV too");
});

test("Range basis is stated honestly: bids have no acceptance date and count all-time", () => {
  assert.ok(page.includes("Accepted bids record no acceptance date"), "range-basis note must be on the page");
  assert.ok(page.includes('.gte("entry_date", since)'), "manual entries stay range-filtered as before");
});

test("Bookkeeper CSV export mirrors the figures on screen", () => {
  assert.ok(page.includes("Download CSV for your bookkeeper"), "export button must be present");
  assert.ok(page.includes("function exportCsv()"), "export must be built from the rendered rows");
  assert.ok(page.includes('["Company", company.name || ""]'), "CSV must carry the company header line");
  assert.ok(page.includes('["Range", rangeLabel]'), "CSV must carry the range header line");
  assert.ok(page.includes('"All locations"'), "CSV must carry the totals row");
});

test("Void runs on an explicit in-page confirm panel, never a browser prompt", () => {
  assert.ok(!page.includes("window.prompt"), "the page must not use window.prompt anywhere");
  assert.ok(page.includes("function startVoid(entry)"), "Void must open the confirm panel");
  assert.ok(page.includes("async function confirmVoid()"), "the panel must have an explicit confirm action");
  assert.ok(page.includes("onVoid={startVoid}"), "both entry lists must route Void to the panel");
  assert.ok(page.includes("setVoiding(null)"), "cancel/close must clear the panel without writing");
  assert.ok(page.includes("It stays on record with your reason and stops counting in the totals."), "panel must carry the original void wording");
});

test("The confirmed void write is unchanged: same fields, same guard, same reason rule", () => {
  assert.ok(page.includes("async function voidEntry(entry)"), "void writer must keep its name/signature");
  for (const field of ["voided_at: now", "voided_by: member.user_id", "void_reason: trimmed", "updated_at: now", "updated_by: member.user_id"]) {
    assert.ok(page.includes(field), `void update must still write ${field}`);
  }
  assert.ok(page.includes('.is("voided_at", null)'), "void must still guard on voided_at being null");
  assert.ok(page.includes("trimmed.length < 10 || trimmed.length > 500"), "the 10-500 character reason rule must be unchanged");
});
