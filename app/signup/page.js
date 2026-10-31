"use client";

import Link from "next/link";
import CommercialConstructionNotice from "../../components/CommercialConstructionNotice";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { friendlyAuthErrorMessage } from "../../lib/auth-errors";
import { getSession } from "../../lib/session";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function signUpPassword(e) {
    e.preventDefault();
    setError("");
    setNotice("");
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
        setNotice(
          "Account created. Check your email to confirm it, then sign in."
        );
      }
    } catch (err) {
      setError(friendlyAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="site-shell" style={{ maxWidth: 520 }}>
      <CommercialConstructionNotice />
      <Link href="/" className="back-link">← Back to home</Link>
      <section className="panel" style={{ padding: 30 }}>
        <p className="eyebrow">SIGN UP</p>
        <h2>Create your account.</h2>

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
          {notice && <p style={successStyle}>{notice}</p>}
          {error && <p style={errorStyle}>{error}</p>}
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? "Creating…" : "Create account"}
          </button>
          <p style={{ marginTop: 12, fontSize: "0.85rem", color: "var(--muted)" }}>
            Start your 7-day free trial — by signing up you agree to our{" "}
            <Link href="/terms" style={linkStyle}>Terms</Link> and{" "}
            <Link href="/privacy" style={linkStyle}>Privacy Policy</Link>.
          </p>
          <p style={{ marginTop: 14, fontSize: "0.95rem" }}>
            Already have one?{" "}
            <Link href="/login" style={{ color: "var(--brand)", fontWeight: 700 }}>
              Sign in
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

// Success wears the app's success palette (globals.css --success-ink on
// --success-soft — the .status-pill recipe), never the error treatment.
const successStyle = {
  color: "var(--success-ink)",
  background: "var(--success-soft)",
  fontWeight: 700,
  borderRadius: 12,
  padding: "10px 14px",
};

const linkStyle = {
  color: "var(--brand)",
  fontWeight: 700,
  textDecoration: "underline",
};
