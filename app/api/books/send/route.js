import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  booksConfiguredFor,
  sendCompanyToBooks,
} from "../../../../lib/books/send-to-books";

export const dynamic = "force-dynamic";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

// Same caller pattern as /api/invoices/send: the browser passes its Supabase
// access token, and the caller's company role decides what they may do.
async function caller(req) {
  const authHeader = req.headers.get("authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!accessToken) return null;
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  return user || null;
}

async function roleFor(userId, companyId) {
  const { data } = await admin()
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role || null;
}

const canSend = (role) => role === "owner" || role === "admin";

// The button asks here first: it only appears for an owner or manager of a
// company this deployment is configured to send for.
export async function GET(req) {
  const companyId = (
    new URL(req.url).searchParams.get("company_id") || ""
  ).trim();
  if (!companyId || !booksConfiguredFor(companyId)) {
    return NextResponse.json({ connected: false });
  }
  const user = await caller(req);
  if (!user) return NextResponse.json({ connected: false });
  const role = await roleFor(user.id, companyId);
  return NextResponse.json({ connected: canSend(role) });
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const companyId = (body?.company_id || "").trim();
  if (!companyId) {
    return NextResponse.json(
      { error: "A company is required for the send." },
      { status: 400 }
    );
  }
  const user = await caller(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!booksConfiguredFor(companyId)) {
    return NextResponse.json(
      { error: "Books sending is not set up for this company." },
      { status: 403 }
    );
  }
  const role = await roleFor(user.id, companyId);
  if (!canSend(role)) {
    return NextResponse.json(
      { error: "Only an owner or manager can send records to the books." },
      { status: 403 }
    );
  }
  const result = await sendCompanyToBooks(companyId);
  return NextResponse.json(result);
}
