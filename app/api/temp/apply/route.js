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

    // Full onboarding payload (POINT 3). Tolerant: falls back to the
    // basic insert if migration 048 hasn't run yet.
    const num = (v) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    };
    const full = {
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
      emergency_contact_name: String(b.emergencyName || "").slice(0, 200) || null,
      emergency_contact_relation: String(b.emergencyRelation || "").slice(0, 100) || null,
      emergency_contact_phone: String(b.emergencyPhone || "").slice(0, 40) || null,
      city: String(b.city || "").slice(0, 120) || null,
      zip: String(b.zip || "").slice(0, 20) || null,
      earliest_start: b.earliestStart || null,
      latest_end: b.latestEnd || null,
      max_hours_per_week: num(b.maxHours),
      reliable_transportation: b.transportation === true ? true : b.transportation === false ? false : null,
      years_experience: num(b.yearsExperience),
      staffing_types: Array.isArray(b.staffingTypes) && b.staffingTypes.length > 0 ? b.staffingTypes : ["cleaning"],
      drug_policy_ack: b.drugPolicyAck === true,
      drug_policy_ack_at: b.drugPolicyAck === true ? new Date().toISOString() : null,
      reference_1_name: String(b.ref1Name || "").slice(0, 200) || null,
      reference_1_phone: String(b.ref1Phone || "").slice(0, 40) || null,
      reference_2_name: String(b.ref2Name || "").slice(0, 200) || null,
      reference_2_phone: String(b.ref2Phone || "").slice(0, 40) || null,
      i9_completed: b.i9Completed === true ? true : b.i9Completed === false ? false : null,
      everify_status: ["yes", "no", "not_required"].includes(b.everifyStatus) ? b.everifyStatus : null,
      extra_answers: b.extraAnswers && typeof b.extraAnswers === "object" ? b.extraAnswers : {},
      onboarding_completed: true,
    };
    let { error: insErr } = await db.from("temp_applications").insert(full);
    if (insErr && /column/i.test(insErr.message)) {
      // Pre-048: insert just the original columns.
      const basic = {
        company_id: full.company_id,
        full_name: full.full_name,
        email: full.email,
        phone: full.phone,
        date_of_birth: full.date_of_birth,
        address: full.address,
        bg_check_disclosure_shown_at: full.bg_check_disclosure_shown_at,
        bg_check_consent: true,
        bg_check_consent_at: full.bg_check_consent_at,
        bg_check_status: "pending",
        experience: full.experience,
        availability: full.availability,
        status: "applied",
      };
      ({ error: insErr } = await db.from("temp_applications").insert(basic));
    }
    if (insErr) {
      return NextResponse.json({ error: "Could not submit your application." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Application failed. Try again." }, { status: 500 });
  }
}
