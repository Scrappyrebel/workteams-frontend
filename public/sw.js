// Service worker for WorkTeams: makes the app properly installable
// (real "Install app" prompt, standalone window, home-screen icon that
// behaves like an app). Static assets are cached; API/auth always hit
// the network and are never cached.
//
// v5 (Wendy, 2026-11-22): an update must NEVER strand an existing
// install. The v4 worker opened the cache before fetching a page, so
// on a phone whose saved app data had gone bad (full or corrupt
// storage) the cache call itself failed, the page load died with it,
// and Chrome showed its dead "This page couldn't load" — reload-proof
// and network-independent, while fresh browser copies loaded fine.
// In v5 the network fetch happens FIRST and stands on its own: every
// cache operation is individually wrapped so a cache failure can
// never break, delay or replace a good network answer, cache writes
// are fire-and-forget off the response path, and the respondWith
// promise is built so it cannot reject — navigations fall back to
// the plain offline page below, never to the browser's dead error.
const CACHE = "workteams-v5-safe-20261122";
const STATIC_RE = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$/i;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge every older cache. Best-effort on purpose: a cache that
      // refuses to delete must never block the new worker from
      // taking over — a stuck activate is another way to strand an
      // install.
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k !== CACHE)
            .map((k) => caches.delete(k).catch(() => false))
        );
      } catch (err) {
        // Ignore: activation continues either way.
      }
      try {
        await self.clients.claim();
      } catch (err) {
        // Ignore: clients are claimed on the next navigation anyway.
      }
    })()
  );
});

// ---- Cache helpers: the cache is a bonus, never a gate ----
// Each helper swallows its own errors, so no caller ever has to
// defend against the cache. A phone with broken storage simply gets
// plain network behaviour, exactly like a browser with no worker.
async function cachePut(request, response) {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
  } catch (err) {
    // Best-effort only: a failed write just means no offline copy.
  }
}

async function cacheMatch(request) {
  try {
    const cache = await caches.open(CACHE);
    return (await cache.match(request)) || null;
  } catch (err) {
    return null;
  }
}

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function gatewayTimeoutResponse() {
  return new Response("", { status: 504, statusText: "Gateway Timeout" });
}

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

// Network-first page handling that cannot reject: the fetch stands
// alone, the cache is consulted only after the network has failed,
// and every exit returns a real Response.
async function handlePageRequest(event, request, isNavigation) {
  let res = null;
  try {
    res = await fetch(request);
  } catch (err) {
    res = null;
  }
  if (res) {
    // Never cache a redirect (e.g. to the login page): offline we
    // must serve the real page or nothing, never a sign-in wall
    // wearing the page's address.
    if (res.ok && !res.redirected) {
      // Fire-and-forget: the write is not awaited in the response
      // path, so a slow or broken cache can never hold up the page.
      event.waitUntil(cachePut(request, res.clone()));
    }
    return res;
  }
  // The network itself failed: the cached copy is the offline answer.
  const cachedPage = await cacheMatch(request);
  if (cachedPage) return cachedPage;
  if (isNavigation) return offlineResponse();
  return gatewayTimeoutResponse();
}

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
    (async () => {
      try {
        return await handlePageRequest(event, request, isNavigation);
      } catch (err) {
        // Last-resort guard: handlePageRequest is written never to
        // throw, but if anything unexpected slips through, try one
        // plain network fetch, then the plain offline answer — the
        // one thing this promise must never do is reject.
        try {
          return await fetch(request);
        } catch (err2) {
          if (isNavigation) return offlineResponse();
          return gatewayTimeoutResponse();
        }
      }
    })()
  );
});

// Network-first static handling, same never-reject shape: scripts and
// styles come from the network, the cache is the offline fallback
// only, and a cache failure falls back to the plain network result.
async function handleStaticRequest(event, request) {
  let res = null;
  try {
    res = await fetch(request, { cache: "no-store" });
  } catch (err) {
    res = null;
  }
  if (res && res.ok) {
    event.waitUntil(cachePut(request, res.clone()));
    return res;
  }
  const cachedAsset = await cacheMatch(request);
  if (cachedAsset) return cachedAsset;
  if (res) return res;
  return gatewayTimeoutResponse();
}

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
    (async () => {
      try {
        return await handleStaticRequest(event, request);
      } catch (err) {
        try {
          return await fetch(request, { cache: "no-store" });
        } catch (err2) {
          return gatewayTimeoutResponse();
        }
      }
    })()
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
