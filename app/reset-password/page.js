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
      setError(err.message || "Could not update the password.");
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
            <input
              id="new-pass"
              type="password"
              required
              minLength={isCustomer ? 8 : 6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t(isCustomer ? "At least 8 characters" : "At least 6 characters", "Al menos 8 caracteres")}
              style={inputStyle}
            />
            <label style={labelStyle} htmlFor="confirm-pass">{t("Repeat it", "Repita la contraseña")}</label>
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
