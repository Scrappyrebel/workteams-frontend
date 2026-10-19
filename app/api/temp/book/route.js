import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import { getAppUrl } from "../../../../lib/app-url";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_TYPES = new Set([
  "commercial", "residential", "move_in_out",
  "construction_cleanup", "day_janitorial", "other",
]);

// Public: create a temp job request + Stripe Checkout (pay per booking).
// Body: { serviceType, cleanersNeeded, hoursRequested, jobDate?, scheduleNotes?,
//         siteAddress, customerName, customerEmail, customerPhone?, jobDetails? }
export async function POST(req) {
  try {
    const rl = checkRateLimit(`temp-book:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const b = await req.json();
    const serviceType = String(b.serviceType || "");
    const cleanersNeeded = parseInt(b.cleanersNeeded, 10);
    const hoursRequested = parseFloat(b.hoursRequested);
    const siteAddress = String(b.siteAddress || "").trim();
    const customerName = String(b.customerName || "").trim();
    const customerEmail = String(b.customerEmail || "").trim().toLowerCase();

    if (!VALID_TYPES.has(serviceType)) {
      return NextResponse.json({ error: "Choose a service type." }, { status: 400 });
    }
    if (!Number.isFinite(cleanersNeeded) || cleanersNeeded < 1 || cleanersNeeded > 50) {
      return NextResponse.json({ error: "Cleaners must be between 1 and 50." }, { status: 400 });
    }
    if (!Number.isFinite(hoursRequested) || hoursRequested < 1 || hoursRequested > 500) {
      return NextResponse.json({ error: "Hours must be between 1 and 500." }, { status: 400 });
    }
    if (!siteAddress || !customerName || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
      return NextResponse.json({ error: "Site address, name, and a valid email are required." }, { status: 400 });
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: cfg } = await db
      .from("temp_agency_config")
      .select("company_id, base_hourly_rate, service_rates")
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();
    if (!cfg) {
      return NextResponse.json({ error: "Temp staffing is not available right now." }, { status: 503 });
    }

    // Per-service bill rate; falls back to the base rate for unknown types.
    const DEFAULT_RATES = {
      commercial: 25, residential: 25, move_in_out: 25,
      construction_cleanup: 30, day_janitorial: 26, other: 26,
    };
    const rates = { ...DEFAULT_RATES, ...(cfg.service_rates || {}) };
    const rate = Number(rates[serviceType] ?? cfg.base_hourly_rate);
    // Per cleaner, per hour — never flat rate.
    const totalCents = Math.round(cleanersNeeded * hoursRequested * rate * 100);

    // POINT 2 booking fields. Tolerant: falls back if 048 hasn't run.
    const full = {
      company_id: cfg.company_id,
      service_type: serviceType,
      cleaners_needed: cleanersNeeded,
      hours_requested: hoursRequested,
      job_date: b.jobDate || null,
      schedule_notes: (b.scheduleNotes || "").slice(0, 2000) || null,
      site_address: siteAddress.slice(0, 500),
      customer_name: customerName.slice(0, 200),
      customer_email: customerEmail.slice(0, 320),
      customer_phone: String(b.customerPhone || "").slice(0, 40) || null,
      job_details: String(b.jobDetails || "").slice(0, 4000) || null,
      status: "pending",
      quoted_cents: totalCents,
      staffing_type: String(b.staffingType || "cleaning").slice(0, 40),
      shift_start: b.shiftStart || null,
      shift_end: b.shiftEnd || null,
      recurring_days: Array.isArray(b.recurringDays) ? b.recurringDays : [],
      recurring_until: b.recurringUntil || null,
      on_site_contact_name: String(b.onSiteName || "").slice(0, 200) || null,
      on_site_contact_phone: String(b.onSitePhone || "").slice(0, 40) || null,
      bill_rate_confirmed: b.billRateConfirmed ? Number(b.billRateConfirmed) : null,
      engagement_type: ["temp", "temp_to_hire", "direct_hire"].includes(b.engagementType)
        ? b.engagementType
        : "temp",
    };
    let job = null;
    let { data: jobData, error: jobErr } = await db
      .from("temp_job_requests")
      .insert(full)
      .select("id")
      .single();
    if (jobErr && /column/i.test(jobErr.message)) {
      // Pre-048 fallback.
      const { staffing_type, shift_start, shift_end, recurring_days, recurring_until,
        on_site_contact_name, on_site_contact_phone, bill_rate_confirmed,
        engagement_type, ...basic } = full;
      const retry = await db.from("temp_job_requests").insert(basic).select("id").single();
      jobData = retry.data;
      jobErr = retry.error;
    }
    job = jobData;
    if (jobErr || !job) {
      return NextResponse.json({ error: "Could not create your request." }, { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const appUrl = getAppUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Temp cleaners — ${serviceType.replace(/_/g, " ")}`,
              description: `${cleanersNeeded} cleaner(s) x ${hoursRequested} hour(s) @ $${rate.toFixed(2)}/hr per cleaner`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      metadata: { temp_job_request_id: job.id, company_id: cfg.company_id },
      success_url: `${appUrl}/temp/book/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/temp/book?cancelled=1`,
    });

    await db
      .from("temp_job_requests")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", job.id);

    return NextResponse.json({ url: session.url, jobId: job.id });
  } catch (e) {
    return NextResponse.json({ error: "Booking failed. Try again." }, { status: 500 });
  }
}
