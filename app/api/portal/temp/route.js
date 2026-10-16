import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VALID_TYPES = new Set([
  "commercial",
  "residential",
  "move_in_out",
  "construction_cleanup",
  "day_janitorial",
  "other",
]);

async function getPortalToken(token) {
  const client = sb();
  const { data: pt } = await client
    .from("portal_tokens")
    .select("id, company_id, location_id, client_name, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!pt) return { error: "Not found", status: 404 };
  if (pt.expires_at && new Date(pt.expires_at) < new Date()) {
    return { error: "This link has expired.", status: 410 };
  }
  return { pt };
}

// Public (token-authenticated):
//  POST { token, action: "request", serviceType, cleanersNeeded, hoursRequested,
//         jobDate?, siteAddress, jobDetails? } -> creates a temp job request
//         (status "pending") for the owner to confirm and dispatch.
//  POST { token, action: "confirm_hours", requestId, hours } -> client confirms
//         hours on their own completed/in-progress temp request.
// Never exposes temp names, pay rates, or employee data.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`portal-temp:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const b = await req.json();
    const { token, action } = b;
    if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

    const { pt, error, status } = await getPortalToken(token);
    if (error) return NextResponse.json({ error }, { status });

    const client = sb();
    const { data: cfg } = await client
      .from("temp_agency_config")
      .select("company_id")
      .eq("company_id", pt.company_id)
      .eq("enabled", true)
      .maybeSingle();
    if (!cfg) {
      return NextResponse.json({ error: "Temp staffing is not available." }, { status: 503 });
    }

    if (action === "request") {
      const serviceType = String(b.serviceType || "");
      const cleanersNeeded = parseInt(b.cleanersNeeded, 10);
      const hoursRequested = parseFloat(b.hoursRequested);
      const siteAddress = String(b.siteAddress || "").trim();
      if (!VALID_TYPES.has(serviceType)) {
        return NextResponse.json({ error: "Choose a service type." }, { status: 400 });
      }
      if (!Number.isFinite(cleanersNeeded) || cleanersNeeded < 1 || cleanersNeeded > 50) {
        return NextResponse.json({ error: "Number of temps must be between 1 and 50." }, { status: 400 });
      }
      if (!Number.isFinite(hoursRequested) || hoursRequested < 1 || hoursRequested > 500) {
        return NextResponse.json({ error: "Hours must be between 1 and 500." }, { status: 400 });
      }
      if (!siteAddress) {
        return NextResponse.json({ error: "Site address is required." }, { status: 400 });
      }
      const { error: insErr } = await client.from("temp_job_requests").insert({
        company_id: pt.company_id,
        service_type: serviceType,
        cleaners_needed: cleanersNeeded,
        hours_requested: hoursRequested,
        job_date: b.jobDate || null,
        site_address: siteAddress.slice(0, 500),
        customer_name: pt.client_name,
        customer_email: null,
        job_details: String(b.jobDetails || "").slice(0, 4000) || null,
        status: "pending",
      });
      if (insErr) {
        console.error("portal temp request failed", insErr.message);
        return NextResponse.json({ error: "Could not submit request." }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "confirm_hours") {
      const hours = parseFloat(b.hours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 1000) {
        return NextResponse.json({ error: "Enter the hours worked." }, { status: 400 });
      }
      // Only the client's own requests, and only ones far enough along.
      const { data: jr } = await client
        .from("temp_job_requests")
        .select("id, status")
        .eq("id", b.requestId)
        .eq("company_id", pt.company_id)
        .eq("customer_name", pt.client_name)
        .maybeSingle();
      if (!jr) return NextResponse.json({ error: "Not found." }, { status: 404 });
      if (!["assigned", "in_progress", "completed"].includes(jr.status)) {
        return NextResponse.json({ error: "Hours can't be confirmed yet." }, { status: 400 });
      }
      const { error: upErr } = await client
        .from("temp_job_requests")
        .update({ hours_confirmed: hours })
        .eq("id", jr.id);
      if (upErr) {
        console.error("portal confirm hours failed", upErr.message);
        return NextResponse.json({ error: "Could not confirm hours." }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("portal temp error", e);
    return NextResponse.json({ error: "Could not process request." }, { status: 500 });
  }
}
