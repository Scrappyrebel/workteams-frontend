# Data-retention purge — design

## The promise (as written)

Privacy Policy §5 (app/privacy/page.js):

> "We retain personal information for as long as your account is active or as
> needed to provide the Service. After account cancellation or termination, we
> retain Customer Data for 90 days to allow reactivation or export, consistent
> with our Terms of Service, after which it may be permanently deleted. We may
> retain certain records longer where required by law (e.g., tax and
> transaction records)."

Terms of Service §8 (app/terms/page.js):

> "You may stop using WorkTeams at any time. We may suspend or terminate
> accounts that violate these terms or threaten the security of the service.
> On termination, access to paid features ends; you may request export or
> deletion of your company's data."

Before this branch, nothing recorded when a company cancelled and nothing
ever purged — the promise had no mechanism behind it.

## Pieces

| File | What it is |
| --- | --- |
| `supabase/049_retention_purge.sql` | Migration: cancellation anchor column + trigger + audit log table. Run by hand in the Supabase SQL editor. Deletes nothing by itself. |
| `app/api/cron/retention-purge/route.js` | Cron route (daily via `vercel.json`), gated by `CRON_SECRET` exactly like `/api/cron/attendance`. |
| `vercel.json` | Adds the daily schedule entry for the route. |

## The anchor signal — and why

**`companies.subscription_ended_at`** (new, migration 049).

What existed before: `companies.subscription_status` is reliably maintained
by the Stripe webhook (`app/api/stripe/webhook/route.js`) — it is set to
`"canceled"` on `customer.subscription.deleted`, which is the true end of a
subscription (a cancel-at-period-end request keeps the company `active`
until the period actually ends, then Stripe fires the deletion). But **no
timestamp of that transition existed anywhere**: `stripe_webhook_events`
stores event id/type/processed_at with no company linkage, so a cancel date
could not be reconstructed. A status without a date cannot drive a 90-day
clock, so one column was unavoidable.

How the column stays correct with zero app-code changes: a `BEFORE UPDATE`
trigger on `companies` stamps `subscription_ended_at = now()` at the moment
`subscription_status` enters `'canceled'`, and **clears it** if the company
returns to `active`/`trialing` — so a reactivation inside the 90-day window
resets the clock, matching §5's "to allow reactivation" purpose.

Companies already `canceled` when the migration runs get the stamp set to
the migration date — a **fresh** 90-day clock. Their true cancel date was
never recorded, and the promise must never be undercut by guessing an
earlier one.

A company is **eligible** when: `subscription_status = 'canceled'`,
`subscription_ended_at` is not null, and the stamp is ≥ 90 days old.

## Safety rails (the important part)

- **Report-only by default.** The route deletes nothing unless the
  `RETENTION_PURGE_ENABLED` environment variable is exactly `"true"`. In
  report mode it counts rows/files per eligible company and writes an
  audit row + console log line. There is no code path that deletes in the
  default state.
- **Re-verification before any delete.** In purge mode each company is
  re-read immediately before deletion; it is skipped (and logged) unless
  it is still `canceled`, the stamp is unchanged, `stripe_subscription_id`
  is still null, and it is not a complimentary company.
- **Fail closed.** If migration 049 hasn't been run, the route logs one
  clear line and returns `{ migrationMissing: true }`. A storage error
  aborts that company before any row is deleted. Any delete failure stops
  the whole purge run. At most 25 companies are processed per run.
- **Audit trail.** Every outcome (`reported` / `deleted` / `failed` /
  `skipped`) is written to `public.retention_purge_log` with per-table and
  per-bucket counts and a snapshot of the company name, so the record
  survives the deletion it describes.

## What gets deleted (purge mode)

Order: storage files first, then child tables, then `company_members`,
then the `companies` row last (its DELETE repeats the eligibility
conditions in the WHERE clause as a final guard).

Every company-owned table carries `company_id` and a foreign key to
`companies(id) ON DELETE CASCADE` (verified across all migrations); rows
are nevertheless deleted explicitly, in this order, so the audit log has
real counts:

