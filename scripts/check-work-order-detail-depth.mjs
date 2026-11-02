import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Work order detail depth (D-WT-30) invariants:
// * Catalog §7 confirmed on main: colour-coded status banner, Updates
//   thread with author + timestamp and manager delete, status buttons
//   for all four states with completed_at set on completion, manager
//   re-assignment and priority change with notifications, clock-in
//   gating on updates, and the careful WorkOrderCustomerPublication
//   control. NONE of that changes here — this guard pins it.
// * Gaps built (expansion-only): (a) the header meta line and a new
//   "Work order record" panel name the assignee for EVERY viewer who
//   may see the order (previously only inside the manager-only
//   "Assigned to" select, so the assigned employee saw no assignment
//   confirmation); the name resolves via team_directory exactly as
//   the work orders LIST page already does. (b) A stored-facts record
//   panel (status/priority/assignee/location/due/agreed price as
//   stored/source/created/completed). (c) An OPTIONAL text completion
//   record (customer sign-off name + completion note) and OPTIONAL
//   cancellation reason, plus a status-change history — all stored in
//   the additive migration-085 work_order_events table and recorded
//   strictly AFTER the existing update succeeds, best-effort, never
//   gating a transition. (d) Before 085 runs, loads fail soft and the
//   page behaves exactly as today.
// * NOT built, by design (decision items): editing the order's own
//   fields (title/description/location/due date/agreed price),
//   transition restrictions or confirmations, REQUIRED reasons, and
//   proof-of-completion PHOTOS (protected area — photo capture and
//   storage are never touched).
// * Customer-publication copy is legal-flavoured and attorney-gated:
//   the component file and its import/render stay byte-identical.

const PAGE = "app/app/[companyId]/work-orders/[id]/page.js";
const LIB = "lib/work-order-events.js";
const MIGRATION = "supabase/085_work_order_events.sql";
const PUBLICATION = "components/WorkOrderCustomerPublication.js";

test("protected gates and existing behaviour are byte-preserved", () => {
  const page = read(PAGE);
  for (const needle of [
    'if (!requireClockedIn(clockedIn, "update a work order")) return;',
    'if (!requireClockedIn(clockedIn, "post an update")) return;',
    "completed_at: s === \"completed\" ? new Date().toISOString() : null,",
    "{Object.keys(STATUS_LABELS).map((s) => (",
    'body: JSON.stringify({ work_order_id: orderId, event: "completed", actor_member_id: member.id }),',
    'body: JSON.stringify({ work_order_id: orderId, event: "assigned", actor_member_id: member.id }),',
    'placeholder="Add an update — e.g. lobby done, moving to restrooms…"',
    '{c.company_members?.name || "Someone"}',
    '{isManager&&<WorkOrderCustomerPublication',
    "orderId={order.id} companyId={company.id} canManage={isManager}/>",
    "if (!isManager && data.assigned_to !== member.id) {",
  ]) {
    assert.ok(page.includes(needle), `work order detail keeps: ${needle}`);
  }
  // The original update write is still the only work_orders write and
  // still carries exactly the caller's patch.
  assert.equal(
    (page.match(/\.from\("work_orders"\)\s*\.update\(patch\)/g) || []).length,
    1,
    "exactly one work_orders update, with the original patch",
  );
  // No field-editing was introduced: update() is never called with the
  // order's own fields.
  for (const banned of ["update({ title", "update({ description", "update({ due_date", "update({ agreed_price", "update({ location_id"]) {
    assert.ok(!page.includes(banned), `no field editing introduced: ${banned}`);
  }
  // No photo/media path was introduced anywhere on this page.
  for (const banned of ["shift_videos", "comm_book", "inspection-photos", "type=\"file\"", "getUserMedia", "MediaRecorder"]) {
    assert.ok(!page.includes(banned), `page stays clear of protected media: ${banned}`);
  }
});

