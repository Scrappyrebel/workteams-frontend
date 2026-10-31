"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";

// Connections honesty rules (kept from the original page):
// * A provider is only shown as connected when it really is connected.
// * QuickBooks Online below is REAL: an owner/manager connects the
//   company's own QuickBooks through Intuit's sign-in, and the sync
//   center (mapping, queue, QuickBooks data) lives on the QuickBooks
//   page. Tokens never reach the browser -- this page reads connection
//   STATUS only (integration_connections carries no token values).
// * Gusto is "coming soon": Gusto production access needs their partner
//   approval first, so there is deliberately NO connect button.
// * Every other card stays exactly as honest as before: not connected,
//   and the button just opens the provider's own site.
// * The ADP / Paychex / QuickBooks Payroll cards are EXTERNAL LINKS,
//   not connections (verified: no API route, no token or credential
//   storage, and no sync job exists for any of them -- the only
//   provider the integration tables accept is "quickbooks", meaning
//   QuickBooks Online accounting, migration 070). Their copy must
//   never use send/sync language for WorkTeams, must not suggest a
//   credential sign-in exists here, and must say plainly that no
//   data moves either way. QuickBooks Payroll is a separate Intuit
//   product from the QuickBooks Online accounting connection below;
//   connecting accounting does not connect payroll.
const PAYROLL_PROVIDERS = [
  { name: "ADP", url: "https://www.adp.com", blurb: "Payroll service you run in your own ADP account, outside WorkTeams." },
  { name: "Paychex", url: "https://www.paychex.com", blurb: "Payroll service you run in your own Paychex account, outside WorkTeams." },
  { name: "QuickBooks Payroll", url: "https://quickbooks.intuit.com/payroll/", blurb: "Intuit's payroll service, run in your own QuickBooks account, outside WorkTeams. It is separate from the QuickBooks Online accounting connection below -- connecting accounting does not connect payroll." },
];

