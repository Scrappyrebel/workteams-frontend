import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import { entitledTier, canUse } from "../../../../lib/tiers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

// Verify the caller's JWT and return the user, or null.
async function authedUser(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!token) return null;
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser();
  return user || null;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

// POST { companyId, locationId, lat, lng } -> { entry }
// Server-issued timestamp; geofence enforced server-side.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`clock-in:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { companyId, locationId, lat, lng } = await req.json();
    if (!companyId || !locationId) {
      return NextResponse.json({ error: "companyId and locationId are required" }, { status: 400 });
    }

    const sb = admin();

    const { data: member } = await sb
      .from("company_members")
      .select("id, company_id, role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "No access to this company" }, { status: 403 });

    const { data: existing } = await sb
      .from("time_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("member_id", member.id)
      .is("clock_out", null)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "You are already clocked in." }, { status: 409 });
    }

    const { data: company } = await sb
      .from("companies")
      .select("id, tier, subscription_status")
      .eq("id", companyId)
      .single();
    const { data: location } = await sb
      .from("locations")
      .select("id, company_id, name, lat, lng, geofence_radius_m")
      .eq("id", locationId)
      .maybeSingle();
    if (!location || location.company_id !== companyId) {
      return NextResponse.json({ error: "Location not found in this company" }, { status: 400 });
    }

    // Server-side geofence check (Plus/Pro feature).
    const geoEnforced =
      canUse(entitledTier(company), "geofencing") && location.lat != null && location.lng != null;
    if (geoEnforced) {
      const plat = Number(lat);
      const plng = Number(lng);
      if (!Number.isFinite(plat) || !Number.isFinite(plng)) {
        return NextResponse.json(
          { error: `Location sharing is required to clock in at ${location.name}.` },
          { status: 400 }
        );
      }
      const radius = parseInt(location.geofence_radius_m, 10) || 100;
      const dist = haversineMeters(plat, plng, parseFloat(location.lat), parseFloat(location.lng));
      if (dist > radius) {
        return NextResponse.json(
          { error: `You must be at ${location.name} to clock in (${Math.round(dist)}m away, limit ${radius}m).` },
          { status: 403 }
        );
      }
    }

    const { data: entry, error } = await sb
      .from("time_entries")
      .insert({
        company_id: companyId,
        member_id: member.id,
        location_id: locationId,
        clock_in: new Date().toISOString(), // server time, not client time
        clock_in_lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
        clock_in_lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
      })
      .select()
      .single();
    if (error) {
      console.error("clock-in insert failed", error.message);
      return NextResponse.json({ error: "Clock-in failed. Try again." }, { status: 500 });
    }
    return NextResponse.json({ entry });
  } catch (e) {
    console.error("clock-in error", e);
    return NextResponse.json({ error: "Clock-in failed. Try again." }, { status: 500 });
  }
}
