// Migration 042: companies.state (2-letter code, nullable)
//
// Powers per-state rate guidance in the bid flow. The column is optional:
// app code reads it with a tolerant fetch that returns null when the column
// is missing or unset, so this migration is safe to run at any time and the
// app keeps working (with honest national reference ranges) until it runs.

// Idempotent: safe to re-run.
alter table public.companies
  add column if not exists state varchar(2) null;

comment on column public.companies.state is
  'Company home state, 2-letter code (e.g. MO). Nullable; drives state-adjusted rate guidance in bidding. Set by the owner in Settings.';

// Re-assert the expected grants on the whole table (idempotent).
grant select, insert, update, delete on public.companies to authenticated;
grant all on public.companies to service_role;
