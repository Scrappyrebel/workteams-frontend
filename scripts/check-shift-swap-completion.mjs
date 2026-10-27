import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Shift-swap completion (migration 074, audit item A5) invariants:
// * Migration 069 made swaps a record only: the teammate answers in
//   swap_status, a manager records a decision in status, and the
//   manager then re-arranged the shift by hand. Migration 074 completes
//   the loop the way Workforce's Dept 3 build did (its migration 260):
//   approve_shift_swap is the single moment the assignment changes —
//   the shift's member_id moves to the teammate who accepted in the
//   same transaction that records the approval.
// * The approval is a security-definer function that re-verifies the
//   caller is an owner/admin of the request's own company, the request
//   is a pending swap the teammate accepted, the shift still belongs
//   to the requester, and the teammate is still on the team.
// * HARD RULE, enforced in the database: a shift with recorded time
//   entries can never be swapped, and the function never writes time
//   entries — recorded time is never moved. Time-off approvals stay
//   record-only, and 069's availability/guard behavior is untouched.
// * Every step is audit-recorded in schedule_request_events (offered,
//   accepted, declined, approved, denied, cancelled, reassigned) by an
//   AFTER trigger following the app's existing writes plus the approve
//   function itself. The trail is append-only for the app:
//   authenticated can SELECT it and nothing more.
// * The clients probe for the new function/table and fall back to the
//   069 behavior until 074 runs, so nothing breaks beforehand.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in any changed file.

const SQL_PATH = "supabase/074_shift_swap_completion.sql";
const SCHEDULE_PAGE = "app/app/[companyId]/schedule/page.js";
const MY_SCHEDULE_PAGE = "app/app/[companyId]/my-schedule/page.js";

test("migration 074 adds the append-only swap audit trail", () => {
  assert.ok(existsSync(SQL_PATH), "migration 074 exists");
  const sql = read(SQL_PATH);
  for (const needle of [
    "BEGIN;",
    "COMMIT;",
    "create table if not exists public.schedule_request_events",
    "'offered', 'accepted', 'declined', 'approved', 'denied', 'cancelled', 'reassigned'",
    "enable row level security",
    "grant select on public.schedule_request_events to authenticated",
    "grant all on public.schedule_request_events to service_role",
    '"schedule request events select parties"',
    "create or replace function public.schedule_requests_audit()",
    "create trigger schedule_requests_audit",
    "after insert or update on public.schedule_requests",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  assert.ok(
    !/grant (insert|update|delete)[^;]*schedule_request_events to authenticated/.test(sql),
    "no write grant on the audit trail for authenticated: steps cannot be forged"
  );
});

test("approve_shift_swap reassigns atomically and refuses recorded time", () => {
  const sql = read(SQL_PATH);
  for (const needle of [
    "create or replace function public.approve_shift_swap(p_request_id uuid, p_decision_note text default null)",
    "security definer",
    "for update",
    "m.role in ('owner', 'admin')",
    "raise exception 'Only a manager can approve a shift swap.'",
    "raise exception 'The teammate has not accepted this swap yet.'",
    "from public.time_entries te",
    "where te.shift_id = v_shift.id",
    "Recorded time is never moved.",
    "update public.shifts",
    "set member_id = v_req.swap_with_member_id",
    "set status = 'approved'",
    "'reassigned'",
    "grant execute on function public.approve_shift_swap(uuid, text) to authenticated",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  // The swap path never writes recorded time.
  for (const banned of [
    "update public.time_entries",
    "insert into public.time_entries",
    "delete from public.time_entries",
  ]) assert.ok(!sql.includes(banned), `migration never writes time: ${banned}`);
  // Protected areas: the migration touches none of them.
  for (const banned of ["shift_videos", "communication_book"])
    assert.ok(!sql.includes(banned), `migration stays out of: ${banned}`);
});

test("the manager inbox approves swaps through the function, with a record-only fallback", () => {
  const page = read(SCHEDULE_PAGE);
  for (const needle of [
    'rpc("approve_shift_swap"',
    "p_request_id: r.id",
    "swapCompletionMissing(error)",
    "Could not approve this swap: ",
    "if (movedShift) refreshVisible();",
    "Approving moves this shift to ",
    // The 069 record-only path is retained verbatim for every other decision.
    'from("schedule_requests").update(patch).eq("id", r.id)',
    'disabled={r.request_type === "swap" && r.swap_status !== "accepted"}',
  ]) assert.ok(page.includes(needle), `schedule page contains: ${needle}`);
  for (const banned of ["shift_videos", "communication_book", "comm-book"])
    assert.ok(!page.includes(banned), `schedule page stays out of: ${banned}`);
});

test("both members can see the swap's state and step trail", () => {
  const page = read(MY_SCHEDULE_PAGE);
  for (const needle of [
    'from("schedule_request_events")',
    "Approved — this shift now belongs to ",
    "Swaps you were asked about",
    "Approved — this shift is yours now.",
    "reassigned: \"Shift moved\"",
    // The 069 surfaces stay exactly as they were.
    "A teammate asked you to swap",
    "answerSwap(r, \"accepted\")",
  ]) assert.ok(page.includes(needle), `my-schedule page contains: ${needle}`);
  for (const banned of ["shift_videos", "communication_book", "comm-book", "time_entries"])
    assert.ok(!page.includes(banned), `my-schedule page stays out of: ${banned}`);
});
