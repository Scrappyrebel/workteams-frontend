import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Manager-only CRUD for temp client profiles (POINT 1 intake).
// Auth: Bearer token of a company member; manager check via is_company_manager.

async function managerDb(req, companyId) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/, "");
  if (!token) return { error: "Sign in required." };
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Sign in required." };
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: ok } = await db.rpc("is_company_manager", { p_company_id: companyId });
  // Fallback if the RPC signature differs: check company_members role.
  let isMgr = !!ok;
  if (!isMgr) {
    const { data: m } = await db
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    isMgr = !!m && ["owner", "admin", "manager"].includes(m.role);
  }
  if (!isMgr) return { error: "Managers only." };
  return { db };
}

const FIELDS = [
  "staffing_type", "business_name", "contact_first", "contact_last", "phone",
  "email", "billing_address", "invoice_method", "payment_terms", "site_address",
  "site_city", "site_zip", "facility_type", "supplies_provider", "access_info",
  "parking_info", "on_site_contact_name", "on_site_contact_phone",
  "task_checklist", "off_limits", "dress_code", "hazards", "ppe_required",
  "min_experience", "bg_check_required", "drug_test_required", "do_not_return",
  "notes",
];

function pick(b) {
  const o = {};
  for (const f of FIELDS) {
    if (b[f] !== undefined) o[f] = b[f];
  }
  return o;
}

// GET ?companyId= -> list profiles
export async function GET(req) {
  try {
    const rl = checkRateLimit(`temp-clients:${clientIp(req)}`, { limit: 60, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    if (!companyId) return NextResponse.json({ error: "companyId required." }, { status: 400 });
    const { db, error } = await managerDb(req, companyId);
    if (error) return NextResponse.json({ error }, { status: 403 });
    const { data, error: qErr } = await db
      .from("temp_client_profiles")
      .select("*")
      .eq("company_id", companyId)
      .order("business_name");
    if (qErr) return NextResponse.json({ error: "Client profiles unavailable." }, { status: 500 });
    return NextResponse.json({ profiles: data || [] });
  } catch {
    return NextResponse.json({ error: "Client profiles unavailable." }, { status: 500 });
  }
}

// POST { companyId, ...fields } -> create
export async function POST(req) {
  try {
    const rl = checkRateLimit(`temp-clients:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const b = await req.json();
    const companyId = b.companyId;
    if (!companyId || !String(b.business_name || "").trim()) {
      return NextResponse.json({ error: "Company and business name are required." }, { status: 400 });
    }
    const { db, error } = await managerDb(req, companyId);
    if (error) return NextResponse.json({ error }, { status: 403 });
    const { data, error: insErr } = await db
      .from("temp_client_profiles")
      .insert({ company_id: companyId, ...pick(b) })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ error: "Could not save the client profile." }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch {
    return NextResponse.json({ error: "Could not save the client profile." }, { status: 500 });
  }
}

// PUT { id, companyId, ...fields } -> update
export async function PUT(req) {
  try {
    const b = await req.json();
    const { id, companyId } = b;
    if (!id || !companyId) return NextResponse.json({ error: "id and companyId required." }, { status: 400 });
    const { db, error } = await managerDb(req, companyId);
    if (error) return NextResponse.json({ error }, { status: 403 });
    const { error: upErr } = await db
      .from("temp_client_profiles")
      .update({ ...pick(b), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", companyId);
    if (upErr) return NextResponse.json({ error: "Could not update the client profile." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not update the client profile." }, { status: 500 });
  }
}

// DELETE ?id=&companyId= -> delete
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const companyId = searchParams.get("companyId");
    if (!id || !companyId) return NextResponse.json({ error: "id and companyId required." }, { status: 400 });
    const { db, error } = await managerDb(req, companyId);
    if (error) return NextResponse.json({ error }, { status: 403 });
    const { error: delErr } = await db
      .from("temp_client_profiles")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (delErr) return NextResponse.json({ error: "Could not delete the client profile." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete the client profile." }, { status: 500 });
  }
}
