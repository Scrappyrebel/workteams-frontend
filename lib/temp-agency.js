// Public temp-staffing agency resolution.
//
// A public booking or application must land on ONE explicit company.
// The public identifier is the company_id, carried as `?agency=<id>` on
// the booking/application links (company ids already appear in every
// signed-in app URL, so this exposes nothing new). Resolution rules:
//
//   1. An explicit id wins: the config row for THAT company, and only if
//      temp staffing is enabled for it. Unknown, disabled, or malformed
//      ids FAIL — there is no substitute agency.
//   2. No id (legacy links, incl. every link live before this module):
//      allowed only while exactly ONE company has staffing enabled, so
//      the destination is unambiguous. Zero enabled -> unavailable;
//      more than one -> fail closed and ask for the agency's own link.
//
// The failure mode this replaces was `.eq("enabled", true).limit(1)` —
// "first enabled row wins" — which routes bookings (and their Stripe
// payments) to the wrong company the moment a second agency enables.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCompanyId(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

// Resolve which company a public temp request belongs to.
// Returns { ok: true, companyId, pinned } or
// { ok: false, status, code, error } where `error` is customer-safe.
// codes: "invalid_link" | "agency_inactive" | "unavailable" |
//        "ambiguous" | "lookup_failed"
export async function resolveTempAgencyCompanyId(db, requested) {
  const wanted = typeof requested === "string" ? requested.trim() : "";

  if (wanted) {
    if (!isCompanyId(wanted)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_link",
        error:
          "That booking link isn't valid. Please use the link your agency gave you.",
      };
    }
    const { data: cfg, error } = await db
      .from("temp_agency_config")
      .select("company_id")
      .eq("company_id", wanted)
      .eq("enabled", true)
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        status: 500,
        code: "lookup_failed",
        error: "Something went wrong on our side. Please try again shortly.",
      };
    }
    if (!cfg) {
      return {
        ok: false,
        status: 404,
        code: "agency_inactive",
        error:
          "That agency isn't taking online bookings right now. Please contact the agency directly.",
      };
    }
    return { ok: true, companyId: cfg.company_id, pinned: true };
  }

  // No explicit agency: only an unambiguous answer is acceptable.
  const { data: rows, error } = await db
    .from("temp_agency_config")
    .select("company_id")
    .eq("enabled", true);
  if (error) {
    return {
      ok: false,
      status: 500,
      code: "lookup_failed",
      error: "Something went wrong on our side. Please try again shortly.",
    };
  }
  if (!rows || rows.length === 0) {
    return {
      ok: false,
      status: 503,
      code: "unavailable",
      error: "Temp staffing is not available right now.",
    };
  }
  if (rows.length > 1) {
    return {
      ok: false,
      status: 400,
      code: "ambiguous",
      error:
        "Please use the booking link your agency gave you — this shared page can't tell which agency you mean.",
    };
  }
  return { ok: true, companyId: rows[0].company_id, pinned: false };
}

// Fetch one agency's config row BY company (never by "enabled"). Keeps
// the pre-048 tolerance: if the staffing_types column doesn't exist yet,
// retry the same select without it.
export async function getTempAgencyConfig(db, companyId, columns) {
  let res = await db
    .from("temp_agency_config")
    .select(columns)
    .eq("company_id", companyId)
    .maybeSingle();
  if (
    res.error &&
    columns.includes("staffing_types") &&
    /staffing_types/.test(res.error.message || "")
  ) {
    const slim = columns
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c !== "staffing_types")
      .join(", ");
    res = await db
      .from("temp_agency_config")
      .select(slim)
      .eq("company_id", companyId)
      .maybeSingle();
  }
  return res.data || null;
}
