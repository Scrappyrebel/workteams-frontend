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
    const { data: bid, error: bidErr } = await client
      .from("bids")
      .select("id, company_id, location_id, title, client_name, frequency, status, valid_until")
      .eq("approve_token", token)
      .maybeSingle();
    if (bidErr) {
      console.error("bid decide lookup db error", bidErr);
      return NextResponse.json({ error: "Could not process the decision." }, { status: 500 });
    }
    if (!bid) return NextResponse.json({ error: "Bid not found." }, { status: 404 });
    const { data: bidCompany } = await client.from("companies").select("timezone").eq("id", bid.company_id).maybeSingle();
    if (bid.valid_until && bid.valid_until < chicagoToday(bidCompany?.timezone)) {
      return NextResponse.json({ error: "This proposal has expired." }, { status: 410 });
    }
    if (bid.status === "declined" || (bid.status === "accepted" && decision === "declined")) {
      return NextResponse.json({ error: `This bid is already ${bid.status}.` }, { status: 409 });
    }

    // Audit fix, 2026-11-15 (Sebastian §9): the decision update used
    // to be fired unchecked, so a failed update still ran the rest;
    // two decisions racing could both land; and a failed contract
    // left the bid marked accepted with no contract while every
    // retry was refused as "already accepted" — stuck forever, and
    // the client saw a success message with no signing link. Now:
    //  - the update is guarded on the bid still being undecided and
    //    its result is checked; only the first decision lands;
    //  - if the contract cannot be created, a decision marked here
    //    is rolled back so the client can simply try again;
    //  - an accepted bid with NO contract (an earlier attempt died
    //    in between) heals itself: a repeat accept finishes the
    //    contract instead of refusing.
    let markedHere = false;
    if (bid.status === "accepted") {
      const { data: existing } = await client.from("contracts").select("id").eq("bid_id", bid.id).limit(1);
      if (existing && existing.length) {
        return NextResponse.json({ error: "This bid is already accepted." }, { status: 409 });
      }
      // No contract yet — fall through and build it now.
    } else {
      const { data: updated, error: upErr } = await client
        .from("bids")
        .update({ status: decision })
        .eq("id", bid.id)
        .not("status", "in", "(accepted,declined)")
        .select("id");
      if (upErr) {
        console.error("bid decide update failed", upErr);
        return NextResponse.json({ error: "Could not process the decision." }, { status: 500 });
      }
      if (!updated || !updated.length) {
        return NextResponse.json({ error: "This bid was just decided by someone else." }, { status: 409 });
      }
      markedHere = true;
      if (decision === "declined") return NextResponse.json({ ok: true, decision });
    }

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
      if (markedHere) {
        // Roll the decision back so the client can retry — an
        // accepted bid with no contract must never be the end state.
        const { error: backErr } = await client.from("bids").update({ status: bid.status }).eq("id", bid.id).eq("status", decision);
        if (backErr) console.error("bid decide rollback failed", backErr);
        return NextResponse.json({ error: "The contract could not be created, so the acceptance was not saved. Please try again." }, { status: 500 });
      }
      return NextResponse.json({ error: "The contract could not be created. Please try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, decision, signToken, contractId: contract.id });
  } catch (e) {
    console.error("bid decide error", e);
    return NextResponse.json({ error: "Request failed. Try again." }, { status: 500 });
  }
}
