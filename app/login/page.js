"use client";

import Link from "next/link";
import CommercialConstructionNotice from "../../components/CommercialConstructionNotice";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { getSession } from "../../lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [pwMode, setPwMode] = useState("signin"); // "signin" | "signup"
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

  async function signUpPassword(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase().auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      const session = await getSession();
      if (session) {
        router.replace("/app");
      } else {
        setError(
          "Account created. Check your email to confirm it, then sign in."
        );
      }
    } catch (err) {
      setError(err.message || "Could not create the account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="site-shell" style={{ maxWidth: 520 }}>
      <CommercialConstructionNotice />
      <Link href="/" className="back-link">← Back to home</Link>
      <section className="panel" style={{ padding: 30 }}>
        <p className="eyebrow">SIGN IN</p>
        <h2>Welcome back.</h2>

        {pwMode === "signin" ? (
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
            <p style={{ marginTop: 14, fontSize: "0.95rem" }}>
              <Link href="/forgot-password" style={{ color: "var(--brand)", fontWeight: 700 }}>
                Forgot password?
              </Link>
            </p>
            <p style={{ marginTop: 14, fontSize: "0.95rem" }}>
              New here?{" "}
              <button
                type="button"
                onClick={() => { setPwMode("signup"); setError(""); }}
                style={linkButtonStyle}
              >
                Create an account
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={signUpPassword}>
            <label style={labelStyle} htmlFor="su-email">Work email</label>
            <input
              id="su-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
              style={inputStyle}
            />
            <label style={labelStyle} htmlFor="su-pass">Choose a password</label>
            <input
              id="su-pass"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              style={inputStyle}
            />
            {error && <p style={errorStyle}>{error}</p>}
            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? "Creating…" : "Create account"}
            </button>
            <p style={{ marginTop: 12, fontSize: "0.85rem", color: "var(--muted)" }}>
              Start your 7-day free trial — by signing up you agree to our{" "}
              <Link href="/terms" style={linkButtonStyle}>Terms</Link> and{" "}
              <Link href="/privacy" style={linkButtonStyle}>Privacy Policy</Link>.
            </p>
            <p style={{ marginTop: 14, fontSize: "0.95rem" }}>
              Already have one?{" "}
              <button
                type="button"
                onClick={() => { setPwMode("signin"); setError(""); }}
                style={linkButtonStyle}
              >
                Sign in
              </button>
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

const linkButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--brand)",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.95rem",
  textDecoration: "underline",
};
