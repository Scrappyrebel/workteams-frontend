"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // The reset link carries a recovery session; the client picks it up
  // from the URL automatically. Only then can the password be changed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Give the client a moment to detect the session in the URL.
      for (let i = 0; i < 10; i++) {
        const { data: { session } } = await supabase().auth.getSession();
        if (session) {
          if (!cancelled) { setValid(true); setReady(true); }
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  async function savePassword(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Choose a password at least 6 characters long.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase().auth.updateUser({ password });
      if (error) throw error;
      router.replace("/login");
    } catch (err) {
      setError(err.message || "Could not update the password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="site-shell" style={{ maxWidth: 520 }}>
      <Link href="/login" className="back-link">← Back to sign in</Link>
      <section className="panel" style={{ padding: 30 }}>
        <p className="eyebrow">RESET PASSWORD</p>
        <h2>Choose a new password.</h2>
        {!ready ? (
          <p style={{ color: "var(--muted)" }}>Checking your reset link…</p>
        ) : !valid ? (
          <div>
            <p style={{ color: "#b3261e", fontWeight: 700 }}>
              That reset link isn't valid anymore.
            </p>
            <p style={{ color: "var(--muted)" }}>
              Links expire after a while or after they've been used.{" "}
              <Link href="/forgot-password" style={{ color: "var(--brand)", fontWeight: 700 }}>
                Request a fresh one.
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={savePassword}>
            <label style={labelStyle} htmlFor="new-pass">New password</label>
            <input
              id="new-pass"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              style={inputStyle}
            />
            <label style={labelStyle} htmlFor="confirm-pass">Repeat it</label>
            <input
              id="confirm-pass"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Same password again"
              style={inputStyle}
            />
            {error && <p style={errorStyle}>{error}</p>}
            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? "Saving…" : "Save new password"}
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
