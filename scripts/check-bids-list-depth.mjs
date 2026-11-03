import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bidAgeDays,
  bidHasNoLineItems,
  bidItemStats,
  bidPriceBasis,
  bidValidity,
  bidValidityDaysLeft,
  countBidsByStatus,
  searchBids,
  sentBidsAwaitingDecision,
  sortBids,
  sumBidValues,
  summarizeBidPipeline,
} from "../lib/bid-list.mjs";
const read = (p) => readFileSync(p, "utf8");

// Bids list depth (D-WT-25) invariants:
// * $0.00 VERDICT, pinned so the money path cannot drift: there is
//   no stored total on bids (003 + 004 + 007 + 008 + 026 are the
//   whole schema story). A bid's total is derived — line items sum
//   quantity*unit_price, hourly is hours*hourly_rate, sqft is
//   square_footage*rate_per_sqft — in the list page, the detail
//   page, and the public proposal route alike. A new line-item bid
//   has no items yet, so $0.00 is the CORRECT total for an empty
//   draft; storage is sound and this build changes no computation
//   and no write. What it adds is honesty around that fact (the
//   empty state is labelled at creation and on the card) plus a
//   pipeline view derived from the rows the page already loads.
// * The create insert payload, both load selects, the status
//   filter set, and every pre-existing wording/behaviour are pinned
//   below. The depth build adds NO query, NO write, NO send: the
//   page keeps exactly its pre-existing 2 inserts (bid + rate
//   area), 1 update (rate area), 1 delete (rate area), 0 fetch.
// * The bid DETAIL page (D-WT-26, locked-after-send) is out of
//   scope: it must not import this lib or change in this build.
// * Pipeline values are summed split by price basis — per-visit
//   totals are never silently added to one-time totals.

const PAGE = "app/app/[companyId]/bids/page.js";
const DETAIL = "app/app/[companyId]/bids/[id]/page.js";
const TODAY = "2026-11-03";

test("existing load selects, create payload, filters and wording are unchanged", () => {
  const page = read(PAGE);
  for (const needle of [
    '.select("id, client_name, title, status, valid_until, created_at, pricing_mode, hours, hourly_rate, square_footage, rate_per_sqft, frequency, job_type, locations(name)")',
    '.from("bid_items").select("bid_id, quantity, unit_price")',
    '.eq("company_id", company.id)',
    '.order("created_at", { ascending: false })',
    'status: "draft"',
    'pricing_mode: pm',
    'canUseWithRole(company?.effectiveTier || company?.tier, "bidding", member?.role)',
    '["all", "draft", "sent", "accepted", "declined"]',
    "No bids yet.",
    "Create draft bid",
    "New bid",
    "💲 Rate areas",
    "Add rate area",
    // cardPriceLabel basis presentation, byte-identical:
    "return `${total} total (one-time)`;",
    "return `${total} per visit`;",
    "/mo`;",
  ]) {
    assert.ok(page.includes(needle), `bids page keeps: ${needle}`);
  }
  // The create insert carries exactly the fields it always has —
  // no total, no new column, nothing removed.
  const insertStart = page.indexOf('.from("bids").insert({');
  assert.ok(insertStart > -1, "bids insert present");
  const insertBlock = page.slice(insertStart, page.indexOf("});", insertStart));
  for (const key of [
    "company_id: company.id",
    "client_name: form.client_name.trim()",
    "client_email: form.client_email.trim() || null",
    "title: form.title.trim()",
    "description: form.description.trim() || null",
    "location_id: form.location_id || null",
    "valid_until: form.valid_until || null",
    'status: "draft"',
    "pricing_mode: pm",
    'hours: pm === "hourly" ? parseFloat(form.hours) || null : null',
    'hourly_rate: pm === "hourly" ? parseFloat(form.hourly_rate) || null : null',
    'square_footage: pm === "sqft" ? parseFloat(form.square_footage) || null : null',
    'rate_per_sqft: pm === "sqft" ? parseFloat(form.rate_per_sqft) || null : null',
    "frequency: form.frequency || null",
    'job_type: form.job_type || "commercial"',
  ]) {
    assert.ok(insertBlock.includes(key), `create payload keeps: ${key}`);
  }
  assert.ok(!insertBlock.includes("total"), "create payload still stores no total (totals are derived)");
});

