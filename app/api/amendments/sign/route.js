import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Public: client signs a contract amendment in the portal.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`amend-sign:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

    const { sign_token, name, signature_image } = await req.json();
    if (!sign_token || !name?.trim()) {
      return NextResponse.json({ error: "Signature name is required." }, { status: 400 });
    }
    const client = sb();
    const { data: amendment, error } = await client
      .from("contract_amendments")
      .select("id, status, contract_id")
      .eq("sign_token", sign_token)
      .maybeSingle();
    if (error) {
      console.error("amendment sign lookup error", error);
      return NextResponse.json({ error: "Could not sign the amendment." }, { status: 500 });
    }
    if (!amendment) return NextResponse.json({ error: "Amendment not found." }, { status: 404 });
    if (amendment.status === "signed") {
      return NextResponse.json({ error: "This amendment is already signed." }, { status: 409 });
    }
    if (amendment.status === "declined") {
      return NextResponse.json({ error: "This amendment was declined." }, { status: 409 });
    }

    const { error: upErr } = await client
      .from("contract_amendments")
      .update({
        status: "signed",
        signed_name: name.trim(),
        signed_at: new Date().toISOString(),
        signature_image: signature_image || null,
      })
      .eq("id", amendment.id);
    if (upErr) {
      console.error("amendment sign update error", upErr);
      return NextResponse.json({ error: "Could not sign the amendment." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("amendment sign error", e);
    return NextResponse.json({ error: "Could not sign the amendment." }, { status: 500 });
  }
}
