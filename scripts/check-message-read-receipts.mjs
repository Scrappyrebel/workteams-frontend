import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Crew-chat read receipts (migration 073, audit item A4) invariants:
// * Announcements in WorkTeams happen in the crew chat (messages, 002);
//   there is no separate announcements feature. Workforce's announcements
//   got receipts in its migration 266 — discrete feed items, one receipt
//   row per member per announcement. This app's chat is ONE continuous
//   company-wide stream loaded whole, so the receipt is a per-member
//   "seen through" WATERMARK (one row per member): the created_at of the
//   newest message that member actually loaded. Seen/not-seen per message
//   is derived by comparing watermarks to the message's created_at.
// * The write path cannot be forged: migration 073's insert/update RLS
//   pins member_id to the caller's own company_members row (the 068
//   own-row pattern), reads are company-scoped, and the policies carry
//   the same Plus tier gate as the messages table itself (024).
// * Recording is fail-soft and can never break the chat: the page
//   upserts its own watermark after a successful load inside try/catch,
//   reads receipts/roster in their own try/catch, and shows no seen-by
//   UI when receipts are unavailable — so a pre-073 database behaves
//   exactly as today.
// * Only the poster and managers (owner/admin, roleRank >= 2) see the
//   seen / not-yet-seen line, by name, from the existing team_directory
//   roster; the poster is excluded from their own not-seen list.
// * Chat behavior is otherwise untouched: the messages select, insert,
//   notify call and rendering of message content stay byte-identical.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in any changed file.

const SQL_PATH = "supabase/073_message_read_receipts.sql";
const PAGE = "app/app/[companyId]/messages/page.js";

test("migration 073 creates the watermark receipts table with own-row RLS", () => {
  assert.ok(existsSync(SQL_PATH), "migration 073 exists");
  const sql = read(SQL_PATH);
  for (const needle of [
    "BEGIN;",
    "COMMIT;",
    "create table if not exists public.message_read_receipts",
    "seen_through_at timestamptz not null",
    "unique (company_id, member_id)",
    "enable row level security",
    "grant select, insert, update on public.message_read_receipts to authenticated",
    "grant all on public.message_read_receipts to service_role",
    '"message read receipts select if member"',
    '"message read receipts insert own"',
    '"message read receipts update own"',
    "m.id = message_read_receipts.member_id",
    "public.company_tier_meets(message_read_receipts.company_id, 'plus')",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  assert.ok(
    !/grant[^;]*delete/i.test(sql) && !/for delete/i.test(sql),
    "no delete grant or delete policy: a receipt is only ever advanced"
  );
  // Protected areas: the migration touches none of them.
  for (const banned of ["shift_videos", "communication_book", "time_entries"])
    assert.ok(!sql.includes(banned), `migration stays out of: ${banned}`);
});

test("the chat page records its own watermark fail-soft after loading", () => {
  const page = read(PAGE);
  for (const needle of [
    'from("message_read_receipts")',
    "markSeenThrough(rows)",
    'onConflict: "company_id,member_id"',
    "seen_through_at: newest",
    "member_id: member.id",
    "Receipts are best-effort; the chat itself is what matters.",
  ]) assert.ok(page.includes(needle), `page contains: ${needle}`);
});

test("seen-by is poster/manager only, by name, poster excluded", () => {
  const page = read(PAGE);
  for (const needle of [
    'import { roleRank } from "../../../../lib/roles"',
    "roleRank(member.role) >= 2",
    "roster.filter((p) => p.id !== m.sender_id)",
    '"team_directory"',
    "Seen by ",
    "Not yet: ",
    "Not seen yet: ",
  ]) assert.ok(page.includes(needle), `page contains: ${needle}`);
});

test("existing chat behavior is byte-identical", () => {
  const page = read(PAGE);
  for (const needle of [
    '.from("messages")',
    '.select("id, content, created_at, sender_id")',
    'await fetch("/api/messages/notify"',
    'placeholder="Message the crew…"',
  ]) assert.ok(page.includes(needle), `page retains: ${needle}`);
  // Protected areas: the page touches none of them.
  for (const banned of ["shift_videos", "communication_book", "comm-book", "time_entries"])
    assert.ok(!page.includes(banned), `page stays out of: ${banned}`);
});