test("no writes, sends, or queries added; protected areas absent; detail page untouched by this build", () => {
  const page = read(PAGE);
  assert.equal(page.split(".insert(").length - 1, 2, "only the pre-existing bid + rate-area inserts remain");
  assert.equal(page.split(".update(").length - 1, 1, "only the pre-existing rate-area update remains");
  assert.equal(page.split(".delete(").length - 1, 1, "only the pre-existing rate-area delete remains");
  assert.equal(page.split("fetch(").length - 1, 0, "the page still performs no fetch");
  assert.equal(
    page.split('.from("bids")').length - 1 + (page.split('.from("bid_items")').length - 1),
    3,
    "bids read + bids insert + bid_items batch read — no new table reads"
  );
  for (const banned of ["time_entries", "shift_videos", "comm_book", "sent_at"]) {
    assert.ok(!page.includes(banned), `page does not introduce ${banned}`);
  }
  const lib = read("lib/bid-list.mjs");
  for (const banned of ["insert", "update(", "delete", "fetch", "supabase"]) {
    assert.ok(!lib.includes(banned), `helper lib performs no ${banned}`);
  }
  const detail = read(DETAIL);
  assert.ok(!detail.includes("bid-list"), "bid detail page (D-WT-26) does not import the list lib");
});

test("item stats separate 'no items yet' from a genuine $0.00", () => {
  const stats = bidItemStats([
    { bid_id: "a", quantity: 2, unit_price: 50 },
    { bid_id: "a", quantity: 1, unit_price: 25 },
    { bid_id: "b", quantity: 3, unit_price: 0 },
  ]);
  assert.deepEqual(stats.a, { count: 2, total: 125 });
  assert.deepEqual(stats.b, { count: 1, total: 0 });
  assert.equal(stats.c, undefined);
  // Empty draft: line-item mode, zero items.
  assert.equal(bidHasNoLineItems({ pricing_mode: "line_items", item_count: 0 }), true);
  assert.equal(bidHasNoLineItems({ pricing_mode: null, item_count: 0 }), true);
  // Items priced at zero are NOT "no items" — the total is really $0.00.
  assert.equal(bidHasNoLineItems({ pricing_mode: "line_items", item_count: 1 }), false);
  // Hourly/sqft carry price on the bid row — never "no line items".
  assert.equal(bidHasNoLineItems({ pricing_mode: "hourly", item_count: null }), false);
  assert.equal(bidHasNoLineItems({ pricing_mode: "sqft", item_count: 0 }), false);
});

test("pipeline summary counts every bid once and splits value by price basis", () => {
  const bids = [
    { status: "draft", frequency: "weekly", total: 100 },
    { status: "sent", frequency: "one-time", total: 500 },
    { status: "sent", frequency: null, total: 200 },
    { status: "accepted", frequency: "monthly", total: 300 },
    { status: "declined", frequency: "weekly", total: 999 },
  ];
  assert.deepEqual(countBidsByStatus(bids), { draft: 1, sent: 2, accepted: 1, declined: 1, all: 5 });
  assert.equal(bidPriceBasis({ frequency: null }), "one_time");
  assert.equal(bidPriceBasis({ frequency: "one-time" }), "one_time");
  assert.equal(bidPriceBasis({ frequency: "weekly" }), "per_visit");
  const pipe = summarizeBidPipeline(bids);
  // Open = draft + sent: per-visit $100 (weekly), one-time $500 + $200.
  assert.equal(pipe.open.count, 3);
  assert.equal(pipe.open.perVisit, 100);
  assert.equal(pipe.open.oneTime, 700);
  assert.ok(Math.abs(pipe.open.monthlyEstimate - 433) < 0.001, "weekly $100 -> ~$433/mo estimate");
  // Accepted: monthly $300 per visit -> $300/mo estimate.
  assert.equal(pipe.accepted.perVisit, 300);
  assert.equal(pipe.accepted.oneTime, 0);
  assert.ok(Math.abs(pipe.accepted.monthlyEstimate - 300) < 0.001);
  // Unknown frequency: counts as per-visit, no monthly estimate invented.
  const odd = sumBidValues([{ frequency: "daily-ish", total: 40 }]);
  assert.equal(odd.perVisit, 40);
  assert.equal(odd.monthlyEstimate, 0);
});

test("validity and age derive from stored dates vs company today", () => {
  assert.equal(bidValidity({ valid_until: "2026-11-02" }, TODAY), "passed");
  assert.equal(bidValidity({ valid_until: TODAY }, TODAY), "today");
  assert.equal(bidValidity({ valid_until: "2026-11-10" }, TODAY), "soon");
  assert.equal(bidValidity({ valid_until: "2026-11-11" }, TODAY), "ok");
  assert.equal(bidValidity({ valid_until: null }, TODAY), "none");
  assert.equal(bidValidityDaysLeft({ valid_until: "2026-11-10" }, TODAY), 7);
  assert.equal(bidValidityDaysLeft({ valid_until: "2026-11-02" }, TODAY), -1);
  assert.equal(bidAgeDays({ created_at: "2026-10-24T15:04:00Z" }, TODAY), 10);
  assert.equal(bidAgeDays({ created_at: "2026-11-03T01:00:00Z" }, TODAY), 0);
  assert.equal(bidAgeDays({ created_at: null }, TODAY), null);
});

