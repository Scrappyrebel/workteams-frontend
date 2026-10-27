import { createClient } from "@supabase/supabase-js";
import { appUrlFrom } from "../../../../lib/app-url";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import { pushCustomerReplyToManagement } from "../../../../lib/customer-reply-push";

// Member phone push for a customer reply posted in the AUTHENTICATED
// portal (the reply_workteams_authenticated_customer_request RPC,
// migration 065). The customer component calls this route right after
// the reply saves; the shared-link path needs no call here because the
// conversation route notifies server-side after its own reply RPC.
//
// The reply RPC already authorized the caller as the verified contact
// for this exact location moments earlier. This route re-checks the
// trigger before pushing: signed-in caller, an identity link tying the
// caller to the request's contact, a real customer reply row on this
// exact thread, and freshness — only a just-posted reply (10 minutes)
// can trigger a push, so an old reply id can never be replayed. The
// push itself is best-effort and never affects the saved reply.

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } });
}
function userClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } } });
}

const PRIVATE = { "Content-Type": "application/json", "Cache-Control": "private, no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_MS = 10 * 60_000;

export async function POST(req) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: PRIVATE });
    const rl = checkRateLimit(`portal-customer-reply-notify:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
    if (!rl.ok) return Response.json({ ok: false, error: "rate-limited" }, { status: 429, headers: PRIVATE });

    const { companyId, locationId, messageId, replyId } = await req.json().catch(() => ({}));
    if (![companyId, locationId, messageId, replyId].every((v) => typeof v === "string" && UUID_RE.test(v))) {
      return Response.json({ ok: false, error: "missing-reply" }, { status: 400, headers: PRIVATE });
    }

    const { data: userData } = await userClient(token).auth.getUser();
    const user = userData?.user;
    if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: PRIVATE });

    const db = svc();

    // The reply row: a customer reply on this exact thread of this
    // company, posted just now. Anything else is a quiet no-op — the
    // reply flow itself is never disturbed from here.
    const { data: replyRow } = await db.from("portal_message_replies")
      .select("id, portal_message_id, company_id, sender_role, created_at")
      .eq("id", replyId).maybeSingle();
    if (!replyRow || replyRow.sender_role !== "customer"
      || replyRow.portal_message_id !== messageId || replyRow.company_id !== companyId) {
      return Response.json({ ok: true, pushed: 0, reason: "no-match" }, { headers: PRIVATE });
    }
    if (Date.now() - new Date(replyRow.created_at).getTime() > FRESH_MS) {
      return Response.json({ ok: true, pushed: 0, reason: "stale" }, { headers: PRIVATE });
    }

    // The request must be an authenticated-portal request (never a
    // shared-link one) at the caller's location, tied to a contact.
    const { data: msg } = await db.from("portal_messages")
      .select("id, company_id, location_id, customer_contact_id, portal_token_id")
      .eq("id", messageId).maybeSingle();
    if (!msg || msg.company_id !== companyId || msg.location_id !== locationId
      || !msg.customer_contact_id || msg.portal_token_id) {
      return Response.json({ ok: true, pushed: 0, reason: "no-match" }, { headers: PRIVATE });
    }

    // The caller must be the signed-in identity linked to that contact —
    // the same identity the reply RPC authorized to post the reply.
    const { data: link } = await db.from("client_portal_identity_links")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("contact_id", msg.customer_contact_id)
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("revoked_at", null)
      .not("verified_at", "is", null)
      .maybeSingle();
    if (!link) return Response.json({ ok: false, error: "forbidden" }, { status: 403, headers: PRIVATE });

    const result = await pushCustomerReplyToManagement(db, {
      messageId,
      replyId,
      baseUrl: appUrlFrom(req),
    });
    return Response.json({ ok: true, pushed: result.pushed, held: result.held }, { headers: PRIVATE });
  } catch {
    return Response.json({ ok: false, error: "server-error" }, { status: 500, headers: PRIVATE });
  }
}
