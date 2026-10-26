import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const read = (p) => readFileSync(p, "utf8");

// QuickBooks integration (migration 070) invariants, per the owner's
// accounting handoff extension section 15:
// * Accounting scope ONLY -- the payments scope is never requested.
// * Tokens are reachable only from server code: the tokens table is
//   named only in server files, RLS-locked with no client grants, and
//   no client component ever touches any integration token path.
// * The invoice post path is idempotency-keyed end to end (sync item
//   key -> QuickBooks create requestid) and never edits the invoice.
// * The migration stays out of `companies` (migration-024 lesson).
// * Gusto stays honestly "coming soon" -- no connect path -- and every
//   other static card stays "Not connected".

const SQL_PATH = "supabase/070_quickbooks_integration.sql";
const TABLES = [
  "integration_connections",
  "integration_tokens",
  "integration_oauth_states",
  "integration_account_mappings",
  "integration_sync_items",
  "integration_sync_log",
  "integration_remote_records",
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const appFiles = [...walk("app"), ...walk("lib"), ...walk("components")];
const fileText = new Map(appFiles.map((p) => [p, read(p)]));

// Built indirectly so this guard file itself never contains the literal
// string it forbids.
const PAYMENT_SCOPE = ["com.intuit.quickbooks", "payment"].join(".");

test("Migration 070 exists and creates the seven integration tables with RLS on", () => {
  assert.ok(existsSync(SQL_PATH), "migration 070 must exist");
  const sql = read(SQL_PATH);
  const sqlLower = sql.toLowerCase();
  for (const t of TABLES) {
    assert.ok(sqlLower.includes(`create table if not exists public.${t}`), `migration must create public.${t}`);
    assert.ok(
      sqlLower.includes(`alter table public.${t} enable row level security`),
      `migration must enable RLS on public.${t}`
    );
  }
  // In-block grants (post-2026-10-30 regime): every table grants the
  // service role in the same block.
  for (const t of TABLES) {
    assert.ok(
      sqlLower.includes(`grant all on public.${t} to service_role;`),
      `migration must grant all on public.${t} to service_role`
    );
  }
});

test("Tokens and OAuth states are service-role only -- no client grants, no policies", () => {
  const sqlLower = read(SQL_PATH).toLowerCase();
  for (const t of ["integration_tokens", "integration_oauth_states"]) {
    assert.ok(
      !new RegExp(`grant[^;]*on public\\.${t} to authenticated`).test(sqlLower),
      `${t} must never be granted to authenticated`
    );
    assert.ok(
      !new RegExp(`grant[^;]*on public\\.${t} to anon`).test(sqlLower),
      `${t} must never be granted to anon`
    );
    const policyTargets = [...sqlLower.matchAll(/create policy[^;]*?on public\.(\w+)/g)].map((m) => m[1]);
    assert.ok(!policyTargets.includes(t), `${t} must have no RLS policies (service role only)`);
    assert.ok(
      sqlLower.includes(`revoke all on public.${t} from authenticated, anon;`),
      `${t} must explicitly revoke authenticated/anon`
    );
  }
});

test("Status/mapping/queue tables are owner/admin only at the RLS level", () => {
  const sqlLower = read(SQL_PATH).toLowerCase();
  const policyChunks = sqlLower.split("create policy").slice(1);
  assert.ok(policyChunks.length >= 8, "expected owner/admin policies across the client-visible integration tables");
  for (const chunk of policyChunks) {
    assert.ok(chunk.split(";")[0].includes("to authenticated"), "every integration policy must be TO authenticated");
    assert.ok(
      chunk.includes("m.role in ('owner', 'admin')"),
      "every integration policy must key on company_members role in ('owner','admin')"
    );
  }
  assert.ok(!sqlLower.includes("'employee'"), "no integration policy may grant employees access");
  assert.ok(!sqlLower.includes("'supervisor'"), "no integration policy may grant supervisors access");
});

test("Migration 070 adds no columns to companies (migration-024 lesson)", () => {
  const sqlLower = read(SQL_PATH).toLowerCase();
  assert.ok(!sqlLower.includes("alter table public.companies"), "integration must live in side tables, never companies columns");
  assert.ok(!sqlLower.includes("alter table companies"), "integration must live in side tables, never companies columns");
});

test("Accounting scope only -- the QuickBooks payments scope appears nowhere in app code", () => {
  for (const [p, text] of fileText) {
    assert.ok(!text.includes(PAYMENT_SCOPE), `${p} must never request the QuickBooks payments scope`);
  }
  const server = read("lib/integrations/quickbooks-server.js");
  assert.ok(
    server.includes("com.intuit.quickbooks.accounting"),
    "the server lib must request exactly the accounting scope"
  );
});

test("The tokens table is named only in server files, and never in a client component", () => {
  const allowed = (p) =>
    p.startsWith("app/api/") || p.startsWith("lib/integrations/");
  for (const [p, text] of fileText) {
    if (text.includes("integration_tokens")) {
      assert.ok(allowed(p), `${p} references integration_tokens but is not a server file`);
      assert.ok(!text.includes('"use client"'), `${p} references integration_tokens and must not be a client component`);
    }
    if (text.includes("integration_oauth_states")) {
      assert.ok(allowed(p), `${p} references integration_oauth_states but is not a server file`);
    }
  }
  // No API route or lib file may return a raw token value to the browser.
  for (const [p, text] of fileText) {
    if (p.startsWith("app/api/integrations/")) {
      assert.ok(
        !/NextResponse\.json\([^)]*(access_token|refresh_token)/.test(text),
        `${p} must never send token values in a response`
      );
    }
  }
});

test("Invoice post path is idempotency-keyed end to end and never edits the invoice", () => {
  const route = read("app/api/integrations/quickbooks/post-invoice/route.js");
  assert.ok(route.includes("idempotency_key"), "post path must carry the sync item idempotency_key");
  assert.ok(route.includes("requestId: item.idempotency_key"), "the QuickBooks create must send requestid = idempotency_key");
  assert.ok(route.includes('status === "posted"') || route.includes("alreadyPosted"), "a posted item must short-circuit before any QuickBooks call");
  assert.ok(route.includes("queued_unmapped"), "unmapped categories must land in the queue, never post");
  // Posting records link/status only -- it must not write the invoicing tables.
  for (const t of ["invoices", "invoice_line_items", "invoice_payments"]) {
    assert.ok(
      !new RegExp(`\\.from\\("${t}"\\)\\s*\\.\\s*(insert|update|upsert|delete)`).test(route),
      `post path must never write public.${t}`
    );
    assert.ok(
      !new RegExp(`from\\("${t}"\\)\\.update`).test(route),
      `post path must never update public.${t}`
    );
  }
});

test("OAuth + webhook discipline: state nonce, verifier token, fetch-after-notify", () => {
  const connect = read("app/api/integrations/quickbooks/connect/route.js");
  assert.ok(connect.includes("integration_oauth_states"), "connect must mint a one-time state nonce");
  const callback = read("app/api/integrations/quickbooks/callback/route.js");
  assert.ok(callback.includes("integration_oauth_states"), "callback must consume the state nonce");
  const webhook = read("app/api/integrations/quickbooks/webhook/route.js");
  assert.ok(webhook.includes("INTUIT_WEBHOOK_VERIFIER_TOKEN") || webhook.includes("intuitWebhookVerifierToken"), "webhook must check the verifier token");
  assert.ok(webhook.includes("createHmac"), "webhook must verify the HMAC signature");
  assert.ok(webhook.includes("qboQuery"), "webhook must fetch records after notify, not trust payload data");
  const server = read("lib/integrations/quickbooks-server.js");
  assert.ok(server.includes("INTUIT_REDIRECT_URI") || server.includes("redirectUri"), "redirect URI must come from env");
  assert.ok(!/redirect_uri\s*:\s*"/.test(server), "redirect URI must never be a hard-coded literal");
});

test("Secrets come from env only -- no Intuit credential literals in app code", () => {
  for (const [p, text] of fileText) {
    assert.ok(!/INTUIT_CLIENT_SECRET\s*=\s*"/.test(text), `${p} must not hard-code the Intuit client secret`);
    assert.ok(!/client_secret\s*:\s*"/.test(text), `${p} must not hard-code a client secret value`);
  }
  const server = read("lib/integrations/quickbooks-server.js");
  for (const name of [
    "INTUIT_CLIENT_ID",
    "INTUIT_CLIENT_SECRET",
    "INTUIT_ENVIRONMENT",
    "INTUIT_REDIRECT_URI",
    "INTUIT_WEBHOOK_VERIFIER_TOKEN",
  ]) {
    assert.ok(server.includes(name), `${name} must be read from env in the server lib`);
  }
  assert.ok(server.includes('"sandbox"'), "environment must default to sandbox");
});

test("Connections page honesty: QuickBooks is real, Gusto is coming soon, others stay not connected", () => {
  const page = read("app/app/[companyId]/connections/page.js");
  assert.ok(page.includes("partner approval pending"), "Gusto must be labeled coming soon -- partner approval pending");
  assert.ok(!page.includes("Connect Gusto"), "Gusto must have no connect button");
  assert.ok(!page.includes("/api/integrations/gusto"), "there must be no Gusto connect route");
  assert.ok(page.includes("Not connected"), "unconnected providers must stay honestly labeled");
  assert.ok(page.includes("/api/integrations/quickbooks/connect"), "the QuickBooks card must wire the real connect route");
  assert.ok(page.includes("integration_connections"), "the QuickBooks card must read real connection status");
});
