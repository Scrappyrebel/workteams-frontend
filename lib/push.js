import webpush from "web-push";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:lillybsjanitorial@gmail.com",
    pub,
    priv
  );
  configured = true;
  return true;
}

export function pushConfigured() {
  return ensureConfigured();
}

// Send a push notification to one subscription. Returns true on success.
// A 404/410 means the subscription is dead — caller should delete it.
export async function sendPush(subscription, payload) {
  if (!ensureConfigured()) return { ok: false, reason: "not-configured" };
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (e) {
    const dead = e?.statusCode === 404 || e?.statusCode === 410;
    return { ok: false, dead, reason: e?.message };
  }
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = Buffer.from(base64, "base64");
  return new Uint8Array(raw);
}
