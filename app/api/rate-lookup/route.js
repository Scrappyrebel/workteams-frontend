import { createClient } from "@supabase/supabase-js";

// POST /api/rate-lookup
// Body: { companyId, area }
// Searches the web (You.com Search API) for commercial cleaning rates in `area`
// and returns published snippets as reference. Owner/admin only.
// The API key stays server-side; the browser never sees it.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const companyId = body?.companyId;
  const area = (body?.area || "").trim();
  if (!companyId || !area) {
    return Response.json({ ok: false, error: "missing_params" }, { status: 400 });
  }

  // Authenticate: the client sends its Supabase access token as a Bearer token.
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Owner/admin only (bids contain pricing strategy).
  const { data: membership } = await sb
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const key = process.env.YOUCOM_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
  if (!key) {
    return Response.json({ ok: false, error: "not_configured" });
  }
  const useYouCom = !!process.env.YOUCOM_API_KEY;

  const queries = [
    `commercial cleaning rates per square foot ${area}`,
    `commercial cleaning service hourly rates ${area}`,
  ];

  try {
    const perQuery = await Promise.all(
      queries.map(async (q) => {
        if (useYouCom) {
          const res = await fetch("https://ydc-index.io/v1/search", {
            method: "POST",
            headers: {
              "X-API-Key": key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: q, count: 5 }),
          });
          if (!res.ok) throw new Error(`you.com search failed: ${res.status}`);
          const json = await res.json();
          return (json?.results?.web || []).map((r) => ({
            title: r.title || "",
            url: r.url || "",
            snippet: r.description || r.snippet || "",
            query: q,
          }));
        }
        const url =
          "https://api.search.brave.com/res/v1/web/search?q=" +
          encodeURIComponent(q) +
          "&count=5";
        const res = await fetch(url, {
          headers: {
            "X-Subscription-Token": key,
            Accept: "application/json",
          },
        });
        if (!res.ok) throw new Error(`brave search failed: ${res.status}`);
        const json = await res.json();
        return (json?.web?.results || []).map((r) => ({
          title: r.title || "",
          url: r.url || "",
          snippet: r.description || "",
          query: q,
        }));
      })
    );
    return Response.json({ ok: true, results: perQuery.flat().slice(0, 10) });
  } catch {
    return Response.json({ ok: false, error: "search_failed" });
  }
}
