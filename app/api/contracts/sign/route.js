import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Public: client e-signs with a typed name. Records name, timestamp, and IP
// as the audit trail. Token-gated; no login required.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`contract-sign:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

    const { token, name } = await req.json();
    if (!token || !name || !name.trim()) {
      return NextResponse.json({ error: "Token and printed name are required." }, { status: 400 });
    }
    const client = sb();
    const { data: c } = await client
      .from("contracts")
      .select("id, status")
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
      })
      .eq("id", c.id);
    if (error) return NextResponse.json({ error: "Signing failed. Try again." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("contract sign error", e);
    return NextResponse.json({ error: "Signing failed. Try again." }, { status: 500 });
  }
}
