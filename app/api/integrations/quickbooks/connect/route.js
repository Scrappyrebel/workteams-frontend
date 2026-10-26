import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "../../../../../lib/rate-limit";
import { requireManager } from "../../../../../lib/integrations/server-auth";
import {
  intuitConfig,
  buildAuthorizeUrl,
  newStateNonce,
  isMissingIntegrationSchema,
} from "../../../../../lib/integrations/quickbooks-server";

// POST { companyId } -> { url }  (owner/admin only)
// Starts the QuickBooks OAuth flow: creates a one-time state nonce and
// returns Intuit's authorize URL; the browser then navigates there and
// Intuit sends the user back to the callback route. The redirect URI
// comes from INTUIT_REDIRECT_URI and must match the URI saved in the
// Intuit developer dashboard byte for byte.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`qbo-connect:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    const { companyId } = await req.json().catch(() => ({}));
    const auth = await requireManager(req, companyId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const cfg = intuitConfig();
    if (!cfg.configured) {
      return NextResponse.json(
        {
          error:
            "QuickBooks isn't switched on yet -- the developer keys haven't been added. Nothing is connected.",
          code: "setup_pending",
        },
        { status: 503 }
      );
    }

    const nonce = newStateNonce();
    const { error } = await auth.db.from("integration_oauth_states").insert({
      nonce,
      company_id: companyId,
      user_id: auth.user.id,
      provider: "quickbooks",
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (error) {
      if (isMissingIntegrationSchema(error)) {
        return NextResponse.json(
          {
            error: "QuickBooks setup is pending -- the database step hasn't been run yet. Nothing is connected.",
            code: "setup_pending",
          },
          { status: 503 }
        );
      }
      throw error;
    }
    return NextResponse.json({ url: buildAuthorizeUrl(nonce) });
  } catch (e) {
    console.error("qbo connect error", e.message);
    return NextResponse.json({ error: "Could not start the QuickBooks connection" }, { status: 500 });
  }
}
