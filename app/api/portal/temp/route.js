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

const PRIVATE_PORTAL_HEADERS={
 "Cache-Control":"private, no-store, max-age=0",
 "Referrer-Policy":"no-referrer",
 "X-Content-Type-Options":"nosniff"
};
function portalResponse(data,options={}){
 return NextResponse.json(data,{...options,
  headers:{...(options.headers||{}),...PRIVATE_PORTAL_HEADERS}});
}

async function getPortalToken(token) {
 if(typeof token!=="string"||!token||token.length>128)
  return {error:"Invalid location link",status:400};
 const client=sb();
 const {data:pt,error:tokenError}=await client.from("portal_tokens")
  .select("id, company_id, location_id, client_name, expires_at")
  .eq("token",token).maybeSingle();
 if(tokenError)return {error:"Location access could not be verified.",status:503};
 if(!pt)return {error:"Not found",status:404};
 if(pt.expires_at&&new Date(pt.expires_at)<=new Date())
  return {error:"This link has expired.",status:410};
 const {data:loc,error:locationError}=await client.from("locations")
  .select("id").eq("id",pt.location_id).eq("company_id",pt.company_id).maybeSingle();
 if(locationError)return {error:"Service location access could not be verified.",status:503};
 if(!loc)return {error:"Location is no longer available.",status:404};
 return {pt};
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
      return portalResponse({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const b = await req.json();
    if(!b||typeof b!=="object"||Array.isArray(b))
      return portalResponse({error:"Invalid request."},{status:400});
    const {token,action}=b;
    if(typeof token!=="string"||!token||token.length>128)
      return portalResponse({error:"Invalid location link."},{status:400});

    const { pt, error, status } = await getPortalToken(token);
    if (error) return portalResponse({ error }, { status });

    const client = sb();
    const { data: cfg, error: cfgError } = await client
      .from("temp_agency_config")
      .select("company_id")
      .eq("company_id", pt.company_id)
      .eq("enabled", true)
      .maybeSingle();
    if(cfgError)return portalResponse({error:"Temp staffing availability could not be verified."},{status:503});
    if(!cfg)return portalResponse({error:"Temp staffing is not available."},{status:403});

    if (action === "request") {
      const serviceType = String(b.serviceType || "");
      const cleanersNeeded = Number(b.cleanersNeeded);
      const hoursRequested = Number(b.hoursRequested);
      const siteAddress = String(b.siteAddress || "").trim();
      if (!VALID_TYPES.has(serviceType)) {
        return portalResponse({ error: "Choose a service type." }, { status: 400 });
      }
      if (!Number.isInteger(cleanersNeeded) || cleanersNeeded < 1 || cleanersNeeded > 50) {
        return portalResponse({ error: "Number of temps must be between 1 and 50." }, { status: 400 });
      }
      if (!Number.isFinite(hoursRequested) || hoursRequested < 1 || hoursRequested > 500) {
        return portalResponse({ error: "Hours must be between 1 and 500." }, { status: 400 });
      }
      if (!siteAddress) {
        return portalResponse({ error: "Site address is required." }, { status: 400 });
      }
      const { error: insErr } = await client.from("temp_job_requests").insert({
        company_id: pt.company_id,
        portal_token_id: pt.id,
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
        return portalResponse({ error: "Could not submit request." }, { status: 500 });
      }
      return portalResponse({ ok: true });
    }

    if (action === "confirm_hours") {
      const hours = Number(b.hours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 1000) {
        return portalResponse({ error: "Enter the hours worked." }, { status: 400 });
      }
      // Only the client's own requests, and only ones far enough along.
      const { data: jr, error: jrError } = await client
        .from("temp_job_requests")
        .select("id, status")
        .eq("id", b.requestId)
        .eq("company_id", pt.company_id)
        .eq("portal_token_id", pt.id)
        .maybeSingle();
      if(jrError)return portalResponse({error:"Request status could not be verified."},{status:503});
      if(!jr)return portalResponse({error:"Not found."},{status:404});
      if (!["assigned", "in_progress", "completed"].includes(jr.status)) {
        return portalResponse({ error: "Hours can't be confirmed yet." }, { status: 400 });
      }
      const { data: updated, error: upErr } = await client
        .from("temp_job_requests")
        .update({ hours_confirmed: hours })
        .eq("id", jr.id)
        .eq("company_id",pt.company_id)
        .eq("portal_token_id",pt.id)
        .is("hours_confirmed",null)
        .select("id,hours_confirmed")
        .maybeSingle();
      if (upErr) {
        console.error("portal confirm hours failed", upErr.message);
        return portalResponse({ error: "Could not confirm hours." }, { status: 500 });
      }
      if(!updated||Number(updated.hours_confirmed)!==hours)
        return portalResponse({error:"Hours were not confirmed. Refresh the request before trying again."},{status:409});
      return portalResponse({ ok: true });
    }

    return portalResponse({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("portal temp error", e);
    return portalResponse({ error: "Could not process request." }, { status: 500 });
  }
}
