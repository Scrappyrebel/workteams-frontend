// Trusted app origin for absolute redirects (Stripe checkout, billing
// portal). Comes from WORKTEAMS_APP_URL and is validated server-side:
// missing, unparsable, or non-https values fail closed so the app never
// redirects through an attacker-controlled or wrong domain.
export function getAppUrl() {
  const raw = process.env.WORKTEAMS_APP_URL;
  if (!raw) throw new Error("WORKTEAMS_APP_URL is not configured");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("WORKTEAMS_APP_URL is not a valid URL");
  }
  if (url.protocol !== "https:") throw new Error("WORKTEAMS_APP_URL must use https");
  return url.origin;
}

// Best-effort base URL for absolute links in emails and push deep links.
// Prefers the incoming request's origin — always correct for the deployment
// actually serving the request (production, preview, or a future product
// domain) — then WORKTEAMS_APP_URL, then the production domain as a last
// resort so links never break. Unlike getAppUrl(), this never throws.
export function appUrlFrom(req) {
  try {
    const origin = new URL(req?.url || "").origin;
    if (origin && /^https?:\/\//.test(origin)) return origin;
  } catch {
    /* fall through to env/default */
  }
  return APP_URL;
}

// Static fallback for contexts without a request (module scope, libs).
export const APP_URL =
  process.env.WORKTEAMS_APP_URL || "https://app.lillybsjanitorial.com";

// Product support contact. The Gmail is the fallback until a product domain
// exists; set WORKTEAMS_SUPPORT_EMAIL (or NEXT_PUBLIC_WORKTEAMS_SUPPORT_EMAIL
// for client components) to swap it in one place.
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_WORKTEAMS_SUPPORT_EMAIL ||
  process.env.WORKTEAMS_SUPPORT_EMAIL ||
  "lillybsjanitorial@gmail.com";
