import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Training certification expiry alerts (migration 075, audit item A7)
// invariants:
// * Certifications have carried expires_at since migration 021 and the
//   records page badged them, but nothing alerted anyone. Migration 075
//   adds training_certification_alerts plus a refresh-on-open function,
//   the pattern from Workforce 263/265/267.
// * Dedupe is structural: a UNIQUE index on (certification_id,
//   expires_at, level) makes a second copy of the same alert impossible,
//   no matter how often the page is opened.
// * Alerts resolve when they stop describing reality: the expiry moved,
//   the expiry left the 30-day window, an "expiring" alert's cert has
//   since expired (superseded by "expired"), or the member recertified
//   the same course (a newer, still-current certification).
// * Audiences match the records page: the cert's own member and the
//   company's managers (is_company_manager). Rows are written ONLY by
//   the security-definer refresh function — authenticated gets SELECT
//   and nothing more, so an alert cannot be forged or erased.
// * The client calls refresh + the alerts read fail-soft, so until 075
//   is run the records page renders exactly as before.
// * Protected areas stay untouched: no time clock, shift video or
//   Communication Book surface appears in any changed file.

const SQL_PATH = "supabase/075_training_certification_alerts.sql";
const RECORDS_PAGE = "app/app/[companyId]/training/records/page.js";

test("migration 075 adds the deduped certification alerts table", () => {
  assert.ok(existsSync(SQL_PATH), "migration 075 exists");
  const sql = read(SQL_PATH);
  for (const needle of [
    "BEGIN;",
    "COMMIT;",
    "create table if not exists public.training_certification_alerts",
    "level text not null check (level in ('expiring', 'expired'))",
    "create unique index if not exists training_certification_alerts_dedupe_idx",
    "on public.training_certification_alerts (certification_id, expires_at, level)",
    "enable row level security",
    "grant select on public.training_certification_alerts to authenticated",
    "grant all on public.training_certification_alerts to service_role",
    '"training certification alerts select own or manager"',
    "public.is_company_manager(training_certification_alerts.company_id)",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
  assert.ok(
    !/grant (insert|update|delete)[^;]*training_certification_alerts to authenticated/.test(sql),
    "no write grant on the alerts table for authenticated: alerts cannot be forged"
  );
});

test("refresh function maintains alerts with the 30-day window and renewal follow", () => {
  const sql = read(SQL_PATH);
  for (const needle of [
    "create or replace function public.refresh_training_certification_alerts(p_company_id uuid)",
    "security definer",
    "public.is_company_member(p_company_id)",
    "interval '30 days'",
    "'expired'",
    "'expiring'",
    "on conflict (certification_id, expires_at, level)",
    "set resolved_at = now()",
    "new_cert.issued_at > old_cert.issued_at",
    "grant execute on function public.refresh_training_certification_alerts(uuid) to authenticated",
  ]) assert.ok(sql.includes(needle), `migration contains: ${needle}`);
});

test("records page refreshes on open, fails soft, and shows alerts", () => {
  const page = read(RECORDS_PAGE);
  for (const needle of [
    'sb.rpc("refresh_training_certification_alerts"',
    '.from("training_certification_alerts")',
    '.is("resolved_at", null)',
    "Certification alerts",
    "certById[a.certification_id]",
  ]) assert.ok(page.includes(needle), `records page contains: ${needle}`);
  // The pre-existing certification list behavior must still be there.
  for (const needle of [
    '.from("training_certifications")',
    "Training records",
    "My training records",
    "expired, recertify",
    "expiring soon",
  ]) assert.ok(page.includes(needle), `records page still contains: ${needle}`);
});

test("protected areas untouched by this build", () => {
  for (const path of [SQL_PATH, RECORDS_PAGE]) {
    const text = read(path);
    for (const banned of [
      "time_entries",
      "shift-videos",
      "shift_videos",
      "comm_book",
      "comm-book",
      "Communication Book",
    ]) {
      // The migration header may *mention* the protected areas only to
      // say they are untouched; code identifiers must never appear in
      // the page, and table/function identifiers never in the SQL.
      if (path === RECORDS_PAGE) {
        assert.ok(!text.includes(banned), `${path} must not reference ${banned}`);
      }
    }
  }
  const sql = read(SQL_PATH);
  for (const banned of ["time_entries", "shift_videos", "comm-book", "comm_book"]) {
    assert.ok(!sql.includes(banned), `migration must not reference ${banned}`);
  }
});
