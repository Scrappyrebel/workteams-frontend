import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function tryEmail({ to, subject, text, fromName }) {
  const key = process.env.RESEND_API_KEY;
  const domain = (process.env.RESEND_FROM_DOMAIN || "lillybsjanitorial.com").trim();
  const from = fromName
    ? `${fromName} <noreply@${domain}>`
    : process.env.RESEND_FROM || `WorkTeams <noreply@${domain}>`;
  if (!key || !to) return { ok: false, reason: !key ? "missing-key" : "missing-to" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => "");
    console.error("resend error", res.status, body.slice(0, 300));
    return { ok: false, reason: `resend-${res.status}`, detail: body.slice(0, 200) };
  } catch (e) {
    console.error("resend fetch failed", e?.message);
    return { ok: false, reason: "fetch-failed" };
  }
}

// POST /api/bids/send — emails the client their approval link (Resend).
// Body: { bidId, to } — caller must be an authenticated manager/owner;
// verified via the Supabase access token in the Authorization header.
// Always returns the link too, so the sender can text it manually.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`bid-send:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

    const authHeader = req.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!accessToken) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { bidId, to } = await req.json();
    if (!bidId || !to || typeof to !== "string" || !to.includes("@")) {
      return NextResponse.json({ error: "A bid and a valid client email are required." }, { status: 400 });
    }

    // Verify the caller belongs to the bid's company as owner/admin.
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const client = sb();
    const { data: bid } = await client
      .from("bids")
      .select("id, company_id, title, client_name, approve_token, companies(name)")
      .eq("id", bidId)
      .maybeSingle();
    if (!bid) return NextResponse.json({ error: "Bid not found." }, { status: 404 });

    const { data: membership } = await client
      .from("company_members")
      .select("role")
      .eq("company_id", bid.company_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Only an owner or manager can send bids." }, { status: 403 });
    }

    let token = bid.approve_token;
    if (!token) {
      token = makeToken();
      const { error } = await client.from("bids").update({ approve_token: token, status: "sent" }).eq("id", bidId);
      if (error) return NextResponse.json({ error: "Could not prepare the bid link." }, { status: 500 });
    }

    const appUrl = process.env.WORKTEAMS_APP_URL || "https://app.lillybsjanitorial.com";
    const link = `${appUrl}/bid/${token}`;
    const companyName = bid.companies?.name || "us";
    const result = await tryEmail({
      to: to.trim(),
      subject: `Your cleaning proposal from ${companyName}`,
      text: `Hi ${bid.client_name || "there"},\n\n${companyName} has prepared a cleaning proposal for you: ${bid.title}.\n\nReview and accept or decline it here:\n${link}\n\nThanks!`,
      fromName: companyName,
    });
    const emailed = result.ok;

    // Stash the email on the bid for next time.
    await client.from("bids").update({ client_email: to.trim() }).eq("id", bidId);

    return NextResponse.json({ ok: true, emailed, link, emailDebug: emailed ? undefined : `${result.reason}: ${result.detail || "no detail"}` });
  } catch (e) {
    console.error("bid send error", e);
    return NextResponse.json({ error: "Could not send the bid." }, { status: 500 });
  }
}
