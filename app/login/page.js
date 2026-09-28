"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { getSession } from "../../lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("password"); // "link" | "password"
  const [pwMode, setPwMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <Link href="/" className="back-link">← Back to home</Link>
      <section className="panel" style={{ padding: 30 }}>
        <p className="eyebrow">SIGN IN</p>
        <h2>Welcome back.</h2>

        <div style={{ display: "flex", gap: 8, margin: "16px 0 20px" }}>
          <button
            type="button"
            onClick={() => { setMode("link"); setError(""); }}
            style={tabStyle(mode === "link")}
          >
            Email link
          </button>
          <button
            type="button"
            onClick={() => { setMode("password"); setError(""); }}
            style={tabStyle(mode === "password")}
          >
            Password
          </button>
        </div>

        {mode === "link" ? (
          sent ? (
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
                {loading ? "Sending…" : "Send sign-in link"}
              </button>
              <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 12 }}>
                No password needed. Each sign-in email is good for one login.
              </p>
            </form>
          )
        ) : pwMode === "signin" ? (
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

function tabStyle(active) {
  return {
    flex: 1,
    padding: "10px",
    borderRadius: 999,
    border: active ? "none" : "1px solid var(--line)",
    background: active ? "var(--brand)" : "transparent",
    color: active ? "#fff" : "inherit",
    fontWeight: 700,
    cursor: "pointer",
  };
}
