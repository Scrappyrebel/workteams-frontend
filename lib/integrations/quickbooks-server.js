// SERVER ONLY -- QuickBooks Online integration core.
// Never import from a client component and never log return values from
// the token functions: this module handles OAuth tokens, which live only
// in integration_tokens (service role only, migration 070).
//
// Design rules baked in here (handoff section 15):
// * One scope only: com.intuit.quickbooks.accounting. The payments scope
//   is never requested -- WorkTeams records payments, it does not
//   process them through QuickBooks.
// * Tokens are per company, stored server-side, refreshed server-side.
// * Every create sent to QuickBooks carries requestid = the sync item's
//   idempotency_key, so retries can never duplicate a record.
// * Sandbox first: INTUIT_ENVIRONMENT defaults to "sandbox"; production
//   endpoints are used only when it is explicitly set to "production".

import crypto from "node:crypto";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

export const QBO_PROVIDER = "quickbooks";
export const QBO_SCOPE = "com.intuit.quickbooks.accounting";

export function intuitConfig() {
  const clientId = process.env.INTUIT_CLIENT_ID || "";
  const clientSecret = process.env.INTUIT_CLIENT_SECRET || "";
  const redirectUri = process.env.INTUIT_REDIRECT_URI || "";
  const environment =
    (process.env.INTUIT_ENVIRONMENT || "sandbox").trim().toLowerCase() === "production"
      ? "production"
      : "sandbox";
  return {
    clientId,
    clientSecret,
    redirectUri,
    environment,
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}

export function intuitWebhookVerifierToken() {
  return process.env.INTUIT_WEBHOOK_VERIFIER_TOKEN || "";
}

function apiBase(environment) {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com/v3/company"
    : "https://sandbox-quickbooks.api.intuit.com/v3/company";
}

export function buildAuthorizeUrl(state) {
  const cfg = intuitConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    scope: QBO_SCOPE,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function basicAuthHeader(cfg) {
  return "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
}

async function tokenRequest(body) {
  const cfg = intuitConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(cfg),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const msg = data.error_description || data.error || `Intuit token request failed (${res.status})`;
    throw new Error(`QuickBooks sign-in failed: ${msg}`);
  }
  return data;
}

export async function exchangeCodeForTokens(code) {
  const cfg = intuitConfig();
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
  });
}

export async function refreshTokens(refreshToken) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

// Best-effort revoke at disconnect time (section 15.3). A failed revoke
// never blocks the local disconnect: the tokens are deleted locally
// either way, and the company can also revoke inside QuickBooks.
export async function revokeToken(token) {
  const cfg = intuitConfig();
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(cfg),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    /* best effort */
  }
}

function tokenExpiries(payload) {
  const now = Date.now();
  return {
    accessExpiresAt: payload.expires_in ? new Date(now + payload.expires_in * 1000).toISOString() : null,
    refreshExpiresAt: payload.x_refresh_token_expires_in
      ? new Date(now + payload.x_refresh_token_expires_in * 1000).toISOString()
      : null,
  };
}

