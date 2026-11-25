"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Update the worker automatically, without navigating a live time clock
    // or destroying a recording. Fresh app code loads on normal navigation.
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
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);
  return null;
}