test("customer publication component is untouched", () => {
  const pub = read(PUBLICATION);
  for (const needle of [
    "Private by default. Write a separate customer-safe title; do not copy internal instructions, assigned staff or prices.",
    "Publish ONLY the customer-safe title, work-order status and due date for customers with separate approved location access? Private descriptions, staff, comments and prices will not be shared.",
    "set_workteams_work_order_publication",
    "get_workteams_work_order_publication_for_manager",
  ]) {
    assert.ok(pub.includes(needle), `publication copy preserved: ${needle}`);
  }
});

test("assignee is named in the header meta and the record panel for every viewer", () => {
  const page = read(PAGE);
  assert.ok(page.includes('{" • Assigned to "}'), "header meta names the assignee");
  assert.ok(page.includes('assigneeName || "Assigned team member"'), "unresolved assignee still confirms assignment without inventing a name");
  assert.ok(page.includes("Assigned to: <strong>"), "record panel names the assignee");
  assert.ok(
    page.includes('.from("team_directory").select("id, display_name").eq("id", data.assigned_to)'),
    "assignee name resolves via team_directory like the list page",
  );
});

test("record panel shows stored facts only, including the agreed price as stored", () => {
  const page = read(PAGE);
  for (const needle of [
    "Work order record",
    "Status: <strong>{STATUS_LABELS[order.status]}</strong>",
    "Priority: <strong>{PRIORITY_LABELS[order.priority]}</strong>",
    "Agreed price: <strong>${Number(order.agreed_price).toFixed(2)}</strong>",
    'order.source === "portal"',
    "Created: <strong>",
    "Completed: <strong>",
    "Completion record",
    "Cancellation reason",
    "Status history",
  ]) {
    assert.ok(page.includes(needle), `record panel shows: ${needle}`);
  }
});

test("completion/cancellation capture is optional and recorded only after a successful update", () => {
  const page = read(PAGE);
  for (const needle of [
    "Signed off by (optional — name of the person who accepted the finished work)",
    "Completion note (optional)",
    "Cancellation reason (optional)",
    "recordWorkOrderEvent",
    'eventType: "completion"',
    'eventType: "cancellation"',
    'eventType: "status"',
  ]) {
    assert.ok(page.includes(needle), `capture present: ${needle}`);
  }
  // Recording happens after the original update's error check.
  const updateIdx = page.indexOf('.from("work_orders").update(patch)');
  const errorIdx = page.indexOf('alert("Could not update: " + error.message)');
  const recordIdx = page.indexOf("recordWorkOrderEvent", errorIdx);
  assert.ok(updateIdx > 0 && errorIdx > updateIdx && recordIdx > errorIdx, "events record only after the update succeeds");
  // The lib never throws and refuses empty completion/cancellation text.
  const lib = read(LIB);
  assert.ok(lib.includes("return { ok: false, events: [] }"), "loads fail soft before migration 085");
  assert.ok(lib.includes('if ((eventType === "completion" || eventType === "cancellation") && !text) return false;'), "empty optional text records nothing");
});

test("migration 085 is additive-only and append-only", () => {
  const sql = read(MIGRATION);
  assert.ok(sql.includes("create table if not exists public.work_order_events"), "one new table");
  assert.ok(sql.includes("grant select, insert, update, delete on public.work_order_events to authenticated;"), "grants present (AGENTS.md rule)");
  for (const banned of ["alter table public.work_orders", "drop table", "drop column", "update public.work_orders", "delete from public.work_orders"]) {
    assert.ok(!sql.toLowerCase().includes(banned), `migration does not touch existing data: ${banned}`);
  }
  // Append-only from the app: select + insert policies only.
  assert.ok(sql.includes('"work_order_events select if member"'), "select policy mirrors 037");
  assert.ok(sql.includes('"work_order_events insert if member"'), "insert policy mirrors 037");
  assert.ok(!sql.includes("for update") && !sql.includes("for delete"), "no update/delete policies — the record cannot be rewritten from the app");
});
