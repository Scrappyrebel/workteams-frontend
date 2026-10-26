import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "../../../../../lib/rate-limit";
import { requireManager } from "../../../../../lib/integrations/server-auth";
import {
  getAccessToken,
  qboQuery,
  markNeedsAttention,
  isMissingIntegrationSchema,
} from "../../../../../lib/integrations/quickbooks-server";

// GET ?companyId= -> { accounts, taxCodes }  (owner/admin only)
// The connected company's OWN QuickBooks chart of accounts and tax
// codes, fetched live for the mapping screen (handoff 15.6). Tokens
// never leave the server; only account names/ids/types come back.
export async function GET(req) {
  try {
    const rl = checkRateLimit(`qbo-accounts:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const companyId = new URL(req.url).searchParams.get("companyId") || "";
    const auth = await requireManager(req, companyId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let ctx;
    try {
      ctx = await getAccessToken(auth.db, companyId);
    } catch (e) {
      if (isMissingIntegrationSchema(e)) {
        return NextResponse.json({ error: "QuickBooks setup is pending.", code: "setup_pending" }, { status: 503 });
      }
      return NextResponse.json({ error: e.message }, { status: 409 });
    }

    try {
      const [acctRes, taxRes] = await Promise.all([
        qboQuery(ctx.connection, ctx.accessToken, "select * from Account maxresults 1000"),
        qboQuery(ctx.connection, ctx.accessToken, "select * from TaxCode maxresults 100"),
      ]);
      const accounts = (acctRes.Account || [])
        .filter((a) => a.Active !== false)
        .map((a) => ({
          id: String(a.Id),
          name: a.FullyQualifiedName || a.Name || "",
          type: a.AccountType || "",
          subType: a.AccountSubType || "",
        }))
        .sort((x, y) => x.name.localeCompare(y.name));
      const taxCodes = (taxRes.TaxCode || [])
        .filter((t) => t.Active !== false)
        .map((t) => ({ id: String(t.Id), name: t.Name || "" }))
        .sort((x, y) => x.name.localeCompare(y.name));
      return NextResponse.json({ accounts, taxCodes });
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        await markNeedsAttention(auth.db, ctx.connection, "QuickBooks refused the saved sign-in. Reconnect QuickBooks.");
      }
      return NextResponse.json({ error: e.message || "Could not load your QuickBooks accounts" }, { status: 502 });
    }
  } catch (e) {
    console.error("qbo accounts error", e.message);
    return NextResponse.json({ error: "Could not load your QuickBooks accounts" }, { status: 500 });
  }
}
