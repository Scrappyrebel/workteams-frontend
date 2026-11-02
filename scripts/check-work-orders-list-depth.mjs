import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isWorkOrderOverdue,
  isWorkOrderDueToday,
  workOrderDaysOverdue,
  countWorkOrdersByStatus,
  countOverdueWorkOrders,
  searchWorkOrders,
  sortWorkOrders,
} from "../lib/work-order-list.mjs";
const read = (p) => readFileSync(p, "utf8");

// Work Orders list depth (D-WT-29) invariants:
// * The list page already loaded every field this build uses (003:
//   title, description, priority, status, due_date, assigned_to,
//   created_at; 026: source, agreed_price; locations(name); assignee
//   names resolved from team_directory). The depth build is
//   expansion-only and DISPLAY-ONLY: an overdue signal computed from
//   the stored due_date vs the company's today, search over stored
//   text, sort choices that default to the page's existing order,
//   counts on the status chips, and filter-aware empty states. No
//   query, insert, notification, wording, or save behaviour that
//   existed before is changed.
// * PROTECTED: creation stays gated on being clocked in — the
//   requireClockedIn call in save() is pinned byte-for-byte below.
// * Overdue never applies to completed/cancelled orders and never
//   blocks or alters any save or status behaviour; it is a label.
// * No work-type/category, checklist, or recurrence is invented:
//   work_orders has no such column (003 + 026 are the whole schema
//   story), so those stay decision items, and no SQL ships here.

const PAGE = "app/app/[companyId]/work-orders/page.js";
const TODAY = "2026-11-02";

test("existing load, create form, clock-in gate and notify path are unchanged", () => {
  const page = read(PAGE);
  for (const needle of [
    '.select("id, title, description, priority, status, due_date, assigned_to, created_at, source, agreed_price, locations(name)")',
    '.eq("company_id", company.id)',
    '.order("created_at", { ascending: false })',
    'if (!isManager) q = q.eq("assigned_to", member.id);',
    'if (!requireClockedIn(clockedIn, "create a work order")) return;',
    "Price $ (if billable)",
    "Create work order",
    'fetch("/api/work-orders/notify", {',
    'event: "assigned"',
    "Showing work orders assigned to you.",
    '{o.source === "portal" ? " • 📩 CLIENT REQUEST" : ""}',
    '{o.due_date ? ` • due ${o.due_date}` : ""}',
  ]) {
    assert.ok(page.includes(needle), `work orders page keeps: ${needle}`);
  }
});

test("overdue derives from stored due_date vs company today, open work only", () => {
  const base = { status: "open", due_date: "2026-10-30" };
  assert.equal(isWorkOrderOverdue(base, TODAY), true);
  assert.equal(workOrderDaysOverdue(base, TODAY), 3);
  assert.equal(isWorkOrderOverdue({ ...base, due_date: "2026-11-01" }, TODAY), true);
  assert.equal(workOrderDaysOverdue({ ...base, due_date: "2026-11-01" }, TODAY), 1);
  assert.equal(isWorkOrderOverdue({ ...base, status: "in_progress" }, TODAY), true);
  assert.equal(isWorkOrderOverdue({ ...base, status: "completed" }, TODAY), false);
  assert.equal(isWorkOrderOverdue({ ...base, status: "cancelled" }, TODAY), false);
  assert.equal(isWorkOrderOverdue({ ...base, due_date: TODAY }, TODAY), false);
  assert.equal(isWorkOrderDueToday({ ...base, due_date: TODAY }, TODAY), true);
  assert.equal(isWorkOrderOverdue({ ...base, due_date: "2026-11-03" }, TODAY), false);
  assert.equal(isWorkOrderOverdue({ ...base, due_date: null }, TODAY), false);
  assert.equal(workOrderDaysOverdue({ ...base, status: "completed" }, TODAY), 0);
  assert.equal(
    countOverdueWorkOrders(
      [base, { ...base, status: "completed" }, { ...base, due_date: "2026-12-01" }],
      TODAY
    ),
    1
  );
});

