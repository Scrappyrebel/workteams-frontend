"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// QuickBooks panel on the invoice detail page (owner/admin context --
// the invoice page itself is already manager-gated, and the integration
// tables are owner/admin at the RLS level).
//
// Behavior contract:
// * Before migration 068 runs, or before QuickBooks is connected, this
//   panel stays calm and quiet -- an invoice is never blocked by it.
// * Sending is idempotent: the server short-circuits a posted invoice
//   and keys the QuickBooks create to the sync item, so double-taps
//   and retries can never duplicate the invoice in QuickBooks.
// * Posting never edits this invoice; it records the link in
//   integration_sync_items only.
export default function QuickBooksInvoicePanel({ companyId, invoice }) {
  const [state, setState] = useState(null); // null=loading, "hidden", "not_connected", or { connection, item }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const sendable = invoice && (invoice.status === "issued" || invoice.status === "paid");

  async function load() {
    const sb = supabase();
    const { data: conn, error } = await sb
      .from("integration_connections")
      .select("status, provider_company_name")
      .eq("company_id", companyId)
      .eq("provider", "quickbooks")
      .maybeSingle();
    if (error) {
      // Migration not run yet: hide the panel entirely.
      setState("hidden");
      return;
    }
    if (!conn || conn.status === "disconnected") {
      setState("not_connected");
      return;
    }
    const { data: item } = await sb
      .from("integration_sync_items")
      .select("status, provider_id, provider_doc_number, detail")
      .eq("company_id", companyId)
      .eq("provider", "quickbooks")
      .eq("source_table", "invoices")
      .eq("source_id", invoice.id)
      .eq("operation", "post")
      .maybeSingle();
    setState({ connection: conn, item: item || null });
  }

  useEffect(() => {
    if (companyId && invoice?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, invoice?.id]);

  async function send() {
    setBusy(true);
    setMsg("");
    try {
      const {
        data: { session },
      } = await supabase().auth.getSession();
      const res = await fetch("/api/integrations/quickbooks/post-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ companyId, invoiceId: invoice.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || "That invoice didn't send.");
      } else if (data.alreadyPosted) {
        setMsg("Already in QuickBooks -- it was not sent twice.");
      } else {
        setMsg(`Sent -- QuickBooks invoice ${data.docNumber || data.providerId}.`);
      }
    } catch {
      setMsg("That invoice didn't send. Check your connection and try again.");
    }
    setBusy(false);
    load();
  }

  if (!sendable || state === null || state === "hidden") return null;

  if (state === "not_connected") {
    return (
      <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
        <h3 style={{ marginTop: 0 }}>QuickBooks</h3>
        <p style={{ marginBottom: 0, color: "var(--muted)" }}>
          QuickBooks isn't connected for this company.{" "}
          <Link href={`/app/${companyId}/connections`}>Connect it on the Connections page</Link>{" "}
          to send this invoice straight into your books.
        </p>
      </section>
    );
  }

  const { connection, item } = state;
  const attention = connection.status === "needs_attention";

  return (
    <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
      <h3 style={{ marginTop: 0 }}>QuickBooks</h3>
      {attention && (
        <p style={{ color: "#92400e" }}>
          🟠 The QuickBooks connection needs attention.{" "}
          <Link href={`/app/${companyId}/connections`}>Reconnect it</Link> before sending.
        </p>
      )}
      {item?.status === "posted" ? (
        <p style={{ marginBottom: 0 }}>
          ✅ Sent to QuickBooks
          {item.provider_doc_number ? ` -- QuickBooks invoice #${item.provider_doc_number}` : ""}
          {item.provider_id ? ` (id ${item.provider_id})` : ""}. Sending again is safe: it won't
          be duplicated.
        </p>
      ) : item?.status === "queued_unmapped" ? (
        <p style={{ marginBottom: 0 }}>
          🕓 Waiting to send. {item.detail || "An account mapping is needed first."}{" "}
          <Link href={`/app/${companyId}/connections/quickbooks`}>Open QuickBooks sync</Link>
        </p>
      ) : item?.status === "failed" ? (
        <>
          <p>
            ⚠️ The last send didn't go through. {item.detail || ""} Your WorkTeams invoice is
            unchanged.
          </p>
          {msg && <p style={{ color: "#b3261e" }}>{msg}</p>}
          <button onClick={send} disabled={busy || attention} style={button}>
            {busy ? "Sending…" : "Try sending again"}
          </button>
        </>
      ) : item?.status === "posting" ? (
        <p style={{ marginBottom: 0 }}>
          Sending to QuickBooks… if this stays here, use the button on the{" "}
          <Link href={`/app/${companyId}/connections/quickbooks`}>QuickBooks sync page</Link> --
          a retry can't post it twice.
        </p>
      ) : (
        <>
          <p>
            This invoice hasn't been sent to{" "}
            {connection.provider_company_name || "your QuickBooks company"} yet.
          </p>
          {msg && <p style={{ color: "#b3261e" }}>{msg}</p>}
          <button onClick={send} disabled={busy || attention} style={button}>
            {busy ? "Sending…" : "Send to QuickBooks"}
          </button>
        </>
      )}
    </section>
  );
}

const button = {
  padding: "10px 20px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
