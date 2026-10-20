import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Retention purge — Privacy Policy §5: "After account cancellation or
// termination, we retain Customer Data for 90 days to allow reactivation
// or export, consistent with our Terms of Service, after which it may be
// permanently deleted."
//
// ============================ SAFETY DEFAULT ============================
// This route ships in REPORT-ONLY (dry-run) mode. It NEVER deletes a row
// or a file unless the RETENTION_PURGE_ENABLED environment variable is
// exactly "true". In report mode it only counts what WOULD be deleted and
// writes an audit row (public.retention_purge_log, migration 049) plus a
// console log line per eligible company.
//
// Anchor: companies.subscription_ended_at — stamped by a DB trigger
// (migration 049) at the moment subscription_status enters 'canceled'
// (the Stripe webhook sets that on customer.subscription.deleted), and
// cleared if the company reactivates, which resets the 90-day clock.
// A company is eligible when it is still 'canceled' and its stamp is at
// least RETENTION_DAYS old.
//
// If migration 049 has not been run yet, this route logs one clear line
// and returns 200 with { migrationMissing: true } — it fails CLOSED and
// never throws into other flows. Auth mirrors /api/cron/attendance:
// Bearer CRON_SECRET or 401.
// ========================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = () => createClient(SUPABASE_URL, SERVICE_KEY);

const RETENTION_DAYS = 90;
const MAX_COMPANIES_PER_RUN = 25; // daily cron drains any backlog gradually
const purgeEnabled = () => process.env.RETENTION_PURGE_ENABLED === "true";

// Company-owned tables: every one of these carries company_id and a
// foreign key to companies(id) ON DELETE CASCADE (verified across all
// migrations — see docs/retention-purge-design.md for the inventory).
// Rows are still counted and deleted explicitly, children first, so the
// audit log carries real numbers and the purge does not silently depend
// on cascade behavior. Grandchild tables WITHOUT company_id (bid_items,
// inspection_items, inspection_photos, walkthrough_areas,
// temp_assignments, training_approvals, training_evidence,
// training_exam_attempts, training_step_progress) cascade from the
// parents listed here. companies itself is deleted separately, last,
// with the eligibility conditions repeated in its WHERE clause.
// Global tables are NEVER touched: product_tiers, stripe_webhook_events
// (also the §5 legal-retention carve-out for transaction records),
// temp_staffing_types, and the training catalog tables
// (training_courses/lessons/steps/questions/practicals).
const COMPANY_TABLES = [
  // Content & activity
  "comm_book", "messages", "portal_messages", "emergency_alerts",
  "shift_videos", "time_entries", "shifts",
  // Operations
  "inspections", "work_order_comments", "work_orders", "supplies",
  "expense_entries", "revenue_entries",
  // Sales & contracts
  "contract_amendments", "contracts", "bids", "walkthroughs", "rate_areas",
  // Temp staffing
  "temp_shift_offers", "temp_hire_conversions", "temp_member_skills",
  "temp_applications", "temp_client_profiles", "temp_job_requests",
  "temp_agency_config",
  // Training (company-scoped rows; the catalog itself is global)
  "training_certifications", "training_enrollments",
  // Access & identity (company_members last before companies itself)
  "portal_tokens", "push_subscriptions", "member_pay", "location_private",
  "locations", "bootstrap_consumed", "company_members",
];

// Storage: uploads are keyed under a "<company_id>/..." path prefix
// (see lib/safe-shift-video-upload.js), so a company's files are exactly
// the objects under that prefix in each bucket.
const STORAGE_BUCKETS = ["shift-videos", "inspection-photos", "training-evidence"];
const MAX_STORAGE_OBJECTS = 5000; // per company per bucket; over = fail closed

// Recursively list every object path under a prefix. Returns an array of
// full paths, or null if the safety cap is exceeded (fail closed).
async function listStorageObjects(sb, bucket, prefix) {
  const paths = [];
  async function walk(dir, depth) {
    if (depth > 5) return false;
    let offset = 0;
    for (;;) {
      const { data, error } = await sb.storage.from(bucket).list(dir, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      const entries = data || [];
      for (const entry of entries) {
        const full = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.id === null) {
          // Folder — recurse.
          if (!(await walk(full, depth + 1))) return false;
        } else {
          paths.push(full);
          if (paths.length > MAX_STORAGE_OBJECTS) return false;
        }
      }
      if (entries.length < 100) return true;
      offset += entries.length;
    }
  }
  const ok = await walk(prefix, 0);
  return ok ? paths : null;
}

async function writeLog(sb, row) {
  // The audit log is best-effort: if migration 049 is missing the table
  // too, console logging still leaves the trail in the platform logs.
  const { error } = await sb.from("retention_purge_log").insert(row);
  if (error) {
    console.error("[retention-purge] audit log write failed:", error.message, JSON.stringify(row));
  }
}

