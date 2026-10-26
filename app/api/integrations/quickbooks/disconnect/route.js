import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "../../../../../lib/rate-limit";
import { requireManager } from "../../../../../lib/integrations/server-auth";
import {
  loadConnection,
  revokeToken,
  logSync,
  isMissingIntegrationSchema,
} from "../../../../../lib/integrations/quickbooks-server";

// POST { companyId } -> { ok }  (owner/admin only)
// Disconnects QuickBooks for this company (handoff 15.3): sync stops
// immediately, the stored tokens are revoked at Intuit (best effort)
// and deleted here. Nothing is deleted in WorkTeams or in QuickBooks --
// records already posted stay in QuickBooks under its own rules, and
// the UI says so before the owner taps.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`qbo-disconnect:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const { companyId } = await req.json().catch(() => ({}));
    const auth = await requireManager(req, companyId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const db = auth.db;

    let connection;
    try {
      connection = await loadConnection(db, companyId);
    } catch (e) {
      if (isMissingIntegrationSchema(e)) {
        return NextResponse.json({ error: "QuickBooks setup is pending.", code: "setup_pending" }, { status: 503 });
      }
      throw e;
    }
    if (!connection) {
      return NextResponse.json({ error: "QuickBooks is not connected for this company" }, { status: 404 });
    }

    const { data: tokens } = await db
      .from("integration_tokens")
      .select("refresh_token, access_token")
      .eq("connection_id", connection.id)
      .maybeSingle();
    if (tokens?.refresh_token) await revokeToken(tokens.refresh_token);
    else if (tokens?.access_token) await revokeToken(tokens.access_token);

    await db.from("integration_tokens").delete().eq("connection_id", connection.id);
    await db
      .from("integration_connections")
      .update({ status: "disconnected", last_error: "", updated_at: new Date().toISOString() })
      .eq("id", connection.id);
    await logSync(db, {
      companyId,
      direction: "auth",
      event: "disconnected",
      summary: "QuickBooks disconnected by an owner/manager. Tokens revoked and deleted; records already posted stay in QuickBooks.",
      userId: auth.user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("qbo disconnect error", e.message);
    return NextResponse.json({ error: "Could not disconnect QuickBooks" }, { status: 500 });
  }
}
