import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import {
  resolveTempAgencyCompanyId,
  getTempAgencyConfig,
} from "../../../../lib/temp-agency";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Default per-service bill rates (per cleaner, per hour) used when the
// agency hasn't set its own yet.
export const DEFAULT_SERVICE_RATES = {
  commercial: 25,
  residential: 25,
  move_in_out: 25,
  construction_cleanup: 30,
  day_janitorial: 26,
  other: 26,
};

export function mergeServiceRates(stored) {
  return { ...DEFAULT_SERVICE_RATES, ...(stored || {}) };
}

export const SERVICE_TYPES = [
  { key: "commercial", label: "Commercial Cleaning" },
  { key: "residential", label: "Residential Cleaning" },
  { key: "move_in_out", label: "Move In / Move Out" },
  { key: "construction_cleanup", label: "New Build Construction Cleanup" },
  { key: "day_janitorial", label: "Day Janitorial (Long Term)" },
  { key: "other", label: "Other Janitorial / Home Cleaning" },
];

// Public: returns the temp agency's bookable config (rates only — no PII).
// The agency is named by ?agency=<company_id> (see lib/temp-agency for the
// resolution rules); the response echoes it back as agencyId so the caller
// can pin its booking/application POST to the same company.
export async function GET(req) {
  try {
    const rl = checkRateLimit(`temp-config:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const requested = new URL(req.url).searchParams.get("agency");
    const resolved = await resolveTempAgencyCompanyId(db, requested);
    if (!resolved.ok) {
      // Plain "nothing enabled" keeps the historic shape; a bad or
      // ambiguous agency link surfaces its reason to the page.
      if (resolved.code === "unavailable") {
        return NextResponse.json({ available: false }, { status: 200 });
      }
      return NextResponse.json(
        { available: false, agencyError: resolved.error },
        { status: 200 }
      );
    }
    const cfg = await getTempAgencyConfig(
      db,
      resolved.companyId,
      "company_id, base_hourly_rate, service_rates, hire_track_options, conversion_fee, staffing_types"
    );
    if (!cfg) {
      return NextResponse.json({ available: false }, { status: 200 });
    }
    const { data: co } = await db
      .from("companies")
      .select("name")
      .eq("id", cfg.company_id)
      .single();
    // Staffing lanes catalog (multi-type agencies). Tolerant if 048 hasn't run.
    let staffingCatalog = [];
    try {
      const { data: cat } = await db
        .from("temp_staffing_types")
        .select("key, label, description, default_skills, onboarding_fields")
        .order("label");
      if (cat) staffingCatalog = cat;
    } catch { /* pre-048 */ }
    return NextResponse.json({
      available: true,
      agencyId: cfg.company_id,
      agencyName: co?.name || "Temp Staffing",
      baseHourlyRate: Number(cfg.base_hourly_rate),
      serviceRates: mergeServiceRates(cfg.service_rates),
      hireTrackOptions: cfg.hire_track_options || [90, 180],
      conversionFee: Number(cfg.conversion_fee || 0),
      serviceTypes: SERVICE_TYPES,
      staffingTypes: cfg.staffing_types || ["cleaning"],
      staffingCatalog,
    });
  } catch (e) {
    return NextResponse.json({ error: "Config unavailable." }, { status: 500 });
  }
}