test("status counts cover every loaded order exactly once", () => {
  const counts = countWorkOrdersByStatus([
    { status: "open" },
    { status: "open" },
    { status: "in_progress" },
    { status: "completed" },
    { status: "cancelled" },
  ]);
  assert.deepEqual(counts, { open: 2, in_progress: 1, completed: 1, cancelled: 1, all: 5 });
});

test("search matches stored card text only; empty query is a pass-through", () => {
  const rows = [
    { title: "Deep clean lobby", description: null, locations: { name: "Bank" }, assignee_name: "Sam", status: "open", priority: "normal" },
    { title: "Fix sink", description: "Restroom leak", locations: null, assignee_name: "Unassigned", status: "open", priority: "urgent" },
  ];
  const labels = { status: { open: "Open" }, priority: { normal: "Normal", urgent: "Urgent" } };
  assert.equal(searchWorkOrders(rows, "", labels).length, 2);
  assert.equal(searchWorkOrders(rows, "lobby", labels)[0].title, "Deep clean lobby");
  assert.equal(searchWorkOrders(rows, "bank", labels).length, 1);
  assert.equal(searchWorkOrders(rows, "sam", labels).length, 1);
  assert.equal(searchWorkOrders(rows, "leak", labels).length, 1);
  assert.equal(searchWorkOrders(rows, "urgent", labels).length, 1);
  assert.equal(searchWorkOrders(rows, "zzz", labels).length, 0);
});

test("sort defaults to the loaded order; due-date and priority sorts are stable", () => {
  const rows = [
    { title: "a", due_date: null, priority: "low" },
    { title: "b", due_date: "2026-11-05", priority: "urgent" },
    { title: "c", due_date: "2026-11-03", priority: "high" },
    { title: "d", due_date: "2026-11-03", priority: "urgent" },
  ];
  assert.deepEqual(sortWorkOrders(rows, "newest").map((r) => r.title), ["a", "b", "c", "d"]);
  assert.deepEqual(sortWorkOrders(rows, "due_date").map((r) => r.title), ["c", "d", "b", "a"]);
  assert.deepEqual(sortWorkOrders(rows, "priority").map((r) => r.title), ["b", "d", "c", "a"]);
  // Sorting never mutates the loaded array.
  assert.deepEqual(rows.map((r) => r.title), ["a", "b", "c", "d"]);
});

test("page wires search, sort, counts, overdue chip/badges and filter-aware empty states", () => {
  const page = read(PAGE);
  for (const needle of [
    'import { chicagoToday } from "../../../../lib/dates";',
    "const today = chicagoToday(company?.timezone);",
    'const [sort, setSort] = useState("newest");',
    'placeholder="Search title, description, location, or assignee"',
    '<option value="due_date">Due date (soonest first)</option>',
    '<option value="priority">Priority (highest first)</option>',
    '"open", "in_progress", "completed", "cancelled", "all", "overdue"',
    "Showing {shown.length} of {orders.length} work orders.",
    '"No overdue work orders."',
    '"No work orders here."',
    "Overdue — {workOrderDaysOverdue(o, today)}",
    "Due today",
  ]) {
    assert.ok(page.includes(needle), `list depth adds: ${needle}`);
  }
});

test("no writes or sends added; no category/checklist/recurrence invented; protected areas absent", () => {
  const page = read(PAGE);
  // Exactly the writes/sends that existed before: one insert in
  // save() and the one notify fetch. The depth build adds neither.
  assert.equal(page.split(".insert(").length - 1, 1, "only the pre-existing insert remains");
  assert.equal(page.split("fetch(").length - 1, 1, "only the pre-existing notify fetch remains");
  for (const banned of [".update(", ".delete(", ".upsert(", "time_entries", "shift_videos", "comm_book", "category", "checklist", "recurr"]) {
    assert.ok(!page.toLowerCase().includes(banned), `page does not introduce ${banned}`);
  }
  const lib = read("lib/work-order-list.mjs");
  for (const banned of ["insert", "update(", "delete", "fetch", "supabase"]) {
    assert.ok(!lib.includes(banned), `helper lib performs no ${banned}`);
  }
});
