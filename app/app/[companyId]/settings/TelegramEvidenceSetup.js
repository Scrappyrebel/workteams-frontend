"use client";

import { useEffect, useState } from "react";
import { useCompany } from "../../../../lib/company-context";
import { supabase } from "../../../../lib/supabase";

// This is a READ-ONLY discovery tool; it never enables media forwarding.
export default function TelegramEvidenceSetup() {
  const { company, member } = useCompany();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setStatus(null); setError(""); }, [company?.id]);
  if (member?.role !== "owner" || !company?.id) return null;

  async function check(verify) {
    setBusy(true); setError("");
    try {
      const sb = supabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) throw Error("Sign in again to verify your company.");
      const response = await fetch("/api/admin/telegram-groups?companyId=" +
        encodeURIComponent(company.id), {
        method: verify ? "POST" : "GET",
        headers: { Authorization: "Bearer " + session.access_token },
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.status === "command_not_found") throw Error(
          "No matching command found yet. Send the exact command to the private group, then check again.");
        if (body.status === "ambiguous_group") throw Error(
          "More than one group matched. Nothing was saved; contact the app owner.");
        throw Error(body.error || "Could not verify the Telegram group.");
      }
      if (body.companyId !== company.id) throw Error("Company changed; reload settings.");
      setStatus(body);
    } catch (cause) {
      setError(cause?.message || "Telegram group verification failed.");
    } finally { setBusy(false); }
  }

  return (
    <section className="card" aria-label="Private Telegram evidence group setup"
      style={{ marginTop: 20 }}>
      <h3>Private Telegram evidence group</h3>
      <p>Each company has its OWN private WorkTeams group. This setup only
        identifies that group; it does not send any videos or photos.</p>
      <button type="button" onClick={() => void check(false)} disabled={busy}>
        {busy ? "Checking…" : "Get this company's setup command"}
      </button>
      {status?.command && <div style={{ marginTop: 14 }}>
        <p>In Telegram, open <strong>{status.expectedGroup}</strong> and send
          this exact command to the WorkTeams Evidence Bot:</p>
        <code style={{ overflowWrap: "anywhere" }}>{status.command}</code>{" "}
        <button type="button" onClick={() => navigator.clipboard?.writeText(status.command)}
          style={{ marginLeft: 8 }}>Copy command</button>
      </div>}
      {status?.command && <div style={{ marginTop: 12 }}>
        <button type="button" onClick={() => void check(true)} disabled={busy}>
          Verify this Telegram group
        </button>
      </div>}
      {status?.status === "verified_candidate" && <p role="status">
        Group matched: <strong>{status.title}</strong>.
        Telegram group ID: <code>{status.chatId}</code>.
        <strong> Uploads are not enabled.</strong>
      </p>}
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
    </section>
  );
}