export async function storeTokens(db, connection, payload) {
  const exp = tokenExpiries(payload);
  const { error } = await db.from("integration_tokens").upsert(
    {
      connection_id: connection.id,
      company_id: connection.company_id,
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      access_expires_at: exp.accessExpiresAt,
      refresh_expires_at: exp.refreshExpiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" }
  );
  if (error) throw new Error("Could not store the QuickBooks connection securely");
}

export async function loadConnection(db, companyId) {
  const { data, error } = await db
    .from("integration_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("provider", QBO_PROVIDER)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function loadConnectionByRealm(db, realmId) {
  const { data, error } = await db
    .from("integration_connections")
    .select("*")
    .eq("provider", QBO_PROVIDER)
    .eq("realm_id", realmId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function logSync(db, { companyId, direction, event, summary = "", syncItemId = null, userId = null }) {
  // The audit log must never take the integration down with it.
  try {
    await db.from("integration_sync_log").insert({
      company_id: companyId,
      provider: QBO_PROVIDER,
      direction,
      event,
      summary: String(summary || "").slice(0, 1000),
      sync_item_id: syncItemId,
      created_by: userId,
    });
  } catch {
    /* best effort */
  }
}

export async function markNeedsAttention(db, connection, message) {
  try {
    await db
      .from("integration_connections")
      .update({
        status: "needs_attention",
        last_error: String(message || "").slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
  } catch {
    /* best effort */
  }
}

// Returns a usable access token for the company's connection, refreshing
// server-side when the stored one is expired or about to expire.
// Throws an Error with a plain-language message on any failure, and
// flips the connection to "needs_attention" when QuickBooks refuses the
// refresh (revoked or expired grant) -- never a silent sync failure.
export async function getAccessToken(db, companyId) {
  const connection = await loadConnection(db, companyId);
  if (!connection || connection.status === "disconnected") {
    throw new Error("QuickBooks is not connected for this company yet");
  }
  const { data: tokens, error } = await db
    .from("integration_tokens")
    .select("*")
    .eq("connection_id", connection.id)
    .single();
  if (error || !tokens) {
    await markNeedsAttention(db, connection, "The stored QuickBooks sign-in is missing. Reconnect QuickBooks.");
    throw new Error("The stored QuickBooks sign-in is missing. Reconnect QuickBooks.");
  }
  const expiresAt = tokens.access_expires_at ? new Date(tokens.access_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 120_000) {
    return { connection, accessToken: tokens.access_token };
  }
  let payload;
  try {
    payload = await refreshTokens(tokens.refresh_token);
  } catch (e) {
    await markNeedsAttention(db, connection, "QuickBooks refused the saved sign-in. Reconnect QuickBooks.");
    await logSync(db, {
      companyId,
      direction: "auth",
      event: "token_refresh_failed",
      summary: "Saved sign-in refused by QuickBooks; connection marked needs attention.",
    });
    throw new Error("QuickBooks refused the saved sign-in. Please reconnect QuickBooks.");
  }
  await storeTokens(db, connection, payload);
  if (connection.status !== "connected" || connection.last_error) {
    await db
      .from("integration_connections")
      .update({ status: "connected", last_error: "", updated_at: new Date().toISOString() })
      .eq("id", connection.id);
    connection.status = "connected";
    connection.last_error = "";
  }
  return { connection, accessToken: payload.access_token };
}

export class QboError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status || 0;
  }
}

function faultMessage(data, status) {
  const first = data?.Fault?.Error?.[0];
  if (first) {
    const detail = [first.Message, first.Detail].filter(Boolean).join(" -- ");
    if (detail) return `QuickBooks said: ${detail}`.slice(0, 500);
  }
  if (data?.error) return `QuickBooks said: ${data.error}`.slice(0, 500);
  return `QuickBooks request failed (${status})`;
}

// Thin QuickBooks API client. path is relative to /v3/company/{realm}/.
export async function qboRequest(connection, accessToken, path, { method = "GET", body = null, requestId = null } = {}) {
  const cfg = intuitConfig();
  const base = `${apiBase(cfg.environment)}/${connection.realm_id}`;
  const sep = path.includes("?") ? "&" : "?";
  const url = requestId ? `${base}/${path}${sep}requestid=${encodeURIComponent(requestId)}` : `${base}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new QboError(faultMessage(data, res.status), res.status);
  return data;
}

export async function qboQuery(connection, accessToken, query) {
  const data = await qboRequest(connection, accessToken, `query?query=${encodeURIComponent(query)}`);
  return data?.QueryResponse || {};
}

// QBO string-literal escaping for query where-clauses.
export function qboEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// Display summaries stored in integration_remote_records and returned to
// the UI. Always labeled as QuickBooks data by the callers (section
// 15.4: provider records are the official books; these are views).
export function summarizeRemote(entityType, rec) {
  if (!rec) return {};
  if (entityType === "invoice") {
    return {
      id: String(rec.Id || ""),
      number: rec.DocNumber || "",
      date: rec.TxnDate || "",
      customer: rec.CustomerRef?.name || "",
      total: rec.TotalAmt != null ? Number(rec.TotalAmt) : null,
      balance: rec.Balance != null ? Number(rec.Balance) : null,
    };
  }
  if (entityType === "payment") {
    return {
      id: String(rec.Id || ""),
      date: rec.TxnDate || "",
      customer: rec.CustomerRef?.name || "",
      total: rec.TotalAmt != null ? Number(rec.TotalAmt) : null,
    };
  }
  // expense (QuickBooks "Purchase")
  return {
    id: String(rec.Id || ""),
    date: rec.TxnDate || "",
    payee: rec.EntityRef?.name || rec.AccountRef?.name || "",
    total: rec.TotalAmt != null ? Number(rec.TotalAmt) : null,
  };
}

export async function cacheRemoteRecord(db, companyId, entityType, rec) {
  const summary = summarizeRemote(entityType, rec);
  if (!summary.id) return;
  try {
    await db.from("integration_remote_records").upsert(
      {
        company_id: companyId,
        provider: QBO_PROVIDER,
        entity_type: entityType,
        provider_id: summary.id,
        summary,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "company_id,provider,entity_type,provider_id" }
    );
  } catch {
    /* cache is best effort */
  }
}

// True when a Supabase error means the integration tables do not exist
// yet (migration 070 not run) -- the app shows an honest "setup pending"
// state instead of crashing (and never locks the owner out).
export function isMissingIntegrationSchema(error) {
  if (!error) return false;
  const text = `${error.code || ""} ${error.message || ""}`;
  return (
    text.includes("42P01") ||
    text.includes("PGRST205") ||
    /integration_(connections|tokens|sync_items|sync_log|account_mappings|oauth_states|remote_records)/.test(text) &&
      /does not exist|not found|schema cache/i.test(text)
  );
}

export function newStateNonce() {
  return crypto.randomUUID();
}
