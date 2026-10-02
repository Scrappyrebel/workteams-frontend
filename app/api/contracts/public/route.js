import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Public: fetch a contract by its signing token. Returns only what the
// client needs to read and sign — no company internals.
export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const { data, error } = await sb()
    .from("contracts")
    .select("client_name, terms_text, status, start_date, end_date, signed_at, signed_name, companies(name)")
    .eq("sign_token", token)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  if (data.status === "viewed" || data.status === "sent") {
    await sb().from("contracts").update({ status: "viewed" }).eq("sign_token", token);
    data.status = "viewed";
  }
  return NextResponse.json({ contract: data });
}
