import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function validToken(token) {
  const { data } = await sb()
    .from("portal_tokens")
    .select("id, company_id, location_id")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  // Expiry is enforced in get_portal_data; re-check here for writes.
  const { data: t } = await sb().from("portal_tokens").select("expires_at").eq("id", data.id).single();
  if (t?.expires_at && new Date(t.expires_at) < new Date()) return null;
  return data;
}

async function tryEmail({ to, subject, text }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || `WorkTeams <noreply@${process.env.RESEND_FROM_DOMAIN || "lillybsjanitorial.com"}>`;
  if (!key || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Public: client "Contact us" form. Saves to the company inbox AND emails
// the company immediately (when email is configured).
export async function POST(req) {
  try {
    const rl = checkRateLimit(`portal-contact:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

    const { token, name, subject, body } = await req.json();
    if (!token || !body || !body.trim()) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }
    const pt = await validToken(token);
    if (!pt) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });

    const client = sb();
    const { data: msg, error } = await client
      .from("portal_messages")
      .insert({
        company_id: pt.company_id,
        location_id: pt.location_id,
        portal_token_id: pt.id,
        sender_name: (name || "").trim() || null,
        subject: (subject || "").trim() || null,
        body: body.trim(),
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: "Could not send message." }, { status: 500 });

    // Immediate email to the company owner (best effort).
    const { data: owner } = await client
      .from("company_members")
      .select("email")
      .eq("company_id", pt.company_id)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    const emailed = await tryEmail({
      to: owner?.email,
      subject: `Client message${subject ? `: ${subject}` : ""}`,
      text: `New message from your client portal${name ? ` (${name})` : ""}:\n\n${body.trim()}`,
    });
    if (emailed) await client.from("portal_messages").update({ emailed_at: new Date().toISOString() }).eq("id", msg.id);

    return NextResponse.json({ ok: true, emailed });
  } catch (e) {
    console.error("portal contact error", e);
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }
}
