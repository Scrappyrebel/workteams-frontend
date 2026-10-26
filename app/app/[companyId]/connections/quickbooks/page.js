"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { getUser } from "../../../../../lib/session";
import { APP_CATEGORIES } from "../../../../../lib/integrations/categories";

// QuickBooks sync center (owner/admin only):
// * Account mapping -- WorkTeams categories point at THIS company's own
//   QuickBooks chart of accounts / tax codes. Unmapped items are never
//   posted; they wait in the queue below, counted and visible.
// * Waiting queue -- issued invoices not yet in QuickBooks, each with
//   its plain reason and a Send button (sending is idempotent: an
//   invoice can never land in QuickBooks twice).
// * QuickBooks data -- invoices/payments/expenses read live from
//   QuickBooks and labeled as QuickBooks data. QuickBooks is the books
//   of record; WorkTeams records are never edited from here.
// * Sync history -- the audit log of what was sent, acknowledged, or
//   failed.

function money(n) {
  const v = Number(n);
  return Number.isNaN(v) ? "—" : `$${v.toFixed(2)}`;
}

export default function QuickBooksSyncPage() {
  const { company, member, loading } = useCompany();
  const isManager = member && (member.role === "owner" || member.role === "admin");

  const [connection, setConnection] = useState(null); // null=loading, "setup", "none", or row
  const [mappings, setMappings] = useState([]);
  const [accounts, setAccounts] = useState(null);
  const [taxCodes, setTaxCodes] = useState(null);
  const [accountsError, setAccountsError] = useState("");
  const [choices, setChoices] = useState({});
  const [savingCategory, setSavingCategory] = useState("");
  const [mapMsg, setMapMsg] = useState("");

  const [invoices, setInvoices] = useState([]);
  const [syncItems, setSyncItems] = useState([]);
  const [sendingId, setSendingId] = useState("");
  const [queueMsg, setQueueMsg] = useState({});

  const [dataType, setDataType] = useState("");
  const [dataRows, setDataRows] = useState(null);
  const [dataNote, setDataNote] = useState("");
  const [dataBusy, setDataBusy] = useState(false);

  const [log, setLog] = useState([]);

  const connected = connection && connection !== "setup" && connection !== "none" && connection.status === "connected";
  const attention = connection && connection !== "setup" && connection !== "none" && connection.status === "needs_attention";

  async function authHeaders() {
    const {
      data: { session },
    } = await supabase().auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    };
  }

  async function loadAll() {
    const sb = supabase();
    const { data: conn, error } = await sb
      .from("integration_connections")
      .select("status, provider_company_name, realm_id, connected_at, last_sync_at, last_error")
      .eq("company_id", company.id)
      .eq("provider", "quickbooks")
      .maybeSingle();
    if (error) {
      setConnection("setup");
      return;
    }
    setConnection(conn || "none");
    if (!conn) return;

    const [{ data: maps }, { data: invs }, { data: items }, { data: logRows }] = await Promise.all([
      sb.from("integration_account_mappings").select("*").eq("company_id", company.id).eq("provider", "quickbooks"),
      sb
        .from("invoices")
        .select("id, invoice_number, client_name, status, total, tax_amount, issue_date")
        .eq("company_id", company.id)
        .in("status", ["issued", "paid"])
        .order("created_at", { ascending: false })
        .limit(100),
      sb.from("integration_sync_items").select("*").eq("company_id", company.id).eq("provider", "quickbooks"),
      sb
        .from("integration_sync_log")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setMappings(maps || []);
    setInvoices(invs || []);
    setSyncItems(items || []);
    setLog(logRows || []);
  }

  useEffect(() => {
    if (!loading && company && isManager) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, isManager]);

  useEffect(() => {
    if (connected || attention) loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  async function loadAccounts() {
    setAccountsError("");
    try {
      const res = await fetch(`/api/integrations/quickbooks/accounts?companyId=${company.id}`, {
        headers: await authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAccountsError(data.error || "Could not load your QuickBooks accounts.");
        return;
      }
      setAccounts(data.accounts || []);
      setTaxCodes(data.taxCodes || []);
    } catch {
      setAccountsError("Could not load your QuickBooks accounts. Check your connection and try again.");
    }
  }

  const mappingFor = (key) => mappings.find((m) => m.app_category === key) || null;

  async function saveMapping(cat) {
    const choice = choices[cat.key];
    if (!choice) return;
    const pool = cat.refType === "tax_code" ? taxCodes || [] : accounts || [];
    const ref = pool.find((r) => String(r.id) === String(choice));
    if (!ref) return;
    setSavingCategory(cat.key);
    setMapMsg("");
    const user = await getUser();
    const { error } = await supabase()
      .from("integration_account_mappings")
      .upsert(
        {
          company_id: company.id,
          provider: "quickbooks",
          app_category: cat.key,
          provider_ref_type: cat.refType,
          provider_ref_id: String(ref.id),
          provider_ref_name: ref.name || "",
          updated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,provider,app_category" }
      );
    setSavingCategory("");
    if (error) {
      setMapMsg("Could not save that mapping. Try again.");
      return;
    }
    setMapMsg("Mapping saved.");
    loadAll();
  }

  async function clearMapping(cat) {
    setSavingCategory(cat.key);
    setMapMsg("");
    const { error } = await supabase()
      .from("integration_account_mappings")
      .delete()
      .eq("company_id", company.id)
      .eq("provider", "quickbooks")
      .eq("app_category", cat.key);
    setSavingCategory("");
    if (error) {
      setMapMsg("Could not clear that mapping. Try again.");
      return;
    }
    setMapMsg("Mapping cleared. Anything waiting on it stays in the queue.");
    loadAll();
  }

  async function sendInvoice(inv) {
    setSendingId(inv.id);
    setQueueMsg((m) => ({ ...m, [inv.id]: "" }));
    try {
      const res = await fetch("/api/integrations/quickbooks/post-invoice", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ companyId: company.id, invoiceId: inv.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQueueMsg((m) => ({ ...m, [inv.id]: data.error || "That invoice didn't send." }));
      } else if (data.alreadyPosted) {
        setQueueMsg((m) => ({ ...m, [inv.id]: "Already in QuickBooks -- it was not sent twice." }));
      } else {
        setQueueMsg((m) => ({ ...m, [inv.id]: `Sent -- QuickBooks invoice ${data.docNumber || data.providerId}.` }));
      }
    } catch {
      setQueueMsg((m) => ({ ...m, [inv.id]: "That invoice didn't send. Check your connection and try again." }));
    }
    setSendingId("");
    loadAll();
  }

  async function loadData(type) {
    setDataBusy(true);
    setDataType(type);
    setDataNote("");
    setDataRows(null);
    try {
      const res = await fetch(`/api/integrations/quickbooks/data?companyId=${company.id}&type=${type}`, {
        headers: await authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDataRows(data.rows || []);
        setDataNote("Live from QuickBooks -- your official books.");
        setDataBusy(false);
        return;
      }
      // Fall back to the last fetched copy, honestly labeled.
      const { data: cached } = await supabase()
        .from("integration_remote_records")
        .select("summary, fetched_at")
        .eq("company_id", company.id)
        .eq("provider", "quickbooks")
        .eq("entity_type", type)
        .order("fetched_at", { ascending: false })
        .limit(50);
      if (cached && cached.length > 0) {
        setDataRows(cached.map((c) => c.summary));
        setDataNote(
          `QuickBooks couldn't be reached just now (${data.error || "error"}). Showing the last fetched copy from ${new Date(cached[0].fetched_at).toLocaleString()}.`
        );
      } else {
        setDataRows([]);
        setDataNote(data.error || "Could not load QuickBooks data.");
      }
    } catch {
      setDataRows([]);
      setDataNote("Could not load QuickBooks data. Check your connection and try again.");
    }
    setDataBusy(false);
  }

  if (loading || !company) return <p>Loading…</p>;

  if (!isManager) {
    return (
      <div>
        <p className="eyebrow">QUICKBOOKS</p>
        <h2 style={{ fontSize: "1.8rem" }}>QuickBooks sync</h2>
        <p>The QuickBooks connection is managed by this company's owner and managers.</p>
        <p>
          <Link href={`/app/${company.id}/connections`}>← Back to Connections</Link>
        </p>
      </div>
    );
  }

  const itemFor = (invoiceId) => syncItems.find((i) => i.source_table === "invoices" && i.source_id === invoiceId) || null;
  const incomeMapped = Boolean(mappingFor("invoice_income"));
  const taxMapped = Boolean(mappingFor("invoice_tax"));
  const postedCount = syncItems.filter((i) => i.status === "posted").length;
  const waiting = invoices.filter((inv) => itemFor(inv.id)?.status !== "posted");

  function waitReason(inv) {
    const item = itemFor(inv.id);
    if (item?.status === "failed") return item.detail || "The last send failed. You can try again.";
    if (item?.status === "queued_unmapped") return item.detail || "Waiting on account mapping.";
    if (item?.status === "posting") return "Sending… (if this stays, try again -- it can't post twice)";
    if (!incomeMapped) return "Needs your invoice income account mapped above.";
    if (Number(inv.tax_amount) > 0 && !taxMapped) return "This invoice has sales tax -- needs your sales tax code mapped above.";
    return "Ready to send.";
  }

  return (
    <div>
      <p className="eyebrow">QUICKBOOKS ONLINE</p>
      <h2 style={{ fontSize: "1.8rem" }}>QuickBooks sync</h2>
      <p>
        <Link href={`/app/${company.id}/connections`}>← Back to Connections</Link>
      </p>

      {connection === null ? (
        <p>Checking the QuickBooks connection…</p>
      ) : connection === "setup" ? (
        <section className="panel" style={{ padding: 22 }}>
          <p style={{ margin: 0 }}>
            🛠 Setup pending -- the QuickBooks database step hasn't been run yet. Nothing is
            connected and nothing is synced.
          </p>
        </section>
      ) : connection === "none" || connection.status === "disconnected" ? (
        <section className="panel" style={{ padding: 22 }}>
          <p style={{ marginTop: 0 }}>⚪ QuickBooks isn't connected for this company yet.</p>
          <p style={{ marginBottom: 0 }}>
            Connect it from the <Link href={`/app/${company.id}/connections`}>Connections page</Link> --
            you'll sign in on QuickBooks' own site.
          </p>
        </section>
      ) : (
        <>
          <section className="panel" style={{ padding: 22 }}>
            <p style={{ marginTop: 0 }}>
              {attention ? "🟠 " : "🟢 "}
              <strong>{connection.provider_company_name || "Your QuickBooks company"}</strong>
              {connection.realm_id ? ` (QuickBooks company ${connection.realm_id})` : ""}
              {connection.last_sync_at
                ? ` • Last sent ${new Date(connection.last_sync_at).toLocaleString()}`
                : ""}
            </p>
            {attention && (
              <p style={{ color: "#92400e", marginBottom: 0 }}>
                {connection.last_error || "This connection needs attention. Reconnect from the Connections page."}
              </p>
            )}
            <p style={{ color: "var(--muted)", marginBottom: 0 }}>
              QuickBooks is your official set of books. WorkTeams sends each invoice once and
              never edits your WorkTeams records when it does.
            </p>
          </section>

          <section className="panel" style={{ padding: 22, marginTop: 18 }}>
            <h3 style={{ marginTop: 0 }}>Account mapping</h3>
            <p style={{ color: "var(--muted)" }}>
              Tell WorkTeams which of YOUR QuickBooks accounts each kind of money belongs in.
              Anything whose account isn't mapped waits in the queue below -- it is never
              posted to a guess or a "miscellaneous" account.
            </p>
            {accountsError && (
              <p style={{ color: "#b3261e" }}>
                {accountsError}{" "}
                <button onClick={loadAccounts} style={smallGhost}>Try again</button>
              </p>
            )}
            {mapMsg && <p>{mapMsg}</p>}
            <div style={{ display: "grid", gap: 14 }}>
              {APP_CATEGORIES.map((cat) => {
                const current = mappingFor(cat.key);
                const pool = cat.refType === "tax_code" ? taxCodes : accounts;
                return (
                  <div key={cat.key} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                    <strong>{cat.label}</strong>
                    <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "4px 0 8px" }}>{cat.help}</p>
                    {current ? (
                      <p style={{ margin: "0 0 8px" }}>
                        Mapped to: <strong>{current.provider_ref_name || current.provider_ref_id}</strong>{" "}
                        <button onClick={() => clearMapping(cat)} disabled={savingCategory === cat.key} style={smallGhost}>
                          Clear
                        </button>
                      </p>
                    ) : (
                      <p style={{ margin: "0 0 8px", color: "#92400e" }}>Not mapped yet.</p>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <select
                        value={choices[cat.key] || ""}
                        onChange={(e) => setChoices((c) => ({ ...c, [cat.key]: e.target.value }))}
                        style={{ ...input, maxWidth: 420 }}
                        disabled={!pool}
                      >
                        <option value="">
                          {pool ? `Choose a QuickBooks ${cat.refType === "tax_code" ? "tax code" : "account"}…` : "Loading from QuickBooks…"}
                        </option>
                        {(pool || []).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                            {r.type ? ` (${r.type})` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => saveMapping(cat)}
                        disabled={!choices[cat.key] || savingCategory === cat.key}
                        style={button}
                      >
                        {savingCategory === cat.key ? "Saving…" : current ? "Change mapping" : "Save mapping"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel" style={{ padding: 22, marginTop: 18 }}>
            <h3 style={{ marginTop: 0 }}>Waiting to send ({waiting.length})</h3>
            <p style={{ color: "var(--muted)" }}>
              Issued invoices that aren't in QuickBooks yet. {postedCount} invoice
              {postedCount === 1 ? " has" : "s have"} been sent. Sending is safe to retry --
              an invoice can never land in QuickBooks twice.
            </p>
            {waiting.length === 0 ? (
              <p style={{ marginBottom: 0 }}>Nothing waiting. Every issued invoice is in QuickBooks.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {waiting.map((inv) => (
                  <div key={inv.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ flex: "1 1 220px" }}>
                      <strong>#{inv.invoice_number}</strong> {inv.client_name} • {money(inv.total)}
                      <span style={{ display: "block", color: "var(--muted)", fontSize: "0.88rem" }}>
                        {waitReason(inv)}
                        {queueMsg[inv.id] ? ` ${queueMsg[inv.id]}` : ""}
                      </span>
                    </span>
                    <button onClick={() => sendInvoice(inv)} disabled={sendingId === inv.id} style={button}>
                      {sendingId === inv.id ? "Sending…" : "Send to QuickBooks"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel" style={{ padding: 22, marginTop: 18 }}>
            <h3 style={{ marginTop: 0 }}>Your QuickBooks data</h3>
            <p style={{ color: "var(--muted)" }}>
              Read straight from QuickBooks -- this is your official books, shown here for
              reference. Nothing here is copied into WorkTeams or edited from this page.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { key: "invoice", label: "Invoices" },
                { key: "payment", label: "Payments" },
                { key: "expense", label: "Expenses" },
              ].map((t) => (
                <button key={t.key} onClick={() => loadData(t.key)} disabled={dataBusy} style={dataType === t.key ? button : ghostButton}>
                  {t.label}
                </button>
              ))}
            </div>
            {dataNote && <p style={{ color: "var(--muted)" }}>{dataBusy ? "Loading from QuickBooks…" : dataNote}</p>}
            {dataRows && dataRows.length === 0 && !dataBusy && <p>No {dataType}s found in QuickBooks.</p>}
            {dataRows && dataRows.length > 0 && (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {dataRows.map((r) => (
                  <div key={r.id} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ flex: "1 1 200px" }}>
                      {r.number ? `#${r.number} • ` : ""}
                      {r.customer || r.payee || "—"}
                      {r.date ? <span style={{ color: "var(--muted)" }}> • {r.date}</span> : null}
                    </span>
                    <strong>{money(r.total)}</strong>
                    {r.balance != null && Number(r.balance) > 0 && (
                      <span style={{ color: "#92400e" }}>{money(r.balance)} still owed</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel" style={{ padding: 22, marginTop: 18 }}>
            <h3 style={{ marginTop: 0 }}>Sync history</h3>
            {log.length === 0 ? (
              <p style={{ marginBottom: 0, color: "var(--muted)" }}>Nothing has synced yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {log.map((row) => (
                  <p key={row.id} style={{ margin: 0, fontSize: "0.92rem" }}>
                    <span style={{ color: "var(--muted)" }}>{new Date(row.created_at).toLocaleString()} • </span>
                    {row.summary || row.event}
                  </p>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const input = {
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
};

const button = {
  padding: "10px 20px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const ghostButton = {
  padding: "10px 20px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  color: "var(--ink)",
  fontWeight: 800,
  cursor: "pointer",
};

const smallGhost = {
  border: "1px solid var(--line)",
  background: "#fff",
  color: "inherit",
  borderRadius: 999,
  padding: "4px 12px",
  fontWeight: 700,
  cursor: "pointer",
};
