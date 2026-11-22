"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Seamless updates (Wendy, 2026-11-22): an update must push
    // itself and just work on the apps people already have — nobody
    // downloads a new thing, gets a new link, or takes steps. When a
    // new worker takes over a page that an old worker was running,
    // reload exactly once so the fresh copy is what runs. The
    // sessionStorage flag makes "exactly once" hold: without it, a
    // takeover loop could reload the page over and over.
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing || !hadController) return;
      try {
        if (sessionStorage.getItem("wt-sw-reloaded") === "1") return;
        sessionStorage.setItem("wt-sw-reloaded", "1");
      } catch (e) {
        // Storage unavailable: the in-memory flag still stops loops
        // for this page's lifetime.
      }
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let intervalId;
    navigator.serviceWorker
      // updateViaCache "none": the browser must never serve the
      // worker script itself from the HTTP cache, or an installed
      // app could sit on an old worker long after a fix shipped.
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // Check now, and keep checking while the page stays open, so
        // a fix reaches an open app on its own.
        registration.update().catch(() => {});
        intervalId = window.setInterval(
          () => registration.update().catch(() => {}),
          30 * 60 * 1000
        );
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);
  return null;
}
