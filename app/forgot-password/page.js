"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendReset(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase().auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: window.location.origin + "/reset-password" }
      );
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not send the reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="site-shell" style={{ maxWidth: 520 }}>
      <Link href="/login" className="back-link">← Back to sign in</Link>
      <section className="panel" style={{ padding: 30 }}>
        <p className="eyebrow">RESET PASSWORD</p>
        <h2>Forgot your password?</h2>
        {sent ? (
          <div>
            <p style={{ fontSize: "1.05rem" }}>
              ✅ We sent a reset link to <strong>{email}</strong>.
            </p>
            <p style={{ color: "var(--muted)" }}>
              Tap the link in that email on this device, then choose a new password.
              The link expires after a while — you can request a new one anytime.
            </p>
          </div>
        ) : (
          <form onSubmit={sendReset}>
            <label style={labelStyle} htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
              style={inputStyle}
            />
            {error && <p style={errorStyle}>{error}</p>}
            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  marginBottom: 14,
};

const labelStyle = { display: "block", fontWeight: 700, marginBottom: 8 };

const buttonStyle = {
  width: "100%",
  padding: "13px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  fontSize: "1rem",
  cursor: "pointer",
};

const errorStyle = { color: "#b3261e", fontWeight: 700 };
