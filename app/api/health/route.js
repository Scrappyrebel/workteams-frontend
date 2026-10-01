import { supabase } from "../../../lib/supabase";

// Public health endpoint for the monitoring hub. Reports whether the app and
// the database are reachable. Deliberately minimal — no sensitive data.
export async function GET() {
  const started = Date.now();
  let db = "ok";
  let dbLatencyMs = null;
  try {
    const t0 = Date.now();
    const { error } = await supabase().from("product_tiers").select("tier").limit(1);
    dbLatencyMs = Date.now() - t0;
    if (error) db = "error";
  } catch {
    db = "error";
  }
  const status = db === "ok" ? "ok" : "degraded";
  return Response.json(
    {
      app: "WorkTeams",
      status,
      db,
      dbLatencyMs,
      responseMs: Date.now() - started,
      time: new Date().toISOString(),
    },
    { status: status === "ok" ? 200 : 503 }
  );
}
