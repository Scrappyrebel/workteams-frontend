"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendLink(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase().auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: window.location.origin + "/app" },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not send the sign-in link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="site-shell" style={{ maxWidth: 520 }}>
      <Link href="/" className="back-link">← Back to home</Link>
      <section className="panel" style={{ padding: 30 }}>
        <p className="eyebrow">SIGN IN</p>
        <h2>Check your email, then you're in.</h2>
        {sent ? (
          <div>
            <p style={{ fontSize: "1.05rem" }}>
              ✅ We sent a sign-in link to <strong>{email}</strong>.
            </p>
            <p style={{ color: "var(--muted)" }}>
              Tap the link in that email on this device and you'll land in your companies.
              The link expires after a while — you can request a new one anytime.
            </p>
          </div>
        ) : (
          <form onSubmit={sendLink}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }} htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
              style={inputStyle}
            />
            {error && <p style={{ color: "#b3261e", fontWeight: 700 }}>{error}</p>}
            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? "Sending…" : "Send sign-in link"}
            </button>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 12 }}>
              No password needed. Each sign-in email is good for one login.
            </p>
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
