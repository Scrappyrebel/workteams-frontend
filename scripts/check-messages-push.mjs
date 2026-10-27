import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Crew-chat push wiring (audit item A2) invariants:
// * The push stack already existed (web-push sender in lib/push.js,
//   push_subscriptions from migration 029, per-category preferences from
//   migration 068) — but the "messages" category had no send path: crew
//   chat posted straight into the messages table and nobody was pushed.
// * POST /api/messages/notify closes that gap in the schedule-request
//   notify route's own pattern: signed-in sender only, sender can only
//   announce their own message, recipients are the rest of the company,
//   and each recipient's saved "messages" preference is honored through
//   lib/notification-prefs.js (missing table / no row = all on).
// * The chat page asks for the inserted id and fire-and-forgets the
//   notify call AFTER the message saves; a failed notify never affects
//   the message.
// * Honesty wording moves only where it became false: the notifications
//   page "messages" help now says the choice is honored, while the
//   customer_replies and pay categories — still without a member push —
//   keep the "don't send phone notifications yet" note.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in the new route.

const ROUTE = "app/api/messages/notify/route.js";
const CHAT_PAGE = "app/app/[companyId]/messages/page.js";
const PREFS_PAGE = "app/app/[companyId]/notifications/page.js";

test("message notify route sends pushes honoring the messages preference", () => {
  assert.ok(existsSync(ROUTE), "message notify route exists");
  const route = read(ROUTE);
  for (const needle of [
    "lib/push",
    "sendPush",
    "pushConfigured",
    "getNotificationPrefs",
    "wantsNotification",
    '"messages"',
    "push_subscriptions",
    "company_members",
    '.from("messages")',
    "message.sender_id !== actor.id",
    "appUrlFrom",
    "/messages`",
    "crew-message-",
  ]) assert.ok(route.includes(needle), `route contains: ${needle}`);
  // Protected areas: the route touches none of them.
  for (const banned of ["time_entries", "shift_videos", "communication_book", "comm_book"])
    assert.ok(!route.includes(banned), `route stays out of: ${banned}`);
});

test("chat page notifies after the message saves", () => {
  const page = read(CHAT_PAGE);
  assert.ok(page.includes("/api/messages/notify"), "chat page calls the notify route");
  assert.ok(page.includes('.select("id")'), "chat page reads back the inserted id");
  assert.ok(page.includes("inserted?.[0]?.id"), "notify uses the saved message id");
  // The notify call happens in the success branch, after the insert.
  const insertAt = page.indexOf('.from("messages").insert');
  const notifyAt = page.indexOf("if (messageId) notify(messageId);");
  assert.ok(insertAt !== -1 && notifyAt > insertAt, "notify fires after the insert succeeds");
});

test("notifications page honesty wording matches what now sends", () => {
  const page = read(PREFS_PAGE);
  const messagesBlock = page.slice(page.indexOf('key: "messages"'), page.indexOf('key: "customer_replies"'));
  assert.ok(messagesBlock.includes("These honor your choice now."),
    "messages help says the choice is honored now");
  assert.ok(!messagesBlock.includes("don't send phone notifications yet"),
    "messages help no longer claims nothing sends");
  // Still true, still stated: these two categories have no member push yet.
  const repliesBlock = page.slice(page.indexOf('key: "customer_replies"'), page.indexOf('key: "pay"'));
  assert.ok(repliesBlock.includes("don't send phone notifications yet"),
    "customer replies help stays honest");
  const payBlock = page.slice(page.indexOf('key: "pay"'));
  assert.ok(payBlock.includes("don't send phone notifications yet"),
    "pay help stays honest");
});
