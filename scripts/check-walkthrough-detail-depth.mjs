import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Walkthrough detail depth (D-WT-28) invariants:
// * Catalog verdict P verified first-hand on main c45d3a53: the detail
//   page is genuinely professional — measured areas with floor type and
//   fixtures, Wendy's two-part question set, photos, generated scope of
//   work, and bid / work-order conversion all present and working.
//   Three gaps were verified against that verdict:
//   (1) the conversion trail was invisible — walkthroughs.bid_id is
//       stored (005) and set by conversion, but the page never showed
//       that a bid is linked, which bid it is, its stored status, or a
//       link to open it (the only trace was the scope button's label);
//   (2) the follow-up state was invisible — the appointment
//       (scheduled_at / meet_contact), the promised proposal dates
//       (answers.leave_proposal_date / decision_proposal) and the
//       hoped-for start (intake.start_hoped) surfaced only as values
//       inside edit forms and the copied scope text;
//   (3) pre-migration-067 sections vanished silently on this page,
//       while the walkthroughs list page carries the app's honest
//       pattern ("The phone-question set turns on with the latest
//       WorkTeams update.").
// * The depth build is expansion-only on the detail page:
//   (1) a read-only "Where this stands" panel showing only stored
//       facts — recorded date, appointment, promised proposal dates
//       under their own question labels, hoped-for start, and the
//       linked bid (one extra fail-soft, company-scoped read of that
//       bid's stored title / client / status, plus an "Open bid"
//       link) — with its basis stated on screen. Viewing writes
//       nothing; pre-067 the panel honestly degrades to the facts
//       that exist (recorded date + bid link);
//   (2) honest setup notes in the list page's own sentence shape,
//       rendered ONLY when the matching probe reports exactly false
//       (never while unknown, never once the question set is live).
// * No write path changes: the bid insert / linked-bid update and the
//   work-orders insert are byte-identical, including the work-orders
//   insert carrying NO source label (stamping one is a decision item
//   for Wendy — the existing write's stored values do not change
//   here). No lifecycle status is invented; the panel derives from
//   stored facts instead.
// * Walkthrough photos are display-only in this build: the single
//   pre-existing upload call and single storage remove are pinned by
//   count; capture / upload / storage / delete code is untouched.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in the changed page. Access
//   semantics (owner/admin + Pro tier gate) are byte-identical.

const PAGE = "app/app/[companyId]/walkthroughs/[id]/page.js";

test("existing detail behaviour is unchanged", () => {
  const page = read(PAGE);
  for (const needle of [
    'const isManager = member && (member.role === "owner" || member.role === "admin");',
    'canUseWithRole(company?.effectiveTier || company?.tier, "walkthroughs", member?.role)',
    "SCOPE OF WORK — ${walkthrough?.locations?.name || walkthrough?.name || \"\"}",
    "description: buildScope(walkthrough, areas)",
    'status: "draft"',
    'pricing_mode: "sqft"',
    '.from("walkthroughs").update({ bid_id: data.id }).eq("id", wid)',
    '.from("work_orders").insert(rows)',
    "await navigator.clipboard.writeText(text);",
    '.from("walkthrough_photos")',
    "Part 1 — Phone questions",
    "Part 2 — Walkthrough questions",
    "Walkthrough photos",
    "Scope of work",
  ]) {
    assert.ok(page.includes(needle), `detail page keeps: ${needle}`);
  }
});

test("where-this-stands panel shows stored facts only, with its basis stated", () => {
  const page = read(PAGE);
  for (const needle of [
    "Where this stands",
    "Recorded:",
    "Walkthrough appointment:",
    "Proposal date promised:",
    "When will you decide? Proposal promised by (date):",
    "When are you hoping to start service?",
    "answersSaved.leave_proposal_date",
    "answersSaved.decision_proposal",
    "intakeSaved.start_hoped",
    "No bid linked yet.",
    "Everything here comes from what is saved on this walkthrough",
  ]) {
    assert.ok(page.includes(needle), `summary panel: ${needle}`);
  }
});

test("conversion trail reads the linked bid fail-soft and links to it", () => {
  const page = read(PAGE);
  for (const needle of [
    "const [linkedBid, setLinkedBid] = useState(null);",
    '.from("bids")',
    '.select("id, title, client_name, status")',
    '.eq("id", data.bid_id)',
    '.eq("company_id", company.id)',
    ".maybeSingle()",
    "Open bid →",
    "href={`/app/${company.id}/bids/${walkthrough.bid_id}`}",
    "linkedBid.status",
  ]) {
    assert.ok(page.includes(needle), `bid trail: ${needle}`);
  }
  // The bids table is touched exactly three times: the new read in
  // load(), and the two pre-existing conversion writes in useInBid().
  assert.equal(
    (page.match(/\.from\("bids"\)/g) || []).length,
    3,
    "exactly the three bids touches (1 new read + 2 pre-existing conversion writes)",
  );
});

test("viewing the page writes nothing", () => {
  const page = read(PAGE);
  const loadStart = page.indexOf("async function load()");
  const loadEnd = page.indexOf("useEffect(() => {");
  assert.ok(loadStart > 0 && loadEnd > loadStart, "load function located");
  const loadSlice = page.slice(loadStart, loadEnd);
  assert.ok(loadSlice.includes('.from("bids")'), "load() performs the linked-bid read");
  assert.ok(!loadSlice.includes(".insert("), "load() never inserts");
  assert.ok(!loadSlice.includes(".update("), "load() never updates");
  assert.ok(!loadSlice.includes(".delete("), "load() never deletes");
  assert.ok(!loadSlice.includes(".upload("), "load() never uploads");
});

test("setup notes appear only when a probe reports exactly false", () => {
  const page = read(PAGE);
  for (const needle of [
    "{wtQReady === false && (",
    "{areaQReady === false && (",
    "{photosReady === false && (",
    "The phone-question set turns on with the latest WorkTeams update.",
    "The walkthrough-question set turns on with the latest WorkTeams update.",
    "Floor type, restroom fixtures, and the room-by-room questions turn on with the latest WorkTeams update.",
    "Walkthrough photos turn on with the latest WorkTeams update.",
  ]) {
    assert.ok(page.includes(needle), `setup note: ${needle}`);
  }
});

test("no write path changes and no protected area is touched", () => {
  const page = read(PAGE);
  // The work-orders conversion insert keeps its exact pre-existing
  // shape — in particular it gains NO source label here (decision
  // item for Wendy, not a silent change to an existing write).
  assert.ok(!page.includes('source: "walkthrough"'), "work-order insert is not silently re-labelled");
  assert.equal(
    (page.match(/\.from\("work_orders"\)\.insert/g) || []).length,
    1,
    "exactly the one pre-existing work_orders insert",
  );
  // Photo storage paths are exactly the pre-existing pair.
  assert.equal(
    (page.match(/\.storage\.from\("walkthrough-photos"\)\.upload/g) || []).length,
    1,
    "exactly the one pre-existing photo upload call",
  );
  assert.equal(
    (page.match(/\.storage\.from\("walkthrough-photos"\)\.remove/g) || []).length,
    1,
    "exactly the one pre-existing photo storage remove",
  );
  for (const banned of ["time_entries", "shift_videos", "communication_book", "comm_book", "MediaRecorder"]) {
    assert.ok(!page.includes(banned), `page stays out of: ${banned}`);
  }
});
