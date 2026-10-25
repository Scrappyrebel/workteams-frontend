import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const reply = (data, status = 200) =>
  NextResponse.json(data, { status, headers: PRIVATE_HEADERS });
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Two-way conversation for one request on a shared location link
// (migration 065). The SECURITY DEFINER RPCs re-validate the exact token and
// request ownership in the database; this route only rate-limits and relays
// their whitelisted results. Without `body` it reads the thread; with `body`
// it appends a customer reply and alerts management.
export async function POST(req) {
  try {
    const submitted = await req.json();
    const { token, message_id, body } = submitted || {};
    if (typeof token !== "string" || !token || token.length > 128)
      return reply({ ok: false, error: "This location link is not valid." }, 400);
    if (typeof message_id !== "string" || !UUID_RE.test(message_id))
      return reply(
        { ok: false, error: "This request is not available on this link." },
        400
      );
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    if (body !== undefined) {
      const rl = checkRateLimit(`portal-conversation-reply:${clientIp(req)}`, {
        limit: 10,
        windowMs: 60_000,
      });
      if (!rl.ok)
        return reply(
          { ok: false, error: "Too many replies. Try again shortly." },
          429
        );
      if (typeof body !== "string" || !body.trim() || body.length > 1600)
        return reply(
          { ok: false, error: "Write a reply of 1 to 1600 characters." },
          400
        );
      const { data, error } = await sb.rpc("reply_to_portal_message_with_token", {
        tok: token,
        p_message_id: message_id,
        p_body: body,
      });
      if (error) {
        console.error("portal conversation reply failed", error.message);
        return reply(
          {
            ok: false,
            error:
              "Reply status could not be confirmed. Check with the business before retrying.",
          },
          503
        );
      }
      return reply(data, data?.ok === true ? 200 : 400);
    }
    const rl = checkRateLimit(`portal-conversation:${clientIp(req)}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.ok)
      return reply({ ok: false, error: "Too many requests. Try again shortly." }, 429);
    const { data, error } = await sb.rpc("get_portal_message_conversation", {
      tok: token,
      p_message_id: message_id,
    });
    if (error) {
      console.error("portal conversation read failed", error.message);
      return reply(
        { ok: false, error: "Conversation could not be loaded. Try again." },
        503
      );
    }
    return reply(data, data?.ok === true ? 200 : 400);
  } catch (err) {
    console.error("portal conversation request failed", err);
    return reply(
      { ok: false, error: "Conversation status could not be confirmed." },
      503
    );
  }
}
