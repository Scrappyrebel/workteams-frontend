import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { serviceDb } from "../../../../../lib/integrations/server-auth";
import {
  intuitWebhookVerifierToken,
  loadConnectionByRealm,
  getAccessToken,
  qboQuery,
  cacheRemoteRecord,
  logSync,
} from "../../../../../lib/integrations/quickbooks-server";

// POST -- Intuit webhook endpoint (fetch-after-notify, handoff 15.5).
// Intuit's notifications carry ONLY the company (realm) id and the ids
// of records that changed -- never the records themselves. Each
// notification is verified against INTUIT_WEBHOOK_VERIFIER_TOKEN (the
// signature Intuit sends is base64 HMAC-SHA256 of the raw body keyed by
// that token), then the changed records are fetched through the API
// and cached in integration_remote_records with a sync-log entry.
// Notifications are idempotent: refetching and re-caching the same
// record changes nothing twice.

const ENTITY_MAP = {
  Invoice: { type: "invoice", entity: "Invoice" },
  Payment: { type: "payment", entity: "Payment" },
  Purchase: { type: "expense", entity: "Purchase" },
};

function signatureValid(rawBody, signatureHeader, verifierToken) {
  if (!signatureHeader || !verifierToken) return false;
  const expected = crypto.createHmac("sha256", verifierToken).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signatureHeader));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req) {
  const verifierToken = intuitWebhookVerifierToken();
  if (!verifierToken) {
    // Endpoint honestly inactive until the verifier token is configured.
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }
  const rawBody = await req.text();
  const signature = req.headers.get("intuit-signature") || "";
  if (!signatureValid(rawBody, signature, verifierToken)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const db = serviceDb();
  const notifications = payload?.eventNotifications || [];
  for (const note of notifications) {
    const realmId = note?.realmId;
    const entities = note?.dataChangeEvent?.entities || [];
    if (!realmId || entities.length === 0) continue;
    let connection = null;
    try {
      connection = await loadConnectionByRealm(db, String(realmId));
    } catch {
      connection = null;
    }
    if (!connection || connection.status === "disconnected") continue;
    const companyId = connection.company_id;

    let ctx = null;
    for (const ent of entities) {
      const spec = ENTITY_MAP[ent?.name];
      if (!spec || !ent?.id) continue;
      try {
        if (!ctx) ctx = await getAccessToken(db, companyId);
        const res = await qboQuery(
          ctx.connection,
          ctx.accessToken,
          `select * from ${spec.entity} where Id = '${String(ent.id).replace(/'/g, "\\'")}'`
        );
        const rec = (res[spec.entity] || [])[0];
        if (rec) {
          await cacheRemoteRecord(db, companyId, spec.type, rec);
          await logSync(db, {
            companyId,
            direction: "in",
            event: "webhook_fetch",
            summary: `QuickBooks ${spec.type} ${ent.id} (${ent.operation || "changed"}) fetched after a change notice.`,
          });
        } else {
          await logSync(db, {
            companyId,
            direction: "in",
            event: "webhook_fetch_missing",
            summary: `QuickBooks ${spec.type} ${ent.id} (${ent.operation || "changed"}) was not found when fetched -- it may have been deleted in QuickBooks.`,
          });
        }
      } catch (e) {
        await logSync(db, {
          companyId,
          direction: "in",
          event: "webhook_fetch_failed",
          summary: `Could not fetch QuickBooks ${spec.type} ${ent.id} after a change notice: ${e.message}`,
        });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
