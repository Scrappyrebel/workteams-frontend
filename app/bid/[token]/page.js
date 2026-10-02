"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function BidReviewPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/bids/public?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch(() => setError("Could not load the proposal."));
  }, [token]);

  async function decide(decision) {
    if (decision === "accepted" && !name.trim()) {
      alert("Please type your name to accept.");
      return;
    }
    if (!window.confirm(decision === "accepted" ? "Accept this proposal?" : "Decline this proposal?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bids/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, decision, name: name.trim(), email: email.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Request failed");
      setResult(j);
    } catch (err) {
      alert(err.message);
    }
    setBusy(false);
  }

  return (
    <main className="site-shell" style={{ maxWidth: 720, paddingTop: 32, paddingBottom: 64 }}>
      <p className="eyebrow">PROPOSAL</p>
      {error && <p style={{ color: "#b3261e", fontWeight: 700 }}>{error}</p>}
      {!error && !data && <p>Loading proposal…</p>}
      {data && !result && (
        <>
          <h2 style={{ fontSize: "1.6rem" }}>{data.bid.title}</h2>
          <p style={{ color: "var(--muted)" }}>
            From {data.bid.companies?.name} • Prepared for {data.bid.client_name}
            {data.bid.valid_until ? ` • Valid until ${data.bid.valid_until}` : ""}
          </p>
          {data.bid.description && <p>{data.bid.description}</p>}
          <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
            {data.items.map((i, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <span>{i.description}{Number(i.quantity) > 1 ? ` (x${i.quantity})` : ""}</span>
                <strong>${(Number(i.quantity) * Number(i.unit_price)).toFixed(2)}</strong>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 0", fontSize: "1.15rem" }}>
              <strong>Total</strong>
              <strong>${data.total.toFixed(2)}</strong>
            </div>
          </section>
          {data.bid.status !== "sent" ? (
            <p style={{ color: "var(--muted)" }}>This proposal is {data.bid.status} — no action needed.</p>
          ) : (
            <section className="panel" style={{ padding: 22 }}>
              <h3 style={{ marginTop: 0 }}>Your decision</h3>
              <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
                <input placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} style={input} />
                <input placeholder="Email (for your contract copy)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => decide("accepted")} disabled={busy} style={acceptBtn}>{busy ? "…" : "Accept proposal"}</button>
                  <button onClick={() => decide("declined")} disabled={busy} style={declineBtn}>{busy ? "…" : "Decline"}</button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
      {result && result.decision === "accepted" && (
        <section className="panel" style={{ padding: 24, borderColor: "#9fd8b4" }}>
          <p style={{ color: "#1e8e4d", fontWeight: 800, fontSize: "1.1rem" }}>✅ Proposal accepted — thank you!</p>
          {result.signToken ? (
            <p>Your service agreement is ready. Please review and sign it to finalize:<br />
              <a href={`/contract/${result.signToken}`} style={{ color: "var(--brand-deep)", fontWeight: 800, fontSize: "1.05rem" }}>
                Review and sign your contract →
              </a>
            </p>
          ) : (
            <p style={{ color: "var(--muted)" }}>We'll send your service agreement shortly.</p>
          )}
        </section>
      )}
      {result && result.decision === "declined" && (
        <p style={{ fontWeight: 700 }}>Thanks for letting us know. We'll be here if you need us.</p>
      )}
    </main>
  );
}

const input = { padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line)", fontSize: "1rem" };
const acceptBtn = { flex: 1, padding: "14px", borderRadius: 999, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 800, cursor: "pointer" };
const declineBtn = { padding: "14px 22px", borderRadius: 999, border: "1px solid var(--line)", background: "#fff", fontWeight: 700, cursor: "pointer" };
