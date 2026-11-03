import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  walkthroughClientName,
  walkthroughContactName,
  walkthroughPhoneAnswerCount,
  walkthroughStage,
  countWalkthroughStages,
  searchWalkthroughs,
  filterWalkthroughsByStage,
} from "../lib/walkthrough-list.mjs";
const read = (p) => readFileSync(p, "utf8");

// Walkthroughs list depth (D-WT-27) invariants:
// * There is NO lifecycle status on a walkthrough: storage is 005
//   (name, notes, location_id, bid_id, created_at) + 067 (scheduled_at,
//   meet_contact, entry_notes, intake, answers) only. The stage on the
//   list is therefore DERIVED from already-recorded facts (linked bid,
//   recorded areas, appointment, phone answers), its basis is stated
//   on the card, and nothing can set/move/save a stage from here.
// * The client on a card comes only from the already-stored phone
//   intake (intake.business_name / contact_person — the same field
//   the detail page converts into a bid's client_name). Pre-067
//   records have no intake and show no client line; none is guessed
//   from the location or the walkthrough name.
// * Expansion-only: the load selects, both insert payload shapes, the
//   missing-schema fallback, the draft-bid dropdown query, the delete
//   path, and the owner/admin + Pro gates are pinned byte-for-byte
//   below. No query, write, send, or access behaviour is added or
//   changed. Walkthrough photos are not touched: the list page has
//   no photo/storage code before or after.
// * No migration ships with this build: every displayed fact was
//   already stored and already selected by the page.

const PAGE = "app/app/[companyId]/walkthroughs/page.js";
const NOW = Date.parse("2026-11-03T12:00:00Z");
const PAST = "2026-11-01T15:00:00Z";
const FUTURE = "2026-11-10T15:00:00Z";

test("existing load, gates, create payload shapes, fallback and delete are unchanged", () => {
  const page = read(PAGE);
  for (const needle of [
    'const LEGACY_SELECT = "id, name, notes, created_at, location_id, bid_id, locations(name)";',
    '"id, name, notes, created_at, location_id, bid_id, scheduled_at, meet_contact, entry_notes, intake, answers, locations(name)"',
    '.from("walkthroughs")',
    '.eq("company_id", company.id)',
    '.order("created_at", { ascending: false })',
    'const isManager = member && (member.role === "owner" || member.role === "admin");',
    'const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "walkthroughs", member?.role);',
    'if (!allowed || !isManager) {',
    'Room-by-room walkthroughs are a <strong>Pro</strong> feature for owners and managers.',
    'const base = {',
    "company_id: company.id,",
    "name: form.name.trim(),",
    "location_id: form.location_id || null,",
    "bid_id: form.bid_id || null,",
    "notes: form.notes.trim() || null,",
    "scheduled_at: appt.scheduled_at ? new Date(appt.scheduled_at).toISOString() : null,",
    "meet_contact: appt.meet_contact.trim() || null,",
    "entry_notes: appt.entry_notes.trim() || null,",
    "intake: pruneAnswers(intake),",
    ".insert(qReady === false ? base : { ...base, ...questionPayload() })",
    "({ error } = await supabase().from(\"walkthroughs\").insert(base));",
    '.eq("status", "draft")',
    "No linked bid (optional)",
    "{b.title} — {b.client_name}",
    'if (!confirm("Delete this walkthrough and all its areas?")) return;',
    '.from("walkthroughs").delete().eq("id", id)',
    "No walkthroughs yet — start one above, then add rooms as you walk the building.",
    "The phone-question set turns on with the latest WorkTeams update.",
    "{w.locations?.name || \"No location\"} · {w.count} area{w.count === 1 ? \"\" : \"s\"} · {Math.round(w.sqft).toLocaleString()} sq ft",
  ]) {
    assert.ok(page.includes(needle), `walkthroughs page keeps: ${needle}`);
  }
  // Exactly the writes that existed before: the two save() inserts
  // (full payload + pre-067 fallback) and the one delete. No update,
  // no upsert, and no stage/status write of any kind is added.
  assert.equal(page.split(".insert(").length - 1, 2, "only the two pre-existing inserts remain");
  assert.equal(page.split(".delete(").length - 1, 1, "only the pre-existing delete remains");
  for (const banned of [".update(", ".upsert(", "walkthrough_photos", "storage.from", "status:"]) {
    assert.ok(!page.includes(banned), `page does not introduce ${banned}`);
  }
});

test("client identity comes only from the stored phone intake", () => {
  const w = { intake: { business_name: "  Acme Dental  ", contact_person: "Pat Lee" } };
  assert.equal(walkthroughClientName(w), "Acme Dental");
  assert.equal(walkthroughContactName(w), "Pat Lee");
  assert.equal(walkthroughClientName({ intake: { business_name: "   " } }), null);
  assert.equal(walkthroughClientName({ intake: null }), null);
  assert.equal(walkthroughClientName({}), null);
  assert.equal(walkthroughClientName({ intake: "Acme" }), null);
  assert.equal(walkthroughContactName({ locations: { name: "Acme site" }, name: "Acme walkthrough" }), null);
});

test("phone answer count counts only recorded answers", () => {
  assert.equal(walkthroughPhoneAnswerCount({ intake: { a: "x", b: "  ", c: "y" } }), 2);
  assert.equal(walkthroughPhoneAnswerCount({ intake: { a: true, b: false } }), 1);
  assert.equal(walkthroughPhoneAnswerCount({}), 0);
  assert.equal(walkthroughPhoneAnswerCount({ intake: null }), 0);
});

