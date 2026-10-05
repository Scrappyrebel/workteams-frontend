import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import { chicagoToday } from "../../../../lib/dates";
import { buildContractText } from "../../../../lib/contracts";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FREQ_TO_VISITS = {
  weekly: 1, "2x-week": 2, "3x-week": 3, "5x-week": 5, biweekly: 1, monthly: 1,
};

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Public: client accepts or declines a bid. On accept, a contract is
// auto-generated from the bid (standard clauses included) and the signing
// link is returned immediately.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`bid-decide:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

    const { token, decision, name, email } = await req.json();
    if (!token || !["accepted", "declined"].includes(decision)) {
      return NextResponse.json({ error: "Token and a valid decision are required." }, { status: 400 });
    }
    const client = sb();
    // Workaround: approve_token index may be corrupted; match in JS.
    const { data: candidates } = await client
      .from("bids")
      .select("id, company_id, location_id, title, client_name, frequency, status, valid_until, approve_token")
      .not("approve_token", "is", null);
    const bid = (candidates || []).find((b) => b.approve_token === token);
    if (!bid) return NextResponse.json({ error: "Bid not found." }, { status: 404 });
    if (bid.valid_until && bid.valid_until < chicagoToday()) {
      return NextResponse.json({ error: "This proposal has expired." }, { status: 410 });
    }
    if (bid.status === "accepted" || bid.status === "declined") {
      return NextResponse.json({ error: `This bid is already ${bid.status}.` }, { status: 409 });
    }

    await client.from("bids").update({ status: decision }).eq("id", bid.id);

    if (decision === "declined") return NextResponse.json({ ok: true, decision });

    // Accepted: build the contract from the bid.
    const { data: items } = await client
      .from("bid_items")
      .select("description, quantity, unit_price")
      .eq("bid_id", bid.id)
      .order("created_at");
    const total = (items || []).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
    const scope = (items || []).map((i) =>
      Number(i.quantity) > 1 ? `${i.description} (x${i.quantity})` : i.description
    );
    const { data: co } = await client.from("companies").select("name").eq("id", bid.company_id).maybeSingle();
    const terms = buildContractText({
      companyName: co?.name || "",
      clientName: name?.trim() || bid.client_name,
      locationName: "",
      scopeOfWork: scope,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: null,
      visitsPerWeek: FREQ_TO_VISITS[bid.frequency] ?? null,
      pricePerVisit: total > 0 ? total : null,
      yearlyIncreasePct: 3,
      extraCleanPrice: null,
      heavyCleanPrice: null,
    });
    const signToken = makeToken();
    const { data: contract, error: cErr } = await client
      .from("contracts")
      .insert({
        company_id: bid.company_id,
        location_id: bid.location_id,
        bid_id: bid.id,
        client_name: name?.trim() || bid.client_name,
        client_email: email?.trim() || null,
        scope_of_work: scope.map((t) => ({ task: t })),
        start_date: new Date().toISOString().slice(0, 10),
        visits_per_week: FREQ_TO_VISITS[bid.frequency] ?? null,
        price_per_visit: total > 0 ? total : null,
        yearly_increase_pct: 3,
        terms_text: terms,
        status: "sent",
        sign_token: signToken,
      })
      .select("id")
      .single();
    if (cErr) {
      console.error("auto-contract failed", cErr.message);
      return NextResponse.json({ ok: true, decision, contractError: true });
    }
    return NextResponse.json({ ok: true, decision, signToken, contractId: contract.id });
  } catch (e) {
    console.error("bid decide error", e);
    return NextResponse.json({ error: "Request failed. Try again." }, { status: 500 });
  }
}
