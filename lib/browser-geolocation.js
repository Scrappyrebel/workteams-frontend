export function getBestBrowserPosition({
  idealAccuracyMeters = 50,
  acceptableAccuracyMeters = 100,
  acceptableWaitMs = 2500,
  maxWaitMs = 10000,
} = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location services are not available on this device."));
      return;
    }

    let best = null;
    let settled = false;
    const started = Date.now();

    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (value) resolve(value);
      else reject(error || new Error("Could not get a usable GPS reading."));
    };

    const normalize = (pos) => ({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
      capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
    });

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next = normalize(pos);
        if (!best || (next.accuracy ?? Infinity) < (best.accuracy ?? Infinity)) best = next;

        if (next.accuracy != null && next.accuracy <= idealAccuracyMeters) {
          finish(next);
          return;
        }

        if (
          Date.now() - started >= acceptableWaitMs &&
          best?.accuracy != null &&
          best.accuracy <= acceptableAccuracyMeters
        ) {
          finish(best);
        }
      },
      (error) => {
        if (best?.accuracy != null && best.accuracy <= acceptableAccuracyMeters) finish(best);
        else finish(null, new Error(error?.message || "Could not get your location."));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs },
    );

    const timer = setTimeout(() => {
      if (best?.accuracy != null && best.accuracy <= acceptableAccuracyMeters) finish(best);
      else if (best) finish(null, new Error(`GPS accuracy is ${best.accuracy == null ? "unavailable" : Math.round(best.accuracy) + "m"}. Move near a window or outside and try again.`));
      else finish(null, new Error("Could not get a GPS reading. Check location permission and try again."));
    }, maxWaitMs + 250);
  });
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}
