// SERVER ONLY -- shared auth helpers for integration API routes.
// Never import from a client component: this module builds the
// service-role Supabase client, which bypasses RLS.
//
// The pattern matches the app's other server routes (Stripe checkout,
// tier prices): the browser sends its session access token as a Bearer
// header; we verify it with the anon key, then check the caller's
// company_members role. Integration work (connect, mapping, sync) is
// owner/admin only -- the same roles that can see invoices.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function serviceDb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function authedClient(token) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// Returns { ok: true, user, db } or { ok: false, status, error }.
// db is the service-role client; use it only after this check passes.
export async function requireManager(req, companyId) {
  if (!companyId) return { ok: false, status: 400, error: "Missing company" };
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401, error: "Sign in required" };
  const sb = authedClient(token);
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Sign in required" };
  const { data: member } = await sb
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .single();
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return { ok: false, status: 403, error: "Only owners and managers can manage connections" };
  }
  return { ok: true, user, db: serviceDb() };
}
