import { NextResponse } from "next/server";
import { serviceDb } from "../../../../../lib/integrations/server-auth";
import { getAppUrl } from "../../../../../lib/app-url";
import {
  intuitConfig,
  exchangeCodeForTokens,
  storeTokens,
  qboRequest,
  logSync,
} from "../../../../../lib/integrations/quickbooks-server";

// GET -- Intuit OAuth callback.
// Intuit redirects the owner's browser here after they approve (or
// decline) the connection on Intuit's own site. The one-time state
// nonce ties the callback to the company and user who started it; the
// code is exchanged server-side and the tokens are stored server-side
// only (integration_tokens). The browser never sees a token. Every exit
// lands back on the Connections page with a plain qbo= state.
export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const realmId = url.searchParams.get("realmId") || "";
  const intuitError = url.searchParams.get("error") || "";

  const back = (companyId, qs) => {
    let origin = "";
    try {
      origin = getAppUrl();
    } catch {
      origin = new URL(req.url).origin;
    }
    const target = companyId
      ? `${origin}/app/${companyId}/connections?${qs}`
      : `${origin}/app?${qs}`;
    return NextResponse.redirect(target);
  };

  const db = serviceDb();
  let companyId = null;
  try {
    if (!state) return back(null, "qbo=error&reason=missing_state");
    const { data: stateRow } = await db
      .from("integration_oauth_states")
      .select("*")
      .eq("nonce", state)
      .maybeSingle();
    if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
      return back(null, "qbo=error&reason=expired_link");
    }
    companyId = stateRow.company_id;
    // One-time use: consume the nonce whatever happens next.
    await db.from("integration_oauth_states").delete().eq("nonce", state);

    if (intuitError || !code || !realmId) {
      return back(companyId, "qbo=error&reason=declined");
    }
    const cfg = intuitConfig();
    if (!cfg.configured) return back(companyId, "qbo=error&reason=setup");

    const payload = await exchangeCodeForTokens(code);

    const { data: connection, error: connErr } = await db
      .from("integration_connections")
      .upsert(
        {
          company_id: companyId,
          provider: "quickbooks",
          realm_id: realmId,
          status: "connected",
          connected_by: stateRow.user_id,
          connected_at: new Date().toISOString(),
          last_error: "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,provider" }
      )
      .select("*")
      .single();
    if (connErr || !connection) throw new Error("connection upsert failed");
    await storeTokens(db, connection, payload);

    // Best effort: learn the QuickBooks company name for display.
    try {
      const info = await qboRequest(
        { realm_id: realmId },
        payload.access_token,
        `companyinfo/${encodeURIComponent(realmId)}`
      );
      const name = info?.CompanyInfo?.CompanyName || "";
      if (name) {
        await db
          .from("integration_connections")
          .update({ provider_company_name: String(name).slice(0, 200), updated_at: new Date().toISOString() })
          .eq("id", connection.id);
      }
    } catch {
      /* display name is optional */
    }

    await logSync(db, {
      companyId,
      direction: "auth",
      event: "connected",
      summary: `QuickBooks connected (${cfg.environment})${realmId ? `, company ${realmId}` : ""}.`,
      userId: stateRow.user_id,
    });
    return back(companyId, "qbo=connected");
  } catch (e) {
    console.error("qbo callback error", e.message);
    return back(companyId, "qbo=error&reason=failed");
  }
}
