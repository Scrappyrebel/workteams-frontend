import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

// Public client-portal lookup, rate-limited by IP. Data comes only from the
// get_portal_data() security-definer function (whitelisted fields).
export async function POST(req) {
  try {
    const rl = checkRateLimit(`portal:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Try again shortly." },
        { status: 429 }
      );
    }
    const { token } = await req.json();
    if (!token || typeof token !== "string" || token.length > 128) {
      return NextResponse.json({ ok: false, error: "This link is not valid." });
    }
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const { data, error } = await sb.rpc("get_portal_data", { tok: token });
    if (error) {
      console.error("portal lookup failed", error.message);
      return NextResponse.json({ ok: false, error: "Could not load this page. Please try again later." });
    }
    if(data?.ok!==true)return NextResponse.json(data);
    // Request history is whitelisted by a separate exact-token RPC.
    // Failure must never be mistaken for an empty inbox.
    const history=await sb.rpc("get_client_portal_request_history",{tok:token});
    if(history.error||history.data?.ok!==true||!Array.isArray(history.data.requests)){
      console.error("portal customer request history unavailable",history.error?.message||"invalid result");
      return NextResponse.json({...data,customer_requests:[],
        customer_requests_error:"Request status is temporarily unavailable. Please try again."});
    }
    return NextResponse.json({...data,customer_requests:history.data.requests,customer_requests_error:null});
  } catch (e) {
    console.error("portal lookup error", e);
    return NextResponse.json({ ok: false, error: "Could not load this page. Please try again later." });
  }
}