async function countCompanyRows(sb, companyId) {
  const counts = {};
  for (const table of COMPANY_TABLES) {
    const { count, error } = await sb
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId);
    if (error) throw new Error(`count ${table}: ${error.message}`);
    counts[table] = count ?? 0;
  }
  return counts;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = admin();
  const mode = purgeEnabled() ? "purge" : "dry_run";
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();

  // Eligibility scan. If migration 049 has not been run, the
  // subscription_ended_at column does not exist: fail closed, say so
  // plainly, and touch nothing.
  const { data: companies, error: scanError } = await sb
    .from("companies")
    .select("id, name, subscription_status, subscription_ended_at, is_complimentary, stripe_subscription_id")
    .eq("subscription_status", "canceled")
    .not("subscription_ended_at", "is", null)
    .lte("subscription_ended_at", cutoff)
    .order("subscription_ended_at", { ascending: true })
    .limit(MAX_COMPANIES_PER_RUN);
  if (scanError) {
    console.error(
      "[retention-purge] eligibility scan failed — if this is a missing column, run migration 049 (supabase/049_retention_purge.sql). Nothing was touched. Error:",
      scanError.message
    );
    return NextResponse.json({ ok: true, mode, migrationMissing: true, eligible: 0, results: [] });
  }

  const results = [];
  for (const company of companies || []) {
    const eligibleAt = new Date(
      new Date(company.subscription_ended_at).getTime() + RETENTION_DAYS * 24 * 3600 * 1000
    ).toISOString();
    const baseLog = {
      company_id: company.id,
      company_name: company.name,
      mode,
      subscription_ended_at: company.subscription_ended_at,
      eligible_at: eligibleAt,
    };
    try {
      const tableCounts = await countCompanyRows(sb, company.id);

      const storageCounts = {};
      for (const bucket of STORAGE_BUCKETS) {
        const objects = await listStorageObjects(sb, bucket, company.id);
        if (objects === null) throw new Error(`storage listing for ${bucket} exceeded safety cap`);
        storageCounts[bucket] = objects.length;
        storageCounts[`${bucket}_paths`] = objects;
      }

      if (mode === "dry_run") {
        const storageSummary = Object.fromEntries(
          STORAGE_BUCKETS.map((b) => [b, storageCounts[b]])
        );
        console.log(
          `[retention-purge] DRY-RUN would delete company ${company.id} (${company.name}) — subscription ended ${company.subscription_ended_at}, eligible since ${eligibleAt}`
        );
        await writeLog(sb, {
          ...baseLog,
          table_counts: tableCounts,
          storage_counts: storageSummary,
          status: "reported",
          detail: "Report-only run (RETENTION_PURGE_ENABLED is not 'true'). Nothing deleted.",
        });
        results.push({ company_id: company.id, company_name: company.name, status: "reported", tables: tableCounts, storage: storageSummary });
        continue;
      }

      // ---- purge mode: re-verify eligibility IMMEDIATELY before deleting.
      // The company must look exactly as it did in the scan: still
      // canceled, same end stamp, no live subscription id, not a
      // complimentary (owner-granted) company.
      const { data: fresh, error: freshError } = await sb
        .from("companies")
        .select("id, subscription_status, subscription_ended_at, stripe_subscription_id, is_complimentary")
        .eq("id", company.id)
        .maybeSingle();
      if (freshError) throw new Error(`re-verify: ${freshError.message}`);
      const unchanged =
        fresh &&
        fresh.subscription_status === "canceled" &&
        fresh.subscription_ended_at === company.subscription_ended_at &&
        fresh.stripe_subscription_id === null &&
        !fresh.is_complimentary;
      if (!unchanged) {
        console.log(`[retention-purge] SKIPPED company ${company.id} (${company.name}) — state changed since scan (possible reactivation)`);
        await writeLog(sb, { ...baseLog, table_counts: tableCounts, status: "skipped", detail: "Company state changed between scan and delete (status/stamp/subscription/complimentary mismatch). Not deleted." });
        results.push({ company_id: company.id, company_name: company.name, status: "skipped" });
        continue;
      }

      // Files first: if storage removal fails, abort BEFORE any database
      // row is deleted, so media is never stranded without its records.
      const removedStorage = {};
      for (const bucket of STORAGE_BUCKETS) {
        const paths = storageCounts[`${bucket}_paths`];
        let removed = 0;
        for (let i = 0; i < paths.length; i += 100) {
          const chunk = paths.slice(i, i + 100);
          const { error: rmError } = await sb.storage.from(bucket).remove(chunk);
          if (rmError) throw new Error(`storage remove ${bucket}: ${rmError.message}`);
          removed += chunk.length;
        }
        removedStorage[bucket] = removed;
      }

      const deletedCounts = {};
      for (const table of COMPANY_TABLES) {
        const { count, error: delError } = await sb
          .from(table)
          .delete({ count: "exact" })
          .eq("company_id", company.id);
        if (delError) throw new Error(`delete ${table}: ${delError.message}`);
        deletedCounts[table] = count ?? 0;
      }

      // The company row goes last, with the eligibility conditions
      // repeated in the WHERE clause as a final guard.
      const { count: companyCount, error: companyError } = await sb
        .from("companies")
        .delete({ count: "exact" })
        .eq("id", company.id)
        .eq("subscription_status", "canceled")
        .eq("subscription_ended_at", company.subscription_ended_at);
      if (companyError) throw new Error(`delete companies: ${companyError.message}`);
      if (!companyCount) {
        throw new Error("companies row did not match final guard — child rows were deleted but the company row remains; investigate manually");
      }

      console.log(
        `[retention-purge] DELETED company ${company.id} (${company.name}) — subscription ended ${company.subscription_ended_at}`
      );
      await writeLog(sb, {
        ...baseLog,
        table_counts: deletedCounts,
        storage_counts: removedStorage,
        status: "deleted",
        detail: "Purged under Privacy Policy §5 (90 days post-cancellation).",
      });
      results.push({ company_id: company.id, company_name: company.name, status: "deleted", tables: deletedCounts, storage: removedStorage });
    } catch (e) {
      console.error(`[retention-purge] FAILED company ${company.id} (${company.name}):`, e.message);
      await writeLog(sb, { ...baseLog, status: "failed", detail: String(e.message).slice(0, 500) });
      results.push({ company_id: company.id, company_name: company.name, status: "failed", detail: String(e.message) });
      // In purge mode, stop the run on the first failure rather than
      // plowing ahead after something went wrong mid-delete.
      if (mode === "purge") break;
    }
  }

  return NextResponse.json({ ok: true, mode, eligible: (companies || []).length, results });
}
