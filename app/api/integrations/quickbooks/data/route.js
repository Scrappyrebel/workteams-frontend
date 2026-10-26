import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "../../../../../lib/rate-limit";
import { requireManager } from "../../../../../lib/integrations/server-auth";
import {
  getAccessToken,
  qboQuery,
  summarizeRemote,
  cacheRemoteRecord,
  markNeedsAttention,
  isMissingIntegrationSchema,
} from "../../../../../lib/integrations/quickbooks-server";

// GET ?companyId=&type=invoice|payment|expense -> { source, rows }
// Read side of the sync (handoff 15.5): the connected company's
// QuickBooks invoices, payments, and expenses, fetched live and shown
// in the app clearly labeled as QuickBooks data. QuickBooks is the
// books of record; these rows are a view, never copied into WorkTeams
// invoices or edited from here. Fetched rows are also cached in
// integration_remote_records so the page can show the last fetched copy
// when QuickBooks is unreachable.

const TYPES = {
  invoice: { entity: "Invoice", key: "Invoice" },
  payment: { entity: "Payment", key: "Payment" },
  expense: { entity: "Purchase", key: "Purchase" },
};

export async function GET(req) {
  try {
    const rl = checkRateLimit(`qbo-data:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const params = new URL(req.url).searchParams;
    const companyId = params.get("companyId") || "";
    const type = params.get("type") || "invoice";
    const spec = TYPES[type];
    if (!spec) return NextResponse.json({ error: "Unknown data type" }, { status: 400 });
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
      const res = await qboQuery(
        ctx.connection,
        ctx.accessToken,
        `select * from ${spec.entity} orderby TxnDate desc maxresults 50`
      );
      const records = res[spec.key] || [];
      const rows = records.map((r) => summarizeRemote(type, r));
      for (const r of records) {
        // Sequential cache writes keep this simple; 50 rows max.
        // eslint-disable-next-line no-await-in-loop
        await cacheRemoteRecord(auth.db, companyId, type, r);
      }
      return NextResponse.json({ source: "quickbooks", type, rows });
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        await markNeedsAttention(auth.db, ctx.connection, "QuickBooks refused the saved sign-in. Reconnect QuickBooks.");
      }
      return NextResponse.json({ error: e.message || "Could not load QuickBooks data" }, { status: 502 });
    }
  } catch (e) {
    console.error("qbo data error", e.message);
    return NextResponse.json({ error: "Could not load QuickBooks data" }, { status: 500 });
  }
}
