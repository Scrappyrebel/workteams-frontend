// Public, read-only configuration STATUS endpoint for the monitoring hub.
// Reports only whether critical configuration is present — NEVER the values.
// Statuses: CONFIGURED | MISSING. No secrets, no user data, no request data.
export const dynamic = "force-dynamic";

const CHECKS = [
  ["supabaseUrl", "NEXT_PUBLIC_SUPABASE_URL"],
  ["supabaseAnonKey", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  ["supabaseServiceRoleKey", "SUPABASE_SERVICE_ROLE_KEY"],
  ["stripeSecretKey", "STRIPE_SECRET_KEY"],
  ["stripeWebhookSecret", "STRIPE_WEBHOOK_SECRET"],
  ["productOwnerEmail", "PRODUCT_OWNER_EMAIL"],
  ["appUrl", "WORKTEAMS_APP_URL"],
];

export async function GET() {
  const config = {};
  for (const [label, envName] of CHECKS) {
    config[label] = process.env[envName] ? "CONFIGURED" : "MISSING";
  }
  return Response.json(
    {
      app: "WorkTeams",
      config,
      time: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
