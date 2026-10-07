import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Public: client e-signs with a typed name and optional drawn signature.
// Records name, timestamp, IP, and signature image as the audit trail.
// Token-gated; no login required.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`contract-sign:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

    const { token, name, signatureImage } = await req.json();
    if (!token || !name || !name.trim()) {
      return NextResponse.json({ error: "Token and printed name are required." }, { status: 400 });
    }
    if (signatureImage != null) {
      if (typeof signatureImage !== "string" || !signatureImage.startsWith("data:image/png;base64,")) {
        return NextResponse.json({ error: "Invalid signature image." }, { status: 400 });
      }
      if (signatureImage.length > 300_000) {
        return NextResponse.json({ error: "Signature image is too large." }, { status: 400 });
      }
    }
    const client = sb();
    const { data: c } = await client
      .from("contracts")
      .select("id, status, company_id, location_id, client_email, client_name, title")
      .eq("sign_token", token)
      .maybeSingle();
    if (!c) return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    if (c.status === "signed") return NextResponse.json({ error: "This contract is already signed." }, { status: 409 });
    if (!["sent", "viewed", "draft"].includes(c.status)) {
      return NextResponse.json({ error: "This contract can no longer be signed." }, { status: 409 });
    }
    const { error } = await client
      .from("contracts")
      .update({
        status: "signed",
        signed_at: new Date().toISOString(),
        signed_name: name.trim(),
        signed_ip: clientIp(req),
        signature_image: signatureImage || null,
      })
      .eq("id", c.id);
    if (error) return NextResponse.json({ error: "Signing failed. Try again." }, { status: 500 });

    // Auto-send the client portal link (best effort — signing already succeeded).
    try {
      if (c.client_email && c.client_email.includes("@")) {
        const { data: company } = await client
          .from("companies")
          .select("name")
          .eq("id", c.company_id)
          .maybeSingle();
        // Find an existing portal token for this location, or create one.
        let portalToken = null;
        if (c.location_id) {
          const { data: existing } = await client
            .from("portal_tokens")
            .select("token")
            .eq("company_id", c.company_id)
            .eq("location_id", c.location_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          portalToken = existing?.token || null;
        }
        if (!portalToken) {
          const bytes = crypto.getRandomValues(new Uint8Array(32));
          portalToken = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
          await client.from("portal_tokens").insert({
            company_id: c.company_id,
            location_id: c.location_id,
            token: portalToken,
            client_name: c.client_name || name.trim(),
          });
        }
        const appUrl = process.env.WORKTEAMS_APP_URL || "https://app.lillybsjanitorial.com";
        const portalUrl = `${appUrl}/portal/${portalToken}`;
        const key = process.env.RESEND_API_KEY;
        if (key) {
          const domain = (process.env.RESEND_FROM_DOMAIN || "lillybsjanitorial.com").trim();
          const fromName = company?.name || "WorkTeams";
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: `${fromName} <noreply@${domain}>`,
              to: c.client_email,
              subject: `Your customer portal — ${fromName}`,
              text: `Hi ${name.trim()},\n\nThanks for signing! Here's your customer portal where you can:\n- View your contract and scope of work\n- Request extra or heavy cleans\n- Send us a message anytime\n\n${portalUrl}\n\nBookmark this link — it's your direct access, no password needed.\n\n— ${fromName}`,
            }),
          });
        }
      }
    } catch (e) {
      console.error("portal invite email failed", e?.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("contract sign error", e);
    return NextResponse.json({ error: "Signing failed. Try again." }, { status: 500 });
  }
}
