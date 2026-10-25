import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const all = (src, words, label) => {
  for (const x of words) assert.ok(src.includes(x), `Missing ${label}: ` + x);
};

const sql = read("supabase/065_client_portal_two_way_conversations.sql");
all(
  sql,
  [
    "create table if not exists public.portal_message_replies",
    "sender_role text not null check (sender_role in ('customer','business'))",
    "portal_message_id uuid not null references public.portal_messages(id) on delete cascade",
    "alter table public.portal_message_replies enable row level security",
    "grant select, insert, update, delete on public.portal_message_replies to authenticated",
    "grant all on public.portal_message_replies to service_role",
    "portal_message_replies read if owner/admin",
    "create or replace function public.post_portal_message_business_reply(",
    "create or replace function public.reply_to_portal_message_with_token(",
    "create or replace function public.reply_workteams_authenticated_customer_request(",
    "create or replace function public.get_portal_message_conversation(",
    "create or replace function public.get_workteams_authenticated_customer_conversation(",
    "create or replace function public.portal_message_visible_thread(",
    "workteams_customer_authorized_location(p_company_id,p_location_id)",
    "customer_portal_request:",
    "customer_portal_reply:",
    "portal_message_notify_management",
    "after insert on public.portal_messages",
    "set customer_response=v_body",
    "grant execute on function public.post_portal_message_business_reply(uuid,text)",
    "grant execute on function public.reply_to_portal_message_with_token(text,uuid,text)",
    "grant execute on function public.get_portal_message_conversation(text,uuid)",
    "grant execute on function public.get_workteams_authenticated_customer_conversation(uuid,uuid,uuid)",
  ],
  "two-way conversation migration rule"
);
// The shared-link conversation must keep the 051 privacy rule: no original
// message body/subject/sender in the token-scoped read.
const tokenReadStart = sql.indexOf(
  "create or replace function public.get_portal_message_conversation"
);
const tokenReadEnd = sql.indexOf(
  "create or replace function public.get_workteams_authenticated_customer_conversation"
);
assert.ok(tokenReadStart >= 0 && tokenReadEnd > tokenReadStart);
const tokenRead = sql.slice(tokenReadStart, tokenReadEnd);
assert.ok(
  !tokenRead.includes("'message',v_msg.body") &&
    !tokenRead.includes("v_msg.subject") &&
    !tokenRead.includes("v_msg.sender_name"),
  "Token conversation must not reveal original private message fields"
);

const manager = read("app/app/[companyId]/client-portal/page.js");
all(
  manager,
  [
    "post_portal_message_business_reply",
    'from("portal_message_replies")',
    'get("message")',
    "portal-message-${m.id}",
    "threadEntries(m)",
    "sendThreadReply(m)",
    "Reply to the customer",
    "Customer reply",
    "Management reply",
  ],
  "manager conversation rule"
);

const tokenPage = read("app/portal/[token]/page.js");
all(
  tokenPage,
  [
    "/api/portal/conversation",
    "toggleConversation(r)",
    "sendPortalReply(r)",
    "Reply saved. Management has been alerted.",
    "View conversation & reply",
  ],
  "token conversation rule"
);
assert.ok(!tokenPage.includes("r.body"), "Shared token must not render original message");
assert.ok(!tokenPage.includes("r.sender_name"), "Shared token must not render sender name");

const conversationRoute = read("app/api/portal/conversation/route.js");
all(
  conversationRoute,
  [
    "get_portal_message_conversation",
    "reply_to_portal_message_with_token",
    "portal-conversation-reply:",
    "Cache-Control",
  ],
  "conversation route rule"
);

const contactRoute = read("app/api/portal/contact/route.js");
all(
  contactRoute,
  ["client-portal?message=${msg.id}", "appUrlFrom"],
  "owner email deep link rule"
);

const requests = read("components/AuthenticatedCustomerRequests.js");
all(
  requests,
  [
    "get_workteams_authenticated_customer_conversation",
    "reply_workteams_authenticated_customer_request",
    "Reply saved. Management has been alerted.",
    "Reply to management",
    "toggleConversation(item)",
  ],
  "authenticated conversation rule"
);

const emergency = read("app/app/[companyId]/emergency/page.js");
all(
  emergency,
  ["customer_portal_", "client-portal?message=${portalMessageId(a)}", "Open customer request"],
  "alert deep link rule"
);

console.log(
  "WorkTeams two-way portal conversation, alerts and deep links regression passed."
);
