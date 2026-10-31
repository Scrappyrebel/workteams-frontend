"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { friendlyAuthErrorMessage } from "../../lib/auth-errors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isCustomer, setIsCustomer] = useState(false);
  const [language, setLanguage] = useState("en");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsCustomer(params.get("source") === "customer");
    setLanguage(params.get("lang") === "es" ? "es" : "en");
  }, []);
  const t = (en, es) => isCustomer && language === "es" ? es : en;
  const backHref = isCustomer ? `/customer-login?lang=${language}` : "/login";

  async function sendReset(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase().auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: window.location.origin +
          (isCustomer ? `/reset-password?source=customer&lang=${language}` : "/reset-password") }
      );
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(friendlyAuthErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="site-shell" style={{ maxWidth: 520 }}>
      <Link href={backHref} className="back-link">← {t("Back to sign in", "Volver al inicio de sesión")}</Link>
      <section className="panel" style={{ padding: 30 }}>
        <p className="eyebrow">RESET PASSWORD</p>
        <h2>{t("Forgot your password?", "¿Olvidó su contraseña?")}</h2>
        {sent ? (
          <div>
            <p style={{ fontSize: "1.05rem" }}>
              ✅ {t("If the account exists, a reset link has been sent to", "Si existe la cuenta, se ha enviado un enlace a")} <strong>{email}</strong>.
            </p>
            <p style={{ color: "var(--muted)" }}>
              {t(
                "Open the link from your email on this device, then choose a new password. The link expires after a while.",
                "Abra el enlace de su correo en este dispositivo y elija una nueva contraseña. El enlace caduca."
              )}
            </p>
          </div>
        ) : (
          <form onSubmit={sendReset}>
            <label style={labelStyle} htmlFor="email">{t(isCustomer ? "Customer email" : "Work email", "Correo del cliente")}</label>
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
              {loading ? t("Sending…", "Enviando…") : t("Send reset link", "Enviar enlace de recuperación")}
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
