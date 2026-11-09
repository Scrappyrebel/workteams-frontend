"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function SendToBooksButton({ companyId }) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    if (!companyId) return;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase().auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(
          `/api/books/send?company_id=${encodeURIComponent(companyId)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const out = await res.json().catch(() => ({}));
        if (alive) setConnected(Boolean(out.connected));
      } catch {
        // Stay hidden if the check cannot be made.
      }
    })();
    return () => {
      alive = false;
    };
  }, [companyId]);

  if (!companyId || !connected) return null;

  async function send() {
    setBusy(true);
    setMessage("");
    try {
      const {
        data: { session },
      } = await supabase().auth.getSession();
      const res = await fetch("/api/books/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ company_id: companyId }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(out.error || "The send did not go through.");
        return;
      }
      if (out.error) {
        setMessage(`The send stopped: ${out.error}`);
        return;
      }
      setMessage(
        `Sent to Ridgefront Accounting: ${out.saved} new record${
          out.saved === 1 ? "" : "s"
        } saved, ${out.skipped} already there and skipped${
          out.updated ? `, ${out.updated} updated` : ""
        }. ${out.heldBack} record${
          out.heldBack === 1 ? "" : "s"
        } on voided invoices were held back.`
      );
    } catch {
      setMessage("The send did not go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
      <h3 style={{ marginTop: 0 }}>Ridgefront Accounting</h3>
      <p style={{ color: "var(--muted)" }}>
        Send this company&rsquo;s invoice payments from the last 45 days to the
        books. Anything already sent is skipped, never doubled.
      </p>
      <button type="button" onClick={send} disabled={busy}>
        {busy ? "Sending…" : "Send to books now"}
      </button>
      {message && (
        <p role="status" style={{ color: "var(--muted)", marginBottom: 0 }}>
          {message}
        </p>
      )}
    </section>
  );
}
