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
