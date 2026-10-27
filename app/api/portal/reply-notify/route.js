import { createClient } from "@supabase/supabase-js";
import { appUrlFrom } from "../../../../lib/app-url";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

// Customer email notice for a management reply in the portal conversation
// (migration 071). The reply POST itself queues one
// portal_reply_notifications row per business reply; this route is called
// by the manager inbox right after a reply saves and performs the actual
// send through the same Resend transport the invoice delivery uses.
//
// Honesty rules, matching the invoice sender:
//   - The email NEVER contains the reply text. It only says a reply is
//     waiting and links to the customer portal (standing privacy rule).
//   - A notification is recorded 'sent' only after Resend accepts it.
//     A missing RESEND_API_KEY, a Resend error or a network failure
//     leaves the row 'pending' with the reason in last_error, so the
//     notice is never falsely reported as delivered.
//   - Requests from the shared location link have no customer email
//     anywhere in the schema; their rows are 'no_recipient' and no send
//     is attempted. Those customers see the in-portal "new reply" flag.

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
const esc = (s) => String(s ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

async function tryEmail({ to, subject, text, html, fromName }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: "missing-key" };
  if (!to) return { ok: false, reason: "missing-to" };
  const domain = process.env.RESEND_FROM_DOMAIN || "lillybsjanitorial.com";
  const from = process.env.RESEND_FROM || `${fromName} <noreply@${domain}>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    if (!r.ok) return { ok: false, reason: `resend-${r.status}` };
    const j = await r.json().catch(() => ({}));
    return { ok: true, id: j?.id || null };
  } catch {
    return { ok: false, reason: "fetch-failed" };
  }
}

const COPY = {
  en: {
    subject: (name) => `New reply from ${name} about your service request`,
    body: (name, link) =>
      `Hello,\n\n${name} replied to your service request. Sign in to your customer portal to read the reply and respond:\n${link}\n\nFor your privacy, the reply itself is not included in this email.\n\nThank you!`,
    open: "Open my portal",
  },
  es: {
    subject: (name) => `Nueva respuesta de ${name} sobre su solicitud de servicio`,
    body: (name, link) =>
      `Hola,\n\n${name} respondió a su solicitud de servicio. Inicie sesión en su portal de cliente para leer la respuesta y responder:\n${link}\n\nPor su privacidad, la respuesta no se incluye en este correo.\n\n¡Gracias!`,
    open: "Abrir mi portal",
  },
};

export async function POST(req) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: PRIVATE });
    const rl = checkRateLimit(`portal-reply-notify:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
    if (!rl.ok) return Response.json({ ok: false, error: "rate-limited" }, { status: 429, headers: PRIVATE });

    const { replyId } = await req.json().catch(() => ({}));
    if (!replyId) return Response.json({ ok: false, error: "missing-reply" }, { status: 400, headers: PRIVATE });

    const { data: userData } = await userClient(token).auth.getUser();
    const user = userData?.user;
    if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: PRIVATE });

    const db = svc();
    const { data: notice } = await db.from("portal_reply_notifications")
      .select("id, reply_id, portal_message_id, company_id, recipient_email, recipient_language, status, attempt_count")
      .eq("reply_id", replyId).maybeSingle();
    // No row: the reply predates migration 071. Nothing to send; the
    // reply flow itself is unaffected.
    if (!notice) return Response.json({ ok: true, emailed: false, reason: "no-notification" }, { headers: PRIVATE });

    const { data: member } = await db.from("company_members")
      .select("role").eq("company_id", notice.company_id).eq("user_id", user.id).maybeSingle();
    if (!member || !["owner", "admin"].includes(member.role)) {
      return Response.json({ ok: false, error: "forbidden" }, { status: 403, headers: PRIVATE });
    }

    if (notice.status === "sent") {
      return Response.json({ ok: true, emailed: true, already: true }, { headers: PRIVATE });
    }
    if (notice.status === "no_recipient" || !notice.recipient_email) {
      return Response.json({ ok: true, emailed: false, reason: "no-recipient" }, { headers: PRIVATE });
    }

    // Every still-pending notice for this same conversation and recipient
    // is covered by this one email, so a customer never gets one email
    // per reply when earlier sends were delayed.
    const { data: pendingRows } = await db.from("portal_reply_notifications")
      .select("id, attempt_count")
      .eq("portal_message_id", notice.portal_message_id)
      .eq("status", "pending")
      .eq("recipient_email", notice.recipient_email);
    const rows = pendingRows?.length ? pendingRows : [notice];

    const { data: company } = await db.from("companies")
      .select("name").eq("id", notice.company_id).maybeSingle();
    const companyName = company?.name || "WorkTeams";
    const lang = notice.recipient_language === "es" ? "es" : "en";
    const copy = COPY[lang];
    const link = `${appUrlFrom(req)}/customer-portal`;
    const subject = copy.subject(companyName);
    const text = copy.body(companyName, link);
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17233b">`
      + `<h2 style="color:#1d4ed8">${esc(subject)}</h2>`
      + `<p>${esc(text).replace(/\n/g, "<br/>")}</p>`
      + `<p><a href="${esc(link)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700">${esc(copy.open)}</a></p></div>`;

    const sent = await tryEmail({ to: notice.recipient_email, subject, text, html, fromName: companyName });
    const stamp = new Date().toISOString();
    // Record the outcome on every covered row. On success the rows become
    // 'sent'; on failure they stay 'pending' with the reason kept in
    // last_error — never falsely marked sent.
    for (const row of rows) {
      await db.from("portal_reply_notifications").update(sent.ok
        ? { status: "sent", sent_at: stamp, last_error: null,
            attempt_count: (row.attempt_count ?? 0) + 1, updated_at: stamp }
        : { last_error: sent.reason,
            attempt_count: (row.attempt_count ?? 0) + 1, updated_at: stamp }
      ).eq("id", row.id);
    }
    if (sent.ok) {
      return Response.json({ ok: true, emailed: true, flushed: rows.length }, { headers: PRIVATE });
    }
    return Response.json({ ok: true, emailed: false, reason: sent.reason }, { headers: PRIVATE });
  } catch {
    return Response.json({ ok: false, error: "server-error" }, { status: 500, headers: PRIVATE });
  }
}
