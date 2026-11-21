"use client";

// In-app card update (Wendy, 2026-11-06): the owner types the new
// card into a Stripe Elements field embedded in the Plans page. The
// card number goes straight from this Stripe-hosted field to Stripe
// — it never touches our server and the owner never leaves the app.
// Saving runs: POST /api/stripe/setup-intent (server makes a
// SetupIntent) -> stripe.confirmCardSetup in the browser ->
// POST /api/stripe/set-payment-method (server makes it the default).
import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { supabase } from "../lib/supabase";

export default function BillingCardForm({ companyId, onSaved, onCancel }) {
  const mountRef = useRef(null);
  const stripeRef = useRef(null);
  const cardRef = useRef(null);
  const secretRef = useRef(null);
  const [phase, setPhase] = useState("loading"); // loading | ready | saving | unavailable
  const [message, setMessage] = useState("");

  async function api(path, body) {
    const { data: { session } } = await supabase().auth.getSession();
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) {
        // Honest state, never a broken form: the account's publishable
        // key has not been added to the app yet.
        setPhase("unavailable");
        return;
      }
      try {
        const { clientSecret } = await api("/api/stripe/setup-intent", { companyId });
        const stripe = await loadStripe(publishableKey);
        if (cancelled || !stripe || !mountRef.current) return;
        const elements = stripe.elements();
        const card = elements.create("card", {
          style: {
            base: { fontSize: "16px", color: "#1c2430" },
            invalid: { color: "#b3261e" },
          },
        });
        card.mount(mountRef.current);
        card.on("change", (e) => setMessage(e.error ? e.error.message : ""));
        stripeRef.current = stripe;
        cardRef.current = card;
        secretRef.current = clientSecret;
        setPhase("ready");
      } catch (e) {
        if (!cancelled) {
          setMessage("Could not load the card form: " + e.message);
          setPhase("unavailable");
        }
      }
    })();
    return () => {
      cancelled = true;
      try { cardRef.current?.destroy(); } catch { /* already gone */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function save() {
    if (phase !== "ready" || !stripeRef.current || !cardRef.current) return;
    setPhase("saving");
    setMessage("");
    try {
      const { setupIntent, error } = await stripeRef.current.confirmCardSetup(
        secretRef.current,
        { payment_method: { card: cardRef.current } }
      );
      if (error) throw new Error(error.message || "That card was not accepted.");
      const { card } = await api("/api/stripe/set-payment-method", {
        companyId,
        paymentMethodId: setupIntent.payment_method,
      });
      onSaved?.(card);
    } catch (e) {
      setMessage(e.message);
      setPhase("ready");
    }
  }

  if (phase === "unavailable" && !message) {
    return (
      <p role="status" style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
        Card updates are not switched on for this account yet.
      </p>
    );
  }

  return (
    <div style={{ maxWidth: 440, margin: "10px auto 0", textAlign: "left" }}>
      <div
        ref={mountRef}
        style={{
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: "12px 14px",
          background: "#fff",
          minHeight: 24,
        }}
      />
      {message && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem", marginTop: 8 }}>{message}</p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={save}
          disabled={phase !== "ready"}
          style={{
            flex: 1, padding: "12px", borderRadius: 999, border: "none",
            background: "var(--brand)", color: "#fff", fontWeight: 800, cursor: "pointer",
          }}
        >
          {phase === "saving" ? "Saving…" : phase === "loading" ? "Loading…" : "Save card"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={phase === "saving"}
          style={{
            padding: "12px 20px", borderRadius: 999, border: "1px solid var(--muted)",
            background: "transparent", color: "var(--muted)", fontWeight: 700, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: 8 }}>
        Card details go straight to Stripe — they never pass through this app.
      </p>
    </div>
  );
}
