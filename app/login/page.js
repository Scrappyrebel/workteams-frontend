"use client";

import Link from "next/link";
import CommercialConstructionNotice from "../../components/CommercialConstructionNotice";
import IosInstallHint from "../../components/IosInstallHint";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signInPassword(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      router.replace("/app");
    } catch (err) {
      setError(err.message || "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="site-shell" style={{ maxWidth: 520 }}>
      <CommercialConstructionNotice />
      <IosInstallHint />
      <Link href="/" className="back-link">← Back to home</Link>
      <section className="panel" style={{ padding: 30 }}>
        <p className="eyebrow">SIGN IN</p>
        <h2>Welcome back.</h2>

        <form onSubmit={signInPassword}>
          <label style={labelStyle} htmlFor="pw-email">Work email</label>
          <input
            id="pw-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourcompany.com"
            style={inputStyle}
          />
          <label style={labelStyle} htmlFor="pw-pass">Password</label>
          <input
            id="pw-pass"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            style={inputStyle}
          />
          {error && <p style={errorStyle}>{error}</p>}
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p style={{ marginTop: 14, fontSize: "0.95rem", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <Link href="/signup" style={{ color: "var(--brand)", fontWeight: 700 }}>
              New here? Sign up
            </Link>
            <Link href="/forgot-password" style={{ color: "var(--brand)", fontWeight: 700 }}>
              Forgot password?
            </Link>
          </p>
        </form>
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
