import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Haversine distance in meters between two lat/lng points.
function distM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Owner/admin: verify weekend clock-ins against location geofences.
// Query params: company_id, start (YYYY-MM-DD), end (YYYY-MM-DD).
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get("company_id");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    if (!companyId || !start || !end) {
      return NextResponse.json({ error: "company_id, start, and end are required." }, { status: 400 });
    }
    const client = sb();
    // Verify requester is owner/admin via the Supabase auth token.
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = auth.slice(7);
    const { data: { user }, error: userErr } = await client.auth.getUser(jwt);
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: membership } = await client
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: entries } = await client
      .from("time_entries")
      .select("id, clock_in, clock_out, clock_in_lat, clock_in_lng, clock_out_lat, clock_out_lng, location_id, member_id")
      .eq("company_id", companyId)
      .gte("clock_in", `${start}T00:00:00`)
      .lte("clock_in", `${end}T23:59:59`)
      .order("clock_in");

    const { data: locations } = await client
      .from("locations")
      .select("id, name, lat, lng, geofence_radius_m")
      .eq("company_id", companyId);

    const { data: members } = await client
      .from("company_members")
      .select("id, display_name, email")
      .eq("company_id", companyId);

    const locMap = Object.fromEntries((locations || []).map((l) => [l.id, l]));
    const memMap = Object.fromEntries((members || []).map((m) => [m.id, m.display_name || m.email]));

    const results = (entries || []).map((e) => {
      const loc = locMap[e.location_id];
      let inM = null;
      let outM = null;
      let inFence = null;
      if (loc?.lat != null && loc?.lng != null) {
        if (e.clock_in_lat != null && e.clock_in_lng != null) {
          inM = Math.round(distM(Number(loc.lat), Number(loc.lng), Number(e.clock_in_lat), Number(e.clock_in_lng)));
          inFence = inM <= (loc.geofence_radius_m || 100);
        }
        if (e.clock_out_lat != null && e.clock_out_lng != null) {
          outM = Math.round(distM(Number(loc.lat), Number(loc.lng), Number(e.clock_out_lat), Number(e.clock_out_lng)));
        }
      }
      return {
        member: memMap[e.member_id] || "Unknown",
        location: loc?.name || "No location",
        clock_in: e.clock_in,
        clock_out: e.clock_out,
        in_distance_m: inM,
        out_distance_m: outM,
        geofence_radius_m: loc?.geofence_radius_m || 100,
        in_geofence: inFence,
        has_gps: e.clock_in_lat != null,
        location_has_gps: loc?.lat != null,
      };
    });

    return NextResponse.json({ entries: results, count: results.length });
  } catch (e) {
    console.error("geofence check error", e);
    return NextResponse.json({ error: "Could not run verification." }, { status: 500 });
  }
}
