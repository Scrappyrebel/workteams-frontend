"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function ContractSignPage() {
  const { token } = useParams();
  const [contract, setContract] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/contracts/public?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setContract(j.contract);
      })
      .catch(() => setError("Could not load the contract."));
  }, [token]);

  async function sign(e) {
    e.preventDefault();
    if (!name.trim()) {
      alert("Please type your full name to sign.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/contracts/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Signing failed");
      setDone(true);
    } catch (err) {
      alert(err.message);
    }
    setBusy(false);
  }

  return (
    <main className="site-shell" style={{ maxWidth: 720, paddingTop: 32, paddingBottom: 64 }}>
      <p className="eyebrow">SERVICE CONTRACT</p>
      {error && <p style={{ color: "#b3261e", fontWeight: 700 }}>{error}</p>}
      {!error && !contract && <p>Loading contract…</p>}
      {contract && (
        <>
          <h2 style={{ fontSize: "1.6rem" }}>
            {contract.companies?.name} — Cleaning Service Agreement
          </h2>
          <p style={{ color: "var(--muted)" }}>
            Prepared for {contract.client_name}
            {contract.start_date ? ` • Effective ${contract.start_date}` : ""}
          </p>
          <section className="panel" style={{ padding: 24, margin: "18px 0" }}>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem", margin: 0 }}>{contract.terms_text}</pre>
          </section>
          {contract.status === "signed" || done ? (
            <section className="panel" style={{ padding: 24, borderColor: "#9fd8b4" }}>
              <p style={{ color: "#1e8e4d", fontWeight: 800, fontSize: "1.1rem", margin: 0 }}>
                ✅ Signed{contract.signed_name ? ` by ${contract.signed_name}` : ""}
                {contract.signed_at ? ` on ${new Date(contract.signed_at).toLocaleDateString()}` : ""}.
              </p>
              <p style={{ color: "var(--muted)" }}>A copy has been saved. Thank you!</p>
            </section>
          ) : (
            <section className="panel" style={{ padding: 24 }}>
              <h3 style={{ marginTop: 0 }}>Sign this agreement</h3>
              <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                Type your full legal name below. Your name, the date and time, and a record of this
                signature are saved as your electronic signature.
              </p>
              <form onSubmit={sign} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
                <input
                  placeholder="Full legal name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line)", fontSize: "1.05rem" }}
                />
                <button
                  type="submit"
                  disabled={busy}
                  style={{ padding: "14px", borderRadius: 999, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 800, fontSize: "1.05rem", cursor: "pointer" }}
                >
                  {busy ? "Signing…" : "Sign agreement"}
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </main>
  );
}
