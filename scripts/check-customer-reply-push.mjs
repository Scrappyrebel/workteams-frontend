import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Customer-reply member push invariants (the A2 follow-up gap):
// * Migration 071 emails the CUSTOMER when management replies; a CUSTOMER
//   reply only raised the in-app management alert and the inbox unread
//   flag (migration 065) — the saved "customer_replies" preference
//   (migration 068) had no send path, and the notifications page said so.
// * lib/customer-reply-push.js is the send path: recipients are the
//   owner/admin members who see the 065 unread flags in the inbox, each
//   filtered by their "customer_replies" preference and by quiet hours
//   (migration 072) through the shared lib/notification-prefs.js check.
//   Customer replies are non-urgent — the emergency channel is untouched.
// * The payload never contains the reply text: the helper never reads
//   the replies table at all; it names the location and deep-links to
//   the exact conversation in the management inbox.
// * Triggers: the shared-link conversation route notifies server-side
//   after its reply RPC succeeds; the authenticated component asks the
//   customer-reply-notify route, which re-verifies the caller is the
//   identity linked to the request's contact and the reply is fresh.
// * Fail-soft everywhere: a push failure can never affect the reply.
// * Honesty wording moves only where it became false: the notifications
//   page "customer_replies" help now says the choice is honored, while
//   "pay" — still without a member push — keeps its note.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in the new code.

const LIB = "lib/customer-reply-push.js";
const CONVO_ROUTE = "app/api/portal/conversation/route.js";
const NOTIFY_ROUTE = "app/api/portal/customer-reply-notify/route.js";
const AUTH_COMPONENT = "components/AuthenticatedCustomerRequests.js";
const PREFS_PAGE = "app/app/[companyId]/notifications/page.js";
const BANNED = ["time_entries", "shift_videos", "communication_book", "comm_book"];

test("shared fan-out pushes to the inbox audience honoring preference and quiet hours", () => {
  assert.ok(existsSync(LIB), "customer reply push helper exists");
  const lib = read(LIB);
  for (const needle of [
    'from "./push"',
    "sendPush",
    "pushConfigured",
    "getNotificationPrefs",
    "wantsNotification",
    '"customer_replies"',
    "getCompanyTimezone",
    "pushHeldByQuietHours",
    '.in("role", ["owner", "admin"])',
    "push_subscriptions",
    "client-portal?message=",
    "customer-reply-",
  ]) assert.ok(lib.includes(needle), `helper contains: ${needle}`);
  // Privacy: the payload is built without ever reading the reply text.
  assert.ok(!lib.includes("portal_message_replies"),
    "helper never reads the replies table — no reply text can leak into a push");
  for (const banned of BANNED)
    assert.ok(!lib.includes(banned), `helper stays out of: ${banned}`);
});

test("shared-link conversation route notifies after the reply RPC succeeds", () => {
  const route = read(CONVO_ROUTE);
  assert.ok(route.includes("pushCustomerReplyToManagement"),
    "conversation route calls the push helper");
  const rpcAt = route.indexOf("reply_to_portal_message_with_token");
  const notifyAt = route.indexOf("pushCustomerReplyToManagement(svc");
  assert.ok(rpcAt !== -1 && notifyAt > rpcAt, "push fires after the reply RPC");
  assert.ok(route.includes('data?.ok === true'), "push only on a confirmed reply");
  for (const banned of BANNED)
    assert.ok(!route.includes(banned), `conversation route stays out of: ${banned}`);
});

test("authenticated notify route re-verifies the caller and the fresh reply", () => {
  assert.ok(existsSync(NOTIFY_ROUTE), "customer reply notify route exists");
  const route = read(NOTIFY_ROUTE);
  for (const needle of [
    "auth.getUser",
    "portal_message_replies",
    'sender_role !== "customer"',
    "client_portal_identity_links",
    "portal-customer-reply-notify:",
    "pushCustomerReplyToManagement",
    "appUrlFrom",
  ]) assert.ok(route.includes(needle), `route contains: ${needle}`);
  for (const banned of BANNED)
    assert.ok(!route.includes(banned), `route stays out of: ${banned}`);
});

test("authenticated component notifies after the reply saves", () => {
  const comp = read(AUTH_COMPONENT);
  assert.ok(comp.includes("/api/portal/customer-reply-notify"),
    "component calls the notify route");
  const rpcAt = comp.indexOf("reply_workteams_authenticated_customer_request");
  const notifyAt = comp.indexOf("/api/portal/customer-reply-notify");
  assert.ok(rpcAt !== -1 && notifyAt > rpcAt, "notify fires after the reply RPC");
});

test("notifications page honesty wording matches what now sends", () => {
  const page = read(PREFS_PAGE);
  const repliesBlock = page.slice(page.indexOf('key: "customer_replies"'), page.indexOf('key: "pay"'));
  assert.ok(repliesBlock.includes("These honor your choice now."),
    "customer replies help says the choice is honored now");
  assert.ok(!repliesBlock.includes("don't send phone notifications yet"),
    "customer replies help no longer claims nothing sends");
  // Still true, still stated: the pay category has no member push yet.
  const payBlock = page.slice(page.indexOf('key: "pay"'));
  assert.ok(payBlock.includes("don't send phone notifications yet"),
    "pay help stays honest");
});