export default function ConnectionsPage() {
  const { company, member, loading } = useCompany();
  const isManager = member && (member.role === "owner" || member.role === "admin");

  // QuickBooks connection state: null = still loading, "setup" = the
  // database step hasn't run yet, otherwise the connection row (or
  // "none" when this company has never connected).
  const [qbo, setQbo] = useState(null);
  const [qboBusy, setQboBusy] = useState(false);
  const [qboMsg, setQboMsg] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [banner, setBanner] = useState("");

  async function loadQbo() {
    const sb = supabase();
    const { data, error } = await sb
      .from("integration_connections")
      .select("status, provider_company_name, realm_id, connected_at, last_sync_at, last_error")
      .eq("company_id", company.id)
      .eq("provider", "quickbooks")
      .maybeSingle();
    if (error) {
      // Table missing (migration 070 not run yet) or RLS: show the calm
      // setup-pending state, never a crash and never a lockout.
      setQbo("setup");
      return;
    }
    setQbo(data || "none");
  }

  useEffect(() => {
    if (!loading && company && isManager) loadQbo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, isManager]);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const state = qs.get("qbo");
    if (state === "connected") setBanner("QuickBooks is connected. Your WorkTeams invoices can now be sent to your own QuickBooks.");
    else if (state === "error") setBanner("QuickBooks didn't connect. Nothing was changed -- you can try again below.");
  }, []);

  async function authHeaders() {
    const {
      data: { session },
    } = await supabase().auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    };
  }

  async function startConnect() {
    setQboBusy(true);
    setQboMsg("");
    try {
      const res = await fetch("/api/integrations/quickbooks/connect", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ companyId: company.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setQboMsg(data.error || "Could not start the QuickBooks connection.");
        setQboBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setQboMsg("Could not start the QuickBooks connection. Check your connection and try again.");
      setQboBusy(false);
    }
  }

  async function disconnect() {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }
    setQboBusy(true);
    setQboMsg("");
    try {
      const res = await fetch("/api/integrations/quickbooks/disconnect", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ companyId: company.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQboMsg(data.error || "Could not disconnect QuickBooks.");
      } else {
        setConfirmDisconnect(false);
        await loadQbo();
      }
    } catch {
      setQboMsg("Could not disconnect QuickBooks. Check your connection and try again.");
    }
    setQboBusy(false);
  }

  if (loading || !company) return <p>Loading…</p>;

  const qboConnected = qbo && qbo !== "setup" && qbo !== "none" && qbo.status === "connected";
  const qboAttention = qbo && qbo !== "setup" && qbo !== "none" && qbo.status === "needs_attention";

  return (
    <div>
      <p className="eyebrow">CONNECTIONS</p>
      <h2 style={{ fontSize: "1.8rem" }}>Payroll & accounting links</h2>
      <p style={{ color: "var(--muted)" }}>
        WorkTeams doesn't run payroll. The payroll providers below are not connected to
        WorkTeams -- their cards are external links, and their buttons open each
        provider's own site so you can set up your own account there and hand off hour
        reports by hand. QuickBooks Online accounting now connects for
        real: an owner or manager can link this company's own QuickBooks below.
      </p>

      {banner && (
        <section className="panel" style={{ padding: 16, margin: "16px 0", borderColor: "var(--brand)" }}>
          <p style={{ margin: 0 }}>{banner}</p>
        </section>
      )}

      <h3 style={{ marginTop: 26 }}>Payroll providers — external links, not connections</h3>
      <p style={{ color: "var(--muted)" }}>
        None of the providers in this section is connected to WorkTeams, and nothing syncs
        to or from any of them. To hand off hours today, export the CSV from your Payroll
        report and upload it on the provider's own site yourself.{" "}
        <Link href={`/app/${company.id}/payroll`}>Open the Payroll report →</Link>
      </p>
      <div className="portal-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        <div className="portal-card" style={{ minHeight: 0, padding: 22 }}>
          <span className="card-kicker">Gusto</span>
          <p style={{ ...statusBadge }}>🔜 Coming soon -- partner approval pending</p>
          <p style={{ marginTop: 8 }}>Hand off your hour reports for payroll runs.</p>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
            Gusto connections need Gusto's partner approval before they can switch on, so
            there's no connect button yet. Your Gusto payroll keeps working exactly as it
            does today -- this will simply link up when approval lands.
          </p>
        </div>
        {PAYROLL_PROVIDERS.map((p) => (
          <div className="portal-card" key={p.name} style={{ minHeight: 0, padding: 22 }}>
            <span className="card-kicker">{p.name}</span>
            <p style={{ ...statusBadge }}>⚪ Not connected — external link</p>
            <p style={{ marginTop: 8 }}>{p.blurb}</p>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              There is no connection between WorkTeams and {p.name}: no sign-in is saved
              here, no credentials are entered here, and no hours or other data sync
              either way. The button below just opens {p.name}'s own website.
            </p>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginTop: 10,
                padding: "10px 20px",
                borderRadius: 999,
                border: "1px solid var(--line)",
                background: "#fff",
                fontWeight: 800,
                color: "var(--ink)",
                textDecoration: "none",
              }}
            >
              Go to {p.name}'s site ↗
            </a>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 30 }}>QuickBooks</h3>
      <section className="panel" style={{ padding: 24 }}>
        <p className="eyebrow">QUICKBOOKS ONLINE</p>
        {!isManager ? (
          <p style={{ marginBottom: 0 }}>
            The QuickBooks connection is managed by this company's owner and managers.
          </p>
        ) : qbo === null ? (
          <p style={{ marginBottom: 0 }}>Checking the QuickBooks connection…</p>
        ) : qbo === "setup" ? (
          <>
            <p style={{ ...statusBadge }}>🛠 Setup pending</p>
            <p>
              The QuickBooks connection isn't switched on yet -- a setup step still has to
              run first. Nothing is connected and nothing is synced.
            </p>
          </>
        ) : qboConnected || qboAttention ? (
          <>
            <p style={{ ...statusBadge, ...(qboAttention ? attentionBadge : connectedBadge) }}>
              {qboAttention ? "🟠 Needs attention" : "🟢 Connected"}
            </p>
            <p>
              Connected to <strong>{qbo.provider_company_name || "your QuickBooks company"}</strong>
              {qbo.realm_id ? ` (QuickBooks company ${qbo.realm_id})` : ""}. QuickBooks is your
              official set of books; WorkTeams stays your day-to-day system, and invoices you
              send from WorkTeams post into QuickBooks once.
            </p>
            {qboAttention && (
              <p style={{ color: "#92400e" }}>
                {qbo.last_error || "The connection needs attention. Reconnect QuickBooks to fix it."}
              </p>
            )}
            {qboMsg && <p style={{ color: "#b3261e" }}>{qboMsg}</p>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <Link href={`/app/${company.id}/connections/quickbooks`} style={primaryLink}>
                Open QuickBooks sync →
              </Link>
              {qboAttention && (
                <button onClick={startConnect} disabled={qboBusy} style={button}>
                  {qboBusy ? "Opening QuickBooks…" : "Reconnect QuickBooks"}
                </button>
              )}
              <button
                onClick={disconnect}
                disabled={qboBusy}
                style={confirmDisconnect ? dangerButton : ghostButton}
              >
                {confirmDisconnect ? "Tap again to disconnect" : "Disconnect"}
              </button>
            </div>
            {confirmDisconnect && (
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: 0 }}>
                Disconnecting stops syncing right away and removes the saved sign-in.
                Records already posted stay in QuickBooks -- nothing is deleted on either side.
              </p>
            )}
          </>
        ) : (
          <>
            <p style={{ ...statusBadge }}>⚪ Not connected</p>
            <p>
              Connect this company's own QuickBooks Online and your WorkTeams customer
              invoices can be sent straight into your books -- once each, never twice.
              You'll sign in on QuickBooks' own site; WorkTeams never sees your QuickBooks
              password.
            </p>
            {qboMsg && <p style={{ color: "#b3261e" }}>{qboMsg}</p>}
            <button onClick={startConnect} disabled={qboBusy} style={button}>
              {qboBusy ? "Opening QuickBooks…" : "Connect QuickBooks"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

const statusBadge = {
  display: "inline-block",
  marginTop: 10,
  fontSize: "0.85rem",
  fontWeight: 800,
  background: "#f1f3f4",
  color: "var(--muted)",
  borderRadius: 999,
  padding: "4px 12px",
};

const connectedBadge = { background: "#e6f4ea", color: "#1a7f37" };
const attentionBadge = { background: "#fef3c7", color: "#92400e" };

const button = {
  padding: "12px 22px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const primaryLink = {
  display: "inline-block",
  padding: "12px 22px",
  borderRadius: 999,
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
};

const ghostButton = {
  padding: "12px 22px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  color: "var(--ink)",
  fontWeight: 800,
  cursor: "pointer",
};

const dangerButton = {
  padding: "12px 22px",
  borderRadius: 999,
  border: "none",
  background: "#b3261e",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
