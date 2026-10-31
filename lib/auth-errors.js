// Maps a Supabase Auth error to one of this app's own friendly messages.
// The raw backend string is never shown to the user; it stays in the
// console for support. Matching prefers the error code and falls back to
// message substrings. Pass a page's t(en, es) pair function when the page
// is bilingual (customer flows); employee-only pages omit it and get the
// English string, matching those pages' English-only design.
export function friendlyAuthErrorMessage(error, t) {
  const pair = typeof t === "function" ? t : (en) => en;
  const code = String(error?.code ?? "").toLowerCase();
  const message = String(error?.message ?? (typeof error === "string" ? error : ""));
  const haystack = `${code} ${message}`.toLowerCase();
  if (typeof console !== "undefined") {
    console.error("Auth error (shown to user as a friendly message):", code || "(no code)", message);
  }
  if (haystack.includes("invalid_credentials") || haystack.includes("invalid login credentials"))
    return pair("That email or password didn't match. Double-check both and try again.", "Ese correo o contraseña no coincidieron. Verifique ambos e inténtelo de nuevo.");
  if (haystack.includes("email_not_confirmed") || haystack.includes("email not confirmed"))
    return pair("This email hasn't been confirmed yet. Open the confirmation link from the email sent when the account was created, or request a password reset link.", "Este correo aún no ha sido confirmado. Abra el enlace de confirmación del correo enviado cuando se creó la cuenta, o solicite un enlace para restablecer la contraseña.");
  if (haystack.includes("user_already_exists") || haystack.includes("user already registered") || haystack.includes("already been registered") || haystack.includes("already exists"))
    return pair("An account with this email already exists. Sign in instead.", "Ya existe una cuenta con este correo. Inicie sesión.");
  if (haystack.includes("same_password") || haystack.includes("should be different"))
    return pair("Your new password must be different from your current password.", "Su nueva contraseña debe ser diferente de la contraseña actual.");
  if (haystack.includes("weak_password") || haystack.includes("password should be at least") || haystack.includes("password is too weak") || haystack.includes("password should contain"))
    return pair("Use a longer password — at least 6 characters.", "Use una contraseña más larga, de al menos 6 caracteres.");
  if (haystack.includes("email_address_invalid") || haystack.includes("unable to validate email address") || haystack.includes("invalid email"))
    return pair("That email address doesn't look valid. Double-check it and try again.", "Ese correo electrónico no parece válido. Verifíquelo e inténtelo de nuevo.");
  if (haystack.includes("over_request_rate_limit") || haystack.includes("over_email_send_rate_limit") || haystack.includes("rate limit") || haystack.includes("too many requests") || haystack.includes("you can only request this after"))
    return pair("Too many attempts in a short time. Wait a minute, then try again.", "Demasiados intentos en poco tiempo. Espere un minuto e inténtelo de nuevo.");
  if (haystack.includes("failed to fetch") || haystack.includes("networkerror") || haystack.includes("network error") || haystack.includes("load failed") || haystack.includes("fetch failed"))
    return pair("We couldn't reach the sign-in service. Check your connection and try again.", "No pudimos contactar el servicio de inicio de sesión. Revise su conexión e inténtelo de nuevo.");
  return pair("Something went wrong and that didn't go through. Please try again.", "Algo salió mal y eso no se completó. Inténtelo de nuevo.");
}
