// Public, read-only version endpoint for the monitoring hub.
// Lets the Control Hub authoritatively identify exactly what code is serving
// production. Contains no secrets, no user data, no request data.
export const dynamic = "force-dynamic";

export async function GET() {
  const gitCommit = process.env.VERCEL_GIT_COMMIT_SHA || "unknown";
  return Response.json(
    {
      application: "WorkTeams",
      environment:
        process.env.VERCEL_ENV ||
        (process.env.NODE_ENV === "production" ? "production" : "development"),
      gitCommit,
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF || "unknown",
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || "unknown",
      commitKnown: gitCommit !== "unknown",
      time: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