`comm_book, messages, portal_messages, emergency_alerts, shift_videos,
time_entries, shifts, inspections, work_order_comments, work_orders,
supplies, expense_entries, revenue_entries, contract_amendments,
contracts, bids, walkthroughs, rate_areas, temp_shift_offers,
temp_hire_conversions, temp_member_skills, temp_applications,
temp_client_profiles, temp_job_requests, temp_agency_config,
training_certifications, training_enrollments, portal_tokens,
push_subscriptions, member_pay, location_private, locations,
bootstrap_consumed, company_members`, then `companies`.

Grandchild tables without `company_id` — `bid_items`, `inspection_items`,
`inspection_photos`, `walkthrough_areas`, `temp_assignments`,
`training_approvals`, `training_evidence`, `training_exam_attempts`,
`training_step_progress` — cascade from the parents above.

**Never deleted** (global, not company data): `product_tiers`,
`temp_staffing_types`, the training catalog (`training_courses`,
`training_lessons`, `training_steps`, `training_questions`,
`training_practicals`), and `stripe_webhook_events`. The webhook-event
log is also the §5 legal-retention carve-out in practice: tax/transaction
records live in Stripe itself and in that log, neither of which is
company-keyed purge scope. Auth accounts (`auth.users`) belonging to a
purged company's members are **not** deleted — a person can belong to
several companies; their `company_members` rows for the purged company
are removed, nothing more.

## Storage

Uploads are keyed under a `<company_id>/...` path prefix (see
`lib/safe-shift-video-upload.js`), so a company's files are exactly the
objects under that prefix. The purge lists (and, in purge mode, removes)
that prefix in each bucket:

- `shift-videos` — end-of-shift videos (incl. multipart `.part-*` files and manifests)
- `inspection-photos` — inspection and comm-book photos
- `training-evidence` — training step evidence uploads

Listing is recursive with a depth cap and a 5,000-object-per-bucket cap;
exceeding the cap fails that company closed (nothing deleted) rather than
guessing.

## Turning it on (owner checklist)

1. **Merge this branch** (deploys the route + daily cron). Still inert:
   report-only, and it no-ops until the migration exists.
2. **Run `supabase/049_retention_purge.sql`** in the WorkTeams Supabase
   SQL editor.
3. **Watch the dry-run reports** — query `retention_purge_log` or the
   Vercel function logs for `[retention-purge] DRY-RUN` lines. Confirm
   the eligible companies are the ones expected.
4. **Only then**, set `RETENTION_PURGE_ENABLED=true` in the Vercel
   project environment and redeploy. To stop all future deletion, unset
   it (or set it to anything else) and redeploy — the route returns to
   report-only.

## Terms §8 export / deletion requests — spec only (not built)

Terms §8 lets a terminated customer "request export or deletion of your
company's data"; Privacy §6 routes requests to lillybsjanitorial@gmail.com.
Today those requests are handled manually by email, and the 90-day §5
window is precisely the window in which they must be answered. **No export
tooling is built in this branch.** Specification for the future build:

- **Export**: an owner-triggered, service-role job that assembles the same
  table inventory above (per company, `company_id = ?`) into a JSON bundle
  plus a CSV per major table, zips it with the company's storage objects
  (same three buckets / `<company_id>/` prefix), stores the archive in a
  private bucket, and returns a short-lived signed download link to the
  requesting owner. Payroll-adjacent tables (`time_entries`, `member_pay`)
  are included — they are the records a departing business most needs.
- **On-request deletion**: the same purge path as this route, invoked for
  one named company after the owner confirms the request in writing —
  i.e. a manual, single-company call into the purge routine rather than
  waiting for the 90-day clock. The audit log records it identically.

Until that tooling exists, the honest operating procedure is: answer the
email, run the export by hand from the database if asked, and let the
90-day purge (or a manually invoked single-company purge) do the
deletion — either way the run lands in `retention_purge_log` like any
other.
