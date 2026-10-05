import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Owner/admin: create a contract amendment and generate its signing link.
export async function POST(req) {
  try {
    const { contract_id, company_id, title, description, changes } = await req.json();
    if (!contract_id || !company_id || !title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: "Contract, title, and description are required." }, { status: 400 });
    }
    const client = sb();
    // Verify the contract belongs to the company.
    const { data: contract } = await client
      .from("contracts")
      .select("id")
      .eq("id", contract_id)
      .eq("company_id", company_id)
      .maybeSingle();
    if (!contract) return NextResponse.json({ error: "Contract not found." }, { status: 404 });

    const token = makeToken();
    const { data, error } = await client
      .from("contract_amendments")
      .insert({
        company_id,
        contract_id,
        title: title.trim(),
        description: description.trim(),
        changes: changes || {},
        status: "sent",
        sign_token: token,
      })
      .select("id")
      .single();
    if (error) {
      console.error("amendment create error", error);
      return NextResponse.json({ error: "Could not create the amendment." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data.id, sign_token: token });
  } catch (e) {
    console.error("amendment create error", e);
    return NextResponse.json({ error: "Could not create the amendment." }, { status: 500 });
  }
}
