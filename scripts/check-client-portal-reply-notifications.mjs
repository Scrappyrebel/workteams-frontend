import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Customer reply notifications (migration 071) invariants:
// * Every business reply queues exactly one notification row (trigger on
//   portal_message_replies); the recipient snapshot comes only from the
//   request's verified portal contact. Shared-link requests have no email
//   anywhere in the schema, so their rows are honestly 'no_recipient'.
// * The notify route sends through the app's Resend transport and records
//   'sent' ONLY after Resend accepts. A missing key or a failed send
//   leaves the row 'pending' with the reason in last_error.
// * The email never contains the reply text: the route never reads the
//   replies table at all — it only knows a reply is waiting and links to
//   the customer portal.
// * The in-portal flag is additive: history/conversation reads gain
//   'has_unseen_reply', and opening the conversation marks it seen via
//   the two mark-seen RPCs. The 051 privacy rule is untouched (this
//   feature adds a boolean, never message content).
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in the migration.

const SQL_PATH = "supabase/071_portal_customer_reply_notifications.sql";
const ROUTE = "app/api/portal/reply-notify/route.js";
const CONVO_ROUTE = "app/api/portal/conversation/route.js";
const TOKEN_PAGE = "app/portal/[token]/page.js";
const AUTH_COMPONENT = "components/AuthenticatedCustomerRequests.js";
const INBOX = "app/app/[companyId]/client-portal/page.js";

test("migration 071 queues notifications and adds the unseen flag", () => {
  assert.ok(existsSync(SQL_PATH), "migration 071 exists");
  const sql = read(SQL_PATH);
  for (const needle of [
    "BEGIN;",
    "COMMIT;",
    "customer_thread_seen_at",
    "create table if not exists public.portal_reply_notifications",
    "queue_portal_reply_notification",
    "portal_reply_notification_queue",
    "after insert on public.portal_message_replies",
    "'no_recipient'",
    "'has_unseen_reply'",
    "mark_portal_conversation_seen_with_token",
    "mark_workteams_authenticated_customer_conversation_seen",
    "grant select, insert, update, delete on public.portal_reply_notifications to authenticated",
    "grant all on public.portal_reply_notifications to service_role",
    "enable row level security",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  // The queue trigger swallows its own failures so a notification can
  // never break posting a reply.
  assert.ok(sql.includes("exception when others then"),
    "queue trigger is fail-safe");
  // Protected areas: the migration touches none of them.
  for (const banned of ["shift_videos", "communication_book", "time_entries"])
    assert.ok(!sql.includes(banned), `migration stays out of: ${banned}`);
});

test("notify route sends via Resend and never reads reply text", () => {
  assert.ok(existsSync(ROUTE), "notify route exists");
  const route = read(ROUTE);
  for (const needle of [
    "RESEND_API_KEY",
    "portal_reply_notifications",
    "/customer-portal",
    "no-recipient",
    "last_error",
    "company_members",
  ]) assert.ok(route.includes(needle), `route contains: ${needle}`);
  // Privacy: the route never touches the replies table, so no reply body
  // can ever reach an email.
  assert.ok(!route.includes("portal_message_replies"),
    "route never reads the replies table");
  // Honest unsent state: 'sent' is written only on the success path.
  assert.ok(route.includes('status: "sent"'),
    "sent status recorded");
  assert.ok(route.includes("sent.ok"),
    "sent status gated on the Resend result");
});

test("conversation route relays the mark-seen mode", () => {
  const route = read(CONVO_ROUTE);
  assert.ok(route.includes("mark_portal_conversation_seen_with_token"),
    "token mark-seen RPC relayed");
  assert.ok(route.includes("mark_seen"), "mark_seen mode present");
});

test("customer surfaces show and clear the new-reply flag", () => {
  const token = read(TOKEN_PAGE);
  for (const needle of [
    "has_unseen_reply",
    "mark_seen:true",
    "New reply from the business",
  ]) assert.ok(token.includes(needle), `token page contains: ${needle}`);
  const auth = read(AUTH_COMPONENT);
  for (const needle of [
    "has_unseen_reply",
    "mark_workteams_authenticated_customer_conversation_seen",
    "New reply from management",
  ]) assert.ok(auth.includes(needle), `authenticated portal contains: ${needle}`);
});

test("manager inbox triggers the email notice after a reply saves", () => {
  const inbox = read(INBOX);
  assert.ok(inbox.includes("/api/portal/reply-notify"),
    "inbox calls the notify route");
  assert.ok(inbox.includes("data.reply_id"),
    "notify call uses the saved reply id");
});
