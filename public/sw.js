// Service worker for WorkTeams: makes the app properly installable
// (real "Install app" prompt, standalone window, home-screen icon that
// behaves like an app). Static assets are cached; API/auth always hit
// the network and are never cached.
const CACHE = "workteams-v3-fresh-js-20261011";
const STATIC_RE = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$/i;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Never cache Supabase API/auth or other cross-origin calls.
  if (url.origin !== self.location.origin) return;
  if (!STATIC_RE.test(url.pathname)) return;
  // NEVER run an old recorder / uploader after a production fix. Old
  // cache-first JavaScript made Android installed WorkTeams keep rejecting a
  // 9m30 walkthrough with a removed "Try a shorter walkthrough" error.
  // Network-first for scripts and styles; cached copies are OFFLINE only.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(request, { cache: "no-store" });
        if (res && res.ok) {
          await cache.put(request, res.clone());
          return res;
        }
        return (await cache.match(request)) || res;
      } catch (err) {
        return (await cache.match(request)) || Response.error();
      }
    })
  );
});

// ---- Web push: emergency alerts arrive even with the browser closed ----
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "WorkTeams", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "🚨 WorkTeams Emergency";
  const options = {
    body: data.body || "Someone needs help right now. Open WorkTeams.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [300, 100, 300, 100, 300],
    tag: data.tag || "workteams-emergency",
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
