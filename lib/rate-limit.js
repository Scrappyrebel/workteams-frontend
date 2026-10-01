// Tiny in-memory sliding-window rate limiter for API routes.
// NOTE: this is per server instance. On serverless (Vercel) each instance
// keeps its own counters, so it blunts casual abuse / accidental loops
// rather than being a hard global cap. For strict global limits a shared
// store (e.g. Upstash Redis) would be needed.

const buckets = new Map(); // key -> array of timestamps (ms)

function prune(list, now, windowMs) {
  const cutoff = now - windowMs;
  let i = 0;
  while (i < list.length && list[i] < cutoff) i++;
  if (i > 0) list.splice(0, i);
  return list;
}

// Returns { ok: true } or { ok: false, retryAfterMs }.
export function checkRateLimit(key, { limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  let list = buckets.get(key);
  if (!list) {
    list = [];
    buckets.set(key, list);
  }
  prune(list, now, windowMs);
  if (list.length >= limit) {
    return { ok: false, retryAfterMs: list[0] + windowMs - now };
  }
  list.push(now);
  // Keep memory bounded.
  if (buckets.size > 10000) {
    const oldest = buckets.keys().next().value;
    buckets.delete(oldest);
  }
  return { ok: true };
}

export function clientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
