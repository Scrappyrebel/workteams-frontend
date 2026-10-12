import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Public: submit a temp cleaner application.
// FCRA note: the client MUST show a standalone background-check disclosure
// and collect explicit written authorization BEFORE calling this. We record
// both timestamps here. Body: { fullName, email, phone?, dateOfBirth?,
// address?, experience?, availability?, bgConsent: true, bgDisclosureShownAt }
export async function POST(req) {
  try {
    const rl = checkRateLimit(`temp-apply:${clientIp(req)}`, { limit: 5, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const b = await req.json();
    const fullName = String(b.fullName || "").trim();
    const email = String(b.email || "").trim().toLowerCase();

    if (!fullName || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
    }
    // Background-check authorization is mandatory — no consent, no application.
    if (b.bgConsent !== true || !b.bgDisclosureShownAt) {
      return NextResponse.json(
        { error: "Background-check authorization is required to apply." },
        { status: 400 }
      );
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: cfg } = await db
      .from("temp_agency_config")
      .select("company_id")
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();
    if (!cfg) {
      return NextResponse.json({ error: "Applications are not open right now." }, { status: 503 });
    }

    // One application per email per agency.
    const { data: existing } = await db
      .from("temp_applications")
      .select("id")
      .eq("company_id", cfg.company_id)
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "You already have an application on file. We'll be in touch." },
        { status: 409 }
      );
    }

    const { error: insErr } = await db.from("temp_applications").insert({
      company_id: cfg.company_id,
      full_name: fullName.slice(0, 200),
      email: email.slice(0, 320),
      phone: String(b.phone || "").slice(0, 40) || null,
      date_of_birth: b.dateOfBirth || null,
      address: String(b.address || "").slice(0, 500) || null,
      bg_check_disclosure_shown_at: b.bgDisclosureShownAt,
      bg_check_consent: true,
      bg_check_consent_at: new Date().toISOString(),
      bg_check_status: "pending",
      experience: String(b.experience || "").slice(0, 2000) || null,
      availability: String(b.availability || "").slice(0, 2000) || null,
      status: "applied",
    });
    if (insErr) {
      return NextResponse.json({ error: "Could not submit your application." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Application failed. Try again." }, { status: 500 });
  }
}
