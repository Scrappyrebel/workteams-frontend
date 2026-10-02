import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

async function authedUser(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser();
  return user || null;
}

// POST { companyId, subscription: { endpoint, keys: { p256dh, auth } } }
// Saves (or refreshes) this device's push subscription for the member.
export async function POST(req) {
  try {
    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { companyId, subscription } = await req.json();
    if (!companyId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "companyId and subscription required" }, { status: 400 });
    }

    const sb = admin();
    const { data: member } = await sb
      .from("company_members")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 });

    const { error } = await sb.from("push_subscriptions").upsert(
      {
        company_id: companyId,
        member_id: member.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: "member_id,endpoint" }
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("push subscribe error", e);
    return NextResponse.json({ error: "Could not save notification settings." }, { status: 500 });
  }
}
