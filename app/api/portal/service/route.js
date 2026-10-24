import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";


const PRIVATE_PORTAL_HEADERS = {
  "Cache-Control":"private, no-store, max-age=0",
  "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff"
};
// Location bearer tokens, contract terms and customer request history
// must never enter intermediary/browser caches, even on failure responses.
function portalResponse(payload,options={}){
  return NextResponse.json(payload,{
    ...options,headers:{...(options.headers||{}),...PRIVATE_PORTAL_HEADERS}
  });
}

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Public: active signed contract for this portal link's location — terms
// summary, scope of work, and extra-clean pricing for the client to reference.
export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || typeof token !== "string" || token.length > 128)
    return portalResponse({ error: "Invalid location link" }, { status: 400 });
  const limit = checkRateLimit(`portal-contract:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
  if(!limit.ok)return portalResponse({error:"Too many requests. Try again shortly."},{status:429});
  const client = sb();
  const { data: pt, error: tokenError } = await client
    .from("portal_tokens")
    .select("id, company_id, location_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if(tokenError)return portalResponse({error:"Location access could not be verified."},{status:503});
  if (!pt) return portalResponse({ error: "Not found" }, { status: 404 });
  if (pt.expires_at && new Date(pt.expires_at) < new Date()) {
    return portalResponse({ error: "This link has expired." }, { status: 410 });
  }
  const { data: c, error: contractError } = await client
    .from("contracts")
    .select("client_name, start_date, end_date, visits_per_week, price_per_visit, yearly_increase_pct, extra_clean_price, heavy_clean_price, scope_of_work, terms_text, signed_at")
    .eq("company_id", pt.company_id)
    .eq("location_id", pt.location_id)
    .eq("status", "signed")
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if(contractError)return portalResponse({error:"Contract access could not be verified."},{status:503});
  if (!c) return portalResponse({ contract: null }, {headers:{"Cache-Control":"private, no-store"}});
  return portalResponse({ contract: c }, {headers:{"Cache-Control":"private, no-store"}});
}

// Public: client requests an extra or heavy clean. Creates a work order for
// the company to approve/schedule, priced from the signed contract.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`portal-clean:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) return portalResponse({ error: "Too many requests. Try again shortly." }, { status: 429 });

    const { token, kind, date, notes } = await req.json();
    if(typeof token!=="string"||!token||token.length>128||
       !["extra","heavy"].includes(kind)||
       typeof date!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||
       Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||
       (notes!==undefined&&notes!==null&&
         (typeof notes!=="string"||notes.length>2000))){
      return portalResponse({error:"A valid service, date and note (up to 2000 characters) are required."},{status:400});
    }
    const client = sb();
    const { data: pt, error: tokenError } = await client
      .from("portal_tokens")
      .select("id, company_id, location_id, expires_at")
      .eq("token", token)
      .maybeSingle();
    if(tokenError)return portalResponse({error:"Location access could not be verified."},{status:503});
    if (!pt) return portalResponse({ error: "Not found" }, { status: 404 });
    if (pt.expires_at && new Date(pt.expires_at) < new Date()) {
      return portalResponse({ error: "This link has expired." }, { status: 410 });
    }
    const { data: c, error: contractError } = await client
      .from("contracts")
      .select("extra_clean_price, heavy_clean_price")
      .eq("company_id", pt.company_id)
      .eq("location_id", pt.location_id)
      .eq("status", "signed")
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if(contractError)return portalResponse({error:"Contract pricing could not be verified."},{status:503});
    const rawPrice=kind==="extra"?c?.extra_clean_price:c?.heavy_clean_price;
    // Do not label an unapproved/unpriced request an agreed-price work order.
    if(rawPrice===null||rawPrice===undefined||rawPrice===""||
       !Number.isFinite(Number(rawPrice))||Number(rawPrice)<0){
      return portalResponse({error:"No signed contract rate is available for this service. Contact the business for a quote."},{status:409});
    }
    const price=Number(rawPrice);
    const { error } = await client.from("work_orders").insert({
      company_id: pt.company_id,
      location_id: pt.location_id,
      title: `Client request: ${kind === "extra" ? "Extra" : "Heavy"} clean`,
      description: `Requested through the client portal for ${date}.${notes?.trim() ? ` Notes: ${notes.trim()}` : ""}`,
      due_date: date,
      source: "portal",
      agreed_price: price,
      status: "open",
      priority: "normal",
    });
    if (error) return portalResponse({ error: "Could not submit request." }, { status: 500 });
    return portalResponse({ ok: true, price });
  } catch (e) {
    console.error("portal request-clean error", e);
    return portalResponse({ error: "Could not submit request." }, { status: 500 });
  }
}
