import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Locations depth (D-WT-18) invariants:
// * The Locations page was a static site record: name/address/one
//   contact/notes (+ geofence, rate area). Everything the business
//   does AT a site is stored keyed by location_id — shifts, work
//   orders, inspections, bids, invoices (locations double as the
//   invoicing clients, 061) — but none of it was visible from the
//   site record itself.
// * The depth build is expansion-only: the add/edit form, its fields
//   and semantics, the save path, the private-notes posture
//   (location_private, managers only), invoicing behavior and the
//   client relationship are all unchanged. It adds a display-only
//   search over the stored card fields and a per-site activity panel
//   fed by fail-soft, company-scoped reads of existing tables.
// * Money and bids are manager-only material (their own RLS is
//   owner/admin): the page must not even query them unless the
//   viewer can manage. Invoice figures use the invoicing basis —
//   issued/paid only, totals from the stored total / amount_paid.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book table is read by this page.

const PAGE = "app/app/[companyId]/locations/page.js";

test("existing form, save path and private posture are unchanged", () => {
  const page = read(PAGE);
  for (const needle of [
    'const emptyForm = { name: "", address: "", client_name: "", client_phone: "", notes: "", lat: "", lng: "", geofence_radius_m: 100, rate_area_id: "" }',
    '.from("location_private")',
    'onConflict: "location_id"',
    "validateLocationGeofence(form.address, form.lat, form.lng)",
    "Find coordinates from address",
    "Geofence verification",
  ]) {
    assert.ok(page.includes(needle), `locations page keeps: ${needle}`);
  }
});

test("site activity reads are company-scoped, location-keyed and fail-soft", () => {
  const page = read(PAGE);
  const start = page.indexOf("async function loadActivity");
  const end = page.indexOf("function startEdit");
  assert.ok(start > 0 && end > start, "loadActivity block exists");
  const block = page.slice(start, end);
  for (const table of ['from("shifts")', 'from("work_orders")', 'from("inspections")', 'from("bids")', 'from("invoices")', 'from("team_directory")']) {
    assert.ok(block.includes(table), `activity reads ${table}`);
  }
  // Every activity query is scoped to this company and this location.
  assert.ok((block.match(/\.eq\("company_id", company\.id\)/g) || []).length >= 5, "all activity reads are company-scoped");
  assert.ok((block.match(/\.eq\("location_id", locId\)/g) || []).length >= 5, "all activity reads are location-keyed");
  // Fail-soft: sections render only when their read returned data.
  for (const needle of ["activityByLoc[l.id]?.shifts", "activityByLoc[l.id]?.workOrders", "activityByLoc[l.id]?.inspections", "activityByLoc[l.id]?.bidCounts", "activityByLoc[l.id]?.invoices"]) {
    assert.ok(page.includes(needle), `section is fail-soft: ${needle}`);
  }
  // The activity block performs no writes of any kind.
  for (const banned of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert.ok(!block.includes(banned), `activity block performs no writes (${banned})`);
  }
  // Protected areas are never read by this page.
  for (const banned of ["time_entries", "shift_videos", "comm_book", "shift-videos"]) {
    assert.ok(!block.includes(banned), `activity block does not touch ${banned}`);
  }
});

test("money and bids are queried only for managers, on the invoicing basis", () => {
  const page = read(PAGE);
  const start = page.indexOf("async function loadActivity");
  const block = page.slice(start, page.indexOf("function startEdit"));
  const gate = block.indexOf("if (canManage) {");
  assert.ok(gate > 0, "manager gate exists in loadActivity");
  assert.ok(block.indexOf('from("bids")') > gate, "bids read sits inside the manager gate");
  assert.ok(block.indexOf('from("invoices")') > gate, "invoices read sits inside the manager gate");
  assert.ok(block.includes('.in("status", ["issued", "paid"])'), "invoice figures count issued/paid only");
  assert.ok(block.includes("Number(i.amount_paid)"), "still-owed derives from stored amount_paid");
});

test("search filters displayed cards by stored fields only", () => {
  const page = read(PAGE);
  assert.ok(page.includes("[l.name, l.address, l.client_name]"), "search matches stored card fields");
  assert.ok(page.includes("No locations match your search."), "no-match line exists");
  assert.ok(page.includes("Site activity"), "activity toggle is labelled");
});
