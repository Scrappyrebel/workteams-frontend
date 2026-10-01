/** @type {import('next').NextConfig} */

// Content Security Policy. Notes:
// - 'unsafe-inline' for scripts is required by Next.js itself.
// - style-src allows 'unsafe-inline' because the app uses inline styles.
// - connect-src allows Supabase, Stripe, and the geocoding lookup used by
//   the Locations page. img-src allows Supabase storage (signed photo URLs)
//   and data: thumbnails.
// - No 'unsafe-eval': the app does not need runtime code compilation.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://js.stripe.com https://nominatim.openstreetmap.org",
  "font-src 'self' data:",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
