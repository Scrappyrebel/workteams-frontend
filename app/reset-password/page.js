"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { friendlyAuthErrorMessage } from "../../lib/auth-errors";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);;
  const [confirm, setConfirm] = useState("");
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
  const retryHref = isCustomer ?
    `/forgot-password?source=customer&lang=${language}` : "/forgot-password";

  // Supabase emits PASSWORD_RECOVERY only for a valid password-recovery
  // redirect. A normal SIGNED_IN/INITIAL_SESSION is NOT a reset token:
  // logged-in customers or employees visiting this URL cannot change a
  // password through this form without following their email recovery link.
  useEffect(() => {
    let cancelled = false;
    let recoverySeen = false;
    const { data: { subscription } } = supabase().auth.onAuthStateChange(
      (event, session) => {
        if (cancelled || event !== "PASSWORD_RECOVERY" || !session?.user) return;
        recoverySeen = true;
        setValid(true);
        setReady(true);
      }
    );
    (async () => {
      // Give Supabase Auth time to consume the recovery redirect on mobile.
      // Never promote a generic authenticated session into recovery access.
      for (let i = 0; i < 10 && !recoverySeen; i++) {
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!cancelled && !recoverySeen) {
        setValid(false);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function savePassword(e) {
    e.preventDefault();
    setError("");
    if (password.length < (isCustomer ? 8 : 6)) {
      setError(t(
        isCustomer ? "Choose a password at least 8 characters long." :
          "Choose a password at least 6 characters long.",
        "Elija una contraseña de al menos 8 caracteres."
      ));
      return;
    }
    if (password !== confirm) {
      setError(t("The two passwords don't match.",
        "Las contraseñas no coinciden."));
      return;
    }
    setLoading(true);
    try {
      // A successful update requires the actual recovery session. Do not
      // silently keep the customer logged in with that temporary session.
      const { error } = await supabase().auth.updateUser({ password });
      if (error) throw error;
      if (isCustomer) {
        const { error: signOutError } = await supabase().auth.signOut({ scope: "local" });
        if (signOutError) {
          setError(t(
            "Password changed, but we could not close the recovery session. Sign out of your account before using another device.",
            "La contraseña cambió, pero no se pudo cerrar la sesión de recuperación. Cierre la sesión antes de usar otro dispositivo."
          ));
          return;
        }
      }
      router.replace(isCustomer ?
        `/customer-login?lang=${language}&reset=1` : "/login");
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
        <h2>{t("Choose a new password.", "Elija una nueva contraseña.")}</h2>
        {!ready ? (
          <p style={{ color: "var(--muted)" }}>{t("Checking your reset link…", "Verificando su enlace…")}</p>
        ) : !valid ? (
          <div>
            <p style={{ color: "#b3261e", fontWeight: 700 }}>
              {t("That reset link isn't valid anymore.", "Este enlace ya no es válido.")}
            </p>
            <p style={{ color: "var(--muted)" }}>
              {t(
                "Links expire after a while or after they've been used.",
                "Los enlaces caducan después de un tiempo o al utilizarlos."
              )}{" "}
              <Link href={retryHref} style={{ color: "var(--brand)", fontWeight: 700 }}>
                {t("Request a fresh one.", "Solicite otro enlace.")}
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={savePassword}>
            <label style={labelStyle} htmlFor="new-pass">{t("New password", "Nueva contraseña")}</label>
            <div style={{ position: "relative" }}>
            <input
              id="new-pass"
              type={showPassword ? "text" : "password"}
              required
              minLength={isCustomer ? 8 : 6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t(isCustomer ? "At least 8 characters" : "At least 6 characters", "Al menos 8 caracteres")}
              style={{ ...inputStyle, paddingRight: 44 }}
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? t("Hide password", "Ocultar contraseña") : t("Show password", "Mostrar contraseña")} title={showPassword ? t("Hide password", "Ocultar contraseña") : t("Show password", "Mostrar contraseña")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 6, cursor: "pointer", color: "#666", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5 7 10 7 10-7 10-7-3.5-7-10-7-10 7-10 7Z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
            </div>
            <label style={labelStyle} htmlFor="confirm-pass">{t("Repeat it", "Repita la contraseña")}</label>
            <div style={{ position: "relative" }}>
            <input
              id="confirm-pass"
              type={showConfirm ? "text" : "password"}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Same password again"
              style={{ ...inputStyle, paddingRight: 44 }}
            />
            <button type="button" onClick={() => setShowConfirm((v) => !v)} aria-label={showConfirm ? t("Hide password", "Ocultar contraseña") : t("Show password", "Mostrar contraseña")} title={showConfirm ? t("Hide password", "Ocultar contraseña") : t("Show password", "Mostrar contraseña")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 6, cursor: "pointer", color: "#666", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {showConfirm ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5 7 10 7 10-7 10-7-3.5-7-10-7-10 7-10 7Z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
            </div>
            {error && <p style={errorStyle}>{error}</p>}
            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? t("Saving…", "Guardando…") : t("Save new password", "Guardar contraseña")}
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