test("derived stage follows the recorded facts, in pipeline order, with its basis", () => {
  const bid = walkthroughStage({ bid_id: "b1", count: 3, scheduled_at: PAST }, NOW);
  assert.equal(bid.key, "bid_linked");
  assert.equal(bid.label, "Bid linked");
  const walked = walkthroughStage({ count: 2, scheduled_at: PAST }, NOW);
  assert.equal(walked.key, "walked");
  assert.ok(walked.basis.includes("2 areas recorded"));
  assert.equal(walkthroughStage({ count: 1 }, NOW).basis.includes("1 area recorded"), true);
  assert.equal(walkthroughStage({ count: 0, scheduled_at: FUTURE }, NOW).key, "scheduled");
  const passed = walkthroughStage({ count: 0, scheduled_at: PAST }, NOW);
  assert.equal(passed.key, "appointment_passed");
  assert.ok(passed.basis.includes("has passed"));
  assert.equal(walkthroughStage({ count: 0, intake: { business_name: "Acme" } }, NOW).key, "phone_intake");
  assert.equal(walkthroughStage({ count: 0 }, NOW).key, "new");
  assert.equal(walkthroughStage({}, NOW).key, "new");
  assert.equal(walkthroughStage(null, NOW).key, "new");
  // A linked bid outranks every earlier signal; areas outrank the appointment.
  assert.equal(walkthroughStage({ bid_id: "b", count: 0, scheduled_at: FUTURE }, NOW).key, "bid_linked");
  assert.equal(walkthroughStage({ count: 5, scheduled_at: FUTURE }, NOW).key, "walked");
});

test("stage counts cover every loaded row exactly once; follow-up is the passed set", () => {
  const rows = [
    { bid_id: "b1" },
    { count: 2 },
    { scheduled_at: FUTURE },
    { scheduled_at: PAST },
    { intake: { business_name: "Acme" } },
    {},
  ];
  const counts = countWalkthroughStages(rows, NOW);
  assert.deepEqual(counts, {
    all: 6,
    bid_linked: 1,
    walked: 1,
    scheduled: 1,
    appointment_passed: 1,
    phone_intake: 1,
    new: 1,
    followUp: 1,
  });
});

test("search matches stored record text and the stage label; stage filter is exact", () => {
  const rows = [
    { name: "Downtown office", locations: { name: "Bank HQ" }, intake: { business_name: "Acme Dental", contact_person: "Pat Lee" }, count: 0 },
    { name: "Warehouse visit", locations: null, meet_contact: "Sam", bid_id: "b1" },
  ];
  assert.equal(searchWalkthroughs(rows, "", NOW).length, 2);
  assert.equal(searchWalkthroughs(rows, "acme", NOW)[0].name, "Downtown office");
  assert.equal(searchWalkthroughs(rows, "pat lee", NOW).length, 1);
  assert.equal(searchWalkthroughs(rows, "bank hq", NOW).length, 1);
  assert.equal(searchWalkthroughs(rows, "bid linked", NOW)[0].name, "Warehouse visit");
  assert.equal(searchWalkthroughs(rows, "zzz", NOW).length, 0);
  assert.deepEqual(filterWalkthroughsByStage(rows, "all", NOW).map((r) => r.name), ["Downtown office", "Warehouse visit"]);
  assert.deepEqual(filterWalkthroughsByStage(rows, "bid_linked", NOW).map((r) => r.name), ["Warehouse visit"]);
  assert.deepEqual(filterWalkthroughsByStage(rows, "phone_intake", NOW).map((r) => r.name), ["Downtown office"]);
});

test("page wires the glance panel, search, stage filter and card client/stage lines", () => {
  const page = read(PAGE);
  for (const needle of [
    'from "../../../../lib/walkthrough-list.mjs"',
    "const stageCounts = countWalkthroughStages(walkthroughs, now);",
    "const shown = filterWalkthroughsByStage(searchWalkthroughs(walkthroughs, search, now), stageFilter, now);",
    "Walkthroughs at a glance",
    "Stage is worked out from what is already recorded on each walkthrough",
    "It is not a separate status you set.",
    "passed with no areas recorded yet — follow up.",
    'placeholder="Search name, client, contact, or location"',
    '<option value="all">All stages</option>',
    "Showing {shown.length} of {walkthroughs.length} walkthroughs.",
    '"No walkthroughs match your search or stage filter."',
    "Client: <strong>{walkthroughClientName(w)}</strong>",
    "Stage: <strong>{walkthroughStage(w, now).label}</strong>",
    "Worked out from the record: {walkthroughStage(w, now).basis}",
    "phone answer{walkthroughPhoneAnswerCount(w) === 1 ? \"\" : \"s\"} recorded",
  ]) {
    // The empty-state needle is a JSX text node, not a quoted string.
    const probe = needle.startsWith('"No walkthroughs match') ? "No walkthroughs match your search or stage filter." : needle;
    assert.ok(page.includes(probe), `list depth adds: ${needle}`);
  }
});

test("helper lib is pure: no writes, no network, no supabase, no photo/storage code", () => {
  const lib = read("lib/walkthrough-list.mjs");
  for (const banned of ["insert", "update(", "delete", "fetch", "supabase", "storage", "photo"]) {
    assert.ok(!lib.toLowerCase().includes(banned), `helper lib performs no ${banned}`);
  }
});