test("follow-up list is sent-only, oldest first, and does not mutate the loaded rows", () => {
  const rows = [
    { title: "new", status: "sent", created_at: "2026-11-01T00:00:00Z" },
    { title: "draft", status: "draft", created_at: "2026-09-01T00:00:00Z" },
    { title: "old", status: "sent", created_at: "2026-10-01T00:00:00Z" },
    { title: "won", status: "accepted", created_at: "2026-08-01T00:00:00Z" },
  ];
  assert.deepEqual(sentBidsAwaitingDecision(rows).map((b) => b.title), ["old", "new"]);
  assert.deepEqual(rows.map((b) => b.title), ["new", "draft", "old", "won"]);
});

test("search matches stored card text only; sort defaults to the loaded order and is stable", () => {
  const rows = [
    { title: "Office clean", client_name: "Acme", locations: { name: "HQ" }, status: "draft", total: 100, valid_until: null, created_at: "2026-11-02" },
    { title: "Deep clean", client_name: "Beta LLC", locations: null, status: "sent", total: 900, valid_until: "2026-11-20", created_at: "2026-11-01" },
    { title: "Lobby", client_name: "Acme", locations: null, status: "sent", total: 50, valid_until: "2026-11-05", created_at: "2026-10-30" },
  ];
  const labels = { draft: "Draft", sent: "Sent" };
  assert.equal(searchBids(rows, "", labels).length, 3);
  assert.equal(searchBids(rows, "acme", labels).length, 2);
  assert.equal(searchBids(rows, "hq", labels).length, 1);
  assert.equal(searchBids(rows, "deep", labels).length, 1);
  assert.equal(searchBids(rows, "zzz", labels).length, 0);
  assert.deepEqual(sortBids(rows, "newest").map((r) => r.title), ["Office clean", "Deep clean", "Lobby"]);
  assert.deepEqual(sortBids(rows, "oldest").map((r) => r.title), ["Lobby", "Deep clean", "Office clean"]);
  assert.deepEqual(sortBids(rows, "amount_desc").map((r) => r.title), ["Deep clean", "Office clean", "Lobby"]);
  assert.deepEqual(sortBids(rows, "amount_asc").map((r) => r.title), ["Lobby", "Office clean", "Deep clean"]);
  assert.deepEqual(sortBids(rows, "valid_until").map((r) => r.title), ["Lobby", "Deep clean", "Office clean"]);
  assert.deepEqual(rows.map((r) => r.title), ["Office clean", "Deep clean", "Lobby"]);
});

test("page wires the glance panel, follow-up panel, search, sort, and honest empty states", () => {
  const page = read(PAGE);
  for (const needle of [
    'import { chicagoToday } from "../../../../lib/dates";',
    "const today = chicagoToday(company?.timezone);",
    "const stats = bidItemStats(items || []);",
    "Bids at a glance",
    "Open pipeline (draft + sent)",
    "Needs follow-up",
    "Sent — awaiting the client's decision",
    "Bids don't record the day they were sent, so age is counted from the day each bid was created.",
    "Valid-until date has passed",
    "no line items yet",
    'placeholder="Search title, client, or location"',
    '<option value="newest">Newest first</option>',
    '<option value="oldest">Oldest first</option>',
    '<option value="amount_desc">Amount (highest first)</option>',
    '<option value="amount_asc">Amount (lowest first)</option>',
    '<option value="valid_until">Valid until (soonest first)</option>',
    "Showing {visible.length} of {bids.length} bids.",
    "No bids match your search.",
    "Line items and their prices are added on the bid's own page, right after this draft is created — until the first item is added, the bid's total is $0.00.",
    "No line items yet — add them on the bid page. The total stays $0.00 until the first item is added.",
    "No line items — this bid's total is $0.00.",
    "Valid-until date has passed — a client opening the approval link sees this proposal as expired.",
    "Awaiting the client's decision — created",
  ]) {
    assert.ok(page.includes(needle), `list depth adds: ${needle}`);
  }
  assert.ok(page.includes("No {STATUS_LABELS[filter]} bids."), "filter-aware empty state present");
});
