import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

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
export async function GET(req) {
  try {
    const rl = checkRateLimit(`temp-config:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: cfg } = await db
      .from("temp_agency_config")
      .select("company_id, base_hourly_rate, service_rates, hire_track_options, conversion_fee")
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();
    if (!cfg) {
      return NextResponse.json({ available: false }, { status: 200 });
    }
    const { data: co } = await db
      .from("companies")
      .select("name")
      .eq("id", cfg.company_id)
      .single();
    return NextResponse.json({
      available: true,
      agencyName: co?.name || "Temp Staffing",
      baseHourlyRate: Number(cfg.base_hourly_rate),
      serviceRates: mergeServiceRates(cfg.service_rates),
      hireTrackOptions: cfg.hire_track_options || [90, 180],
      conversionFee: Number(cfg.conversion_fee || 0),
      serviceTypes: SERVICE_TYPES,
    });
  } catch (e) {
    return NextResponse.json({ error: "Config unavailable." }, { status: 500 });
  }
}
