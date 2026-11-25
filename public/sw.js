// WorkTeams v7: build embeds the public offline clock into this worker.
// No authenticated HTML, RSC payloads, API responses or account data are cached.
importScripts("/offline-clock-shell.js");
const CACHE = "workteams-v7-cold-clock-20261125";
// This response comes from the worker controlling THIS browser and origin.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "WORKTEAMS_OFFLINE_STARTUP_CHECK") return;
  event.ports?.[0]?.postMessage({
    version: "workteams-v7-cold-clock-20261125",
    shellAvailable: typeof self.WORKTEAMS_OFFLINE_HTML === "string" && self.WORKTEAMS_OFFLINE_HTML.includes("Offline Time Clock"),
    scope: self.registration.scope,
  });
});
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

// Private HTML and RSC payloads are never cached. The standalone clock reads
// only the current sign-in's prepared scope and writes to the existing outbox.
const OFFLINE_HTML = "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head><body><h2>You're offline</h2><p>Reconnect to open this page. The offline Time Clock is available from your WorkTeams app icon.</p><a href=\"/app\">Open offline Time Clock</a></body></html>";
function coldClockResponse(request) {
  const path = new URL(request.url).pathname;
  if (!(["/", "/app", "/app/"].includes(path) || new RegExp("^/app/[0-9a-f-]{36}(?:/time)?/?$","i").test(path))) return offlineResponse();
  return new Response(self.WORKTEAMS_OFFLINE_HTML, {headers:{"Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store",
    "Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'"}});
}
async function handlePageRequest(event, request, isNavigation) {
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),8000);
  try {
    const res=await fetch(request,{signal:controller.signal});
    if(res.status<500)return res;
  } catch { /* A public clock does not need a cached authenticated page. */ }
  finally { clearTimeout(timer); }
  return isNavigation ? coldClockResponse(request) : gatewayTimeoutResponse();
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
          if (isNavigation) return coldClockResponse(request);
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

