// Service worker for WorkTeams: makes the app properly installable
// (real "Install app" prompt, standalone window, home-screen icon that
// behaves like an app). Static assets are cached; API/auth always hit
// the network and are never cached.
const CACHE = "workteams-v4-offline-clock-20261121";
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

// ---- Offline clock (Wendy, 2026-11-21): cached pages + context ----
// App pages under /app/ (documents and their RSC payloads) are cached
// network-first, exactly like the scripts below: online always wins,
// the cached copy is only ever the OFFLINE fallback. That is what lets
// the Time Clock open in a building with no signal — the page, its
// saved context (lib/offline-context.mjs) and the punch outbox
// (lib/punch-outbox.mjs) do the rest. A page never visited online has
// no cached copy; the fallback below says so plainly instead of
// leaving the browser's dead-page error.
const OFFLINE_HTML =
  "<!doctype html><html><head><meta charset=\"utf-8\">" +
  "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
  "<title>WorkTeams — offline</title></head>" +
  "<body style=\"font-family: system-ui, sans-serif; padding: 24px; text-align: center;\">" +
  "<h2>📴 You're offline</h2>" +
  "<p>WorkTeams needs a signal once to load this page. " +
  "Reconnect, open the page, and after that it will open offline too.</p>" +
  "</body></html>";

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isNavigation = request.mode === "navigate";
  const isRsc = url.searchParams.has("_rsc");
  if (!isNavigation && !isRsc) return;
  if (!(url.pathname === "/" || url.pathname === "/app" || url.pathname.startsWith("/app/"))) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(request);
        // Never cache a redirect (e.g. to the login page): offline we
        // must serve the real page or nothing, never a sign-in wall
        // wearing the page's address.
        if (res && res.ok && !res.redirected) {
          await cache.put(request, res.clone());
        }
        return res;
      } catch (err) {
        const cachedPage = await cache.match(request);
        if (cachedPage) return cachedPage;
        if (isNavigation) {
          return new Response(OFFLINE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        return Response.error();
      }
    })
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
