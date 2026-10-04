// Client-side web-push setup. Called once per signed-in session from AppShell.
// Returns one of: 'on' | 'off' | 'blocked' | 'unsupported'.
export async function ensurePush({ companyId, getSession, onStatus } = {}) {
  const report = (s) => onStatus && onStatus(s);
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    report("unsupported");
    return "unsupported";
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    let perm = Notification.permission;
    if (perm === "default") {
      // Don't auto-prompt on first load; the UI offers an enable button.
      report("off");
      return "off";
    }
    if (perm === "denied") {
      report("blocked");
      return "blocked";
    }
    const ok = await subscribe(reg, companyId, getSession);
    report(ok ? "on" : "off");
    return ok ? "on" : "off";
  } catch (e) {
    console.warn("push setup failed", e);
    report("off");
    return "off";
  }
}

// Ask the user for permission, then subscribe. Called from the enable button.
export async function enablePush({ companyId, getSession, onStatus } = {}) {
  const report = (s) => onStatus && onStatus(s);
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      report(perm === "denied" ? "blocked" : "off");
      return perm;
    }
    const reg = await navigator.serviceWorker.register("/sw.js");
    const ok = await subscribe(reg, companyId, getSession);
    report(ok ? "on" : "off");
    return ok ? "on" : "off";
  } catch (e) {
    console.warn("enable push failed", e);
    report("off");
    return "off";
  }
}

async function subscribe(reg, companyId, getSession) {
  const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!pubKey) {
    console.warn("VAPID public key not configured");
    return false;
  }
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pubKey),
    });
  }
  const { data: { session } } = await getSession();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
    body: JSON.stringify({
      companyId,
      subscription: { endpoint: sub.endpoint, keys: { p256dh: arrayBufToBase64(sub.getKey("p256dh")), auth: arrayBufToBase64(sub.getKey("auth")) } },
    }),
  });
  return res.ok;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}


export async function disablePush({ companyId, getSession, onStatus } = {}) {
  const report = (s) => onStatus && onStatus(s);
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const { data: { session } } = await getSession();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ companyId, endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    report("off");
    return true;
  } catch (e) {
    console.warn("disable push failed", e);
    report("off");
    return false;
  }
}
