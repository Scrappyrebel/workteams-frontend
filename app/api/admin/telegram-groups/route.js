import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../../lib/rate-limit";
import { discoverVerifiedGroup, expectedGroupTitle,
  verificationCommand } from "../../../../../lib/telegram-group-verification.server.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, private" };
const err = (message, status) => NextResponse.json({ error: message },
  { status, headers: noStore });

async function ownerContext(req) {
  const id = new URL(req.url).searchParams.get("companyId");
  if (!/^[a-f0-9-]{36}$/i.test(String(id || ""))) return null;
  const bearer = req.headers.get("authorization") || "";
  if (!/^Bearer [^ ]{20,}$/.test(bearer)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, {
    global: { headers: { Authorization: bearer } },
  });
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) return null;
  const { data: member, error: memberError } = await sb.from("company_members")
    .select("role").eq("company_id", id).eq("user_id", user.id).maybeSingle();
  if (memberError || member?.role !== "owner") return null;
  const { data: company, error: companyError } = await sb.from("companies")
    .select("name").eq("id", id).maybeSingle();
  const expectedTitle = !companyError && expectedGroupTitle(company?.name);
  return expectedTitle ? { id, expectedTitle } : null;
}

async function telegram(method) {
  const token = process.env.TELEGRAM_EVIDENCE_BOT_TOKEN;
  if (!/^\d{5,15}:[a-zA-Z0-9_-]{30,100}$/.test(String(token || "")))
    return { error: "telegram_not_configured" };
  let response;
  try {
    // No webhook/cron, updates are never acknowledged or consumed by offset.
    // Read-only on user request; no output includes bot credentials.
    response = await fetch("https://api.telegram.org/bot" + token + "/" + method,
      { method: "GET", redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(9000) });
    if (!response.ok) return { error: response.status === 409 ?
      "telegram_webhook_or_polling_conflict" : "telegram_unavailable" };
    const result = await response.json();
    return result?.ok === true ? { data: result.result } :
      { error: "telegram_unavailable" };
  } catch { return { error: "telegram_unavailable" }; }
}

async function handler(req, verify) {
  const ip = clientIp(req);
  const throttle = checkRateLimit("telegram-setup:" + ip,
    { limit: 8, windowMs: 60_000 });
  if (!throttle.ok) return err("Please wait before checking Telegram again.", 429);
  const ctx = await ownerContext(req);
  if (!ctx) return err("Only the registered company owner may verify a Telegram group.", 403);
  const me = await telegram("getMe");
  const username = me.data?.username;
  if (!username) return err("Telegram bot credentials could not be verified.", 503);
  const command = verificationCommand({
    companyId: ctx.id, botToken: process.env.TELEGRAM_EVIDENCE_BOT_TOKEN,
    botUsername: username,
  });
  if (!command) return err("Telegram setup is unavailable.", 503);
  if (!verify) return NextResponse.json({
    companyId: ctx.id, expectedGroup: ctx.expectedTitle, command,
    status: "awaiting_group_command", autoSendingEnabled: false,
  }, { headers: noStore });
  const updates = await telegram("getUpdates?limit=100&timeout=0");
  if (updates.error) return err("Telegram group discovery is temporarily unavailable.", 503);
  const match = discoverVerifiedGroup({
    updates: updates.data, command, expectedTitle: ctx.expectedTitle,
  });
  if (match.status !== "verified_candidate")
    return NextResponse.json({ status: match.status, expectedGroup: ctx.expectedTitle,
      saved: false, autoSendingEnabled: false }, { status: 409, headers: noStore });
  // Candidate is NOT activated. Saving the destination and enabling uploads
  // requires durable owner-approved per-company mapping and media tests.
  return NextResponse.json({ ...match, companyId: ctx.id, saved: false,
    autoSendingEnabled: false }, { headers: noStore });
}

export async function GET(req) { return handler(req, false); }
export async function POST(req) { return handler(req, true); }
