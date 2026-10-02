"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUse } from "../../../../lib/tiers";

export default function ClientPortalPage() {
  const { company, member, loading } = useCompany();
  const [locations, setLocations] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [working, setWorking] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.effectiveTier || company?.tier, "portal");

  const [messages, setMessages] = useState([]);

  async function load() {
    const sb = supabase();
    const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    setLocations(locs || []);
    const { data: toks } = await sb
      .from("portal_tokens")
      .select("id, location_id, token, client_name, expires_at, created_at")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    setTokens(toks || []);
    const { data: msgs } = await sb
      .from("portal_messages")
      .select("*, locations(name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setMessages(msgs || []);
  }

  useEffect(() => {
    if (!loading && company && allowed && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  // 256-bit token from the platform CSPRNG. No Math.random() fallback:
  // if secure randomness is unavailable the link is not generated.
  function makeToken() {
    if (typeof crypto === "undefined" || !crypto.getRandomValues) {
      throw new Error("Secure random generation is not available in this browser.");
    }
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function generate(locationId, locationName) {
    setWorking(true);
    try {
      const token = makeToken();
      // Link lives for the contract when one exists: tied to the signed
      // contract's end date (or long-lived for open-ended contracts).
      // Otherwise the previous 90-day default applies.
      const sb = supabase();
      const { data: contract } = await sb
        .from("contracts")
        .select("end_date")
        .eq("company_id", company.id)
        .eq("location_id", locationId)
        .eq("status", "signed")
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let expiresAt;
      if (contract?.end_date) {
        expiresAt = new Date(contract.end_date + "T23:59:59").toISOString();
      } else if (contract) {
        expiresAt = new Date(Date.now() + 5 * 365 * 24 * 3600 * 1000).toISOString();
      } else {
        expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
      }
      const { error } = await sb.from("portal_tokens").insert({
        company_id: company.id,
        location_id: locationId,
        token,
        client_name: locationName,
        expires_at: expiresAt,
      });
      if (error) throw error;
      load();
    } catch (err) {
      alert("Could not generate link: " + err.message);
    }
    setWorking(false);
  }

  // Rotate: revoke the old token and mint a fresh one (new expiry).
  async function regenerate(t) {
    if (!confirm("Generate a new link? The old link will stop working immediately.")) return;
    setWorking(true);
    try {
      const token = makeToken();
      const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
      const { error } = await supabase()
        .from("portal_tokens")
        .update({ token, expires_at: expiresAt })
        .eq("id", t.id);
      if (error) throw error;
      load();
    } catch (err) {
      alert("Could not regenerate link: " + err.message);
    }
    setWorking(false);
  }

  async function revoke(id) {
    if (!confirm("Revoke this client link? It will stop working immediately.")) return;
    const { error } = await supabase().from("portal_tokens").delete().eq("id", id);
    if (error) alert("Could not revoke: " + error.message);
    else load();
  }

  async function copyLink(token) {
    const url = `${window.location.origin}/portal/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Link copied — send it to your client.");
    } catch {
      prompt("Copy this link:", url);
    }
  }

  async function markRead(id) {
    const { error } = await supabase().from("portal_messages").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (!error) load();
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed || !isManager) {
    return (
      <div>
        <p className="eyebrow">CLIENT PORTAL</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Client portal</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>The client portal is a <strong>Pro</strong> feature.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }

  const tokenByLocation = {};
  for (const t of tokens) tokenByLocation[t.location_id] = t;

  return (
    <div>
      <p className="eyebrow">CLIENT PORTAL</p>
      <h2 style={{ fontSize: "1.8rem" }}>Client messages</h2>
      <div style={{ display: "grid", gap: 10, margin: "18px 0 28px" }}>
        {messages.length === 0 && <p style={{ color: "var(--muted)" }}>No client messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className="portal-card" style={{ minHeight: 0, padding: "14px 18px", opacity: m.read_at ? 0.75 : 1 }}>
            <span className="card-kicker">
              {!m.read_at && <strong style={{ color: "var(--brand-deep)" }}>NEW • </strong>}
              {m.sender_name || "Client"}{m.locations?.name ? ` • ${m.locations.name}` : ""}
              {" • "}{new Date(m.created_at).toLocaleString()}
              {m.emailed_at ? " • emailed ✅" : ""}
            </span>
            {m.subject && <p style={{ fontWeight: 700, margin: "6px 0 0" }}>{m.subject}</p>}
            <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{m.body}</p>
            {!m.read_at && (
              <button onClick={() => markRead(m.id)} style={{ ...button, marginTop: 8, fontSize: "0.85rem", padding: "7px 14px" }}>
                Mark as read
              </button>
            )}
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: "1.8rem" }}>Client portal links</h2>
      <p style={{ color: "var(--muted)" }}>
        Share a read-only link per location. Clients see upcoming visits, recent inspection
        scores, and open work orders — no login needed, no financial or staff details.
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        {locations.length === 0 && <p style={{ color: "var(--muted)" }}>Add a location first.</p>}
        {locations.map((l) => {
          const t = tokenByLocation[l.id];
          return (
            <div key={l.id} className="portal-card" style={{ minHeight: 0, padding: "16px 20px" }}>
              <strong>{l.name}</strong>
              {t ? (
                <div style={{ marginTop: 10 }}>
                  <p style={{ color: "var(--success-ink)", fontWeight: 700, fontSize: "0.9rem" }}>
                    ✅ Link active
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "var(--muted)", wordBreak: "break-all" }}>
                    {typeof window !== "undefined" ? `${window.location.origin}/portal/${t.token}` : ""}
                  </p>
                  {t.expires_at && (
                    <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      Expires {new Date(t.expires_at).toLocaleDateString()}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button onClick={() => copyLink(t.token)} style={button}>Copy link</button>
                    <button onClick={() => regenerate(t)} disabled={working} style={button}>New link</button>
                    <button onClick={() => revoke(t.id)} style={dangerButton}>Revoke</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => generate(l.id, l.name)} disabled={working} style={button}>
                    {working ? "Generating…" : "Generate client link"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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

const dangerButton = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "10px 20px",
  fontWeight: 700,
  cursor: "pointer",
};
