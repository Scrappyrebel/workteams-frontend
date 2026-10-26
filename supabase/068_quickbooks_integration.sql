-- 068: QuickBooks Online connection layer (accounting integration v1).
--
-- Design (owner's accounting handoff extension, section 15, applied to
-- WorkTeams' mid-weight accounting):
--
-- * The connection belongs to the SUBSCRIBER COMPANY, never to the
--   platform. Each company connects its OWN QuickBooks Online company
--   through Intuit's OAuth flow. Tokens are stored per company and are
--   never shared between companies.
-- * QuickBooks is the books of record once connected; WorkTeams stays
--   the operational system. Nothing in this file (or the integration
--   code) edits invoices, invoice line items, or invoice payments --
--   posting to QuickBooks records a link/status in the integration
--   tables only, never an amount.
-- * Token lockdown: OAuth tokens live in integration_tokens, which has
--   RLS on, NO policies, and NO grant to authenticated or anon. Only the
--   service role (server routes) can read or write it. The client reads
--   connection STATUS from integration_connections, which carries no
--   token values, ever.
-- * Mapping: integration_account_mappings maps WorkTeams categories to
--   the company's own QuickBooks chart of accounts (or tax codes). A
--   transaction whose needed category is unmapped is NEVER posted -- it
--   waits in the queue (integration_sync_items, status
--   'queued_unmapped'), visibly, until the company maps it. Nothing is
--   ever posted to a generic "miscellaneous" account.
-- * Duplicate protection: every post carries an idempotency key derived
--   from the WorkTeams record (integration_sync_items.idempotency_key,
--   unique per company) and is sent to QuickBooks as the create
--   request's requestid, so retries, double-taps, lost responses, and
--   reconnects can never create a duplicate in QuickBooks.
-- * Audit: every connect, refresh failure, post attempt, webhook-driven
--   fetch, and disconnect writes an integration_sync_log row -- what was
--   sent, what was acknowledged, what failed.
-- * Access: connecting, mapping, and syncing are owner/admin work (the
--   same policy shape as invoicing in 061). Employees and supervisors
--   have no access to any integration table.
-- * No columns are added to companies (migration-024 lesson); the whole
--   integration lives in these side tables.
--
-- Run in the Supabase SQL editor (project: WorkTeams). Paste the WHOLE
-- file into ONE query and run it ONCE -- it is a single BEGIN..COMMIT.
-- Safe to re-run (idempotent). The app tolerates this migration not
-- having run yet: the Connections page shows an honest "setup pending"
-- state and nothing is blocked.

BEGIN;

-- ============ 1. Provider connections (status only -- no tokens) ============
create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('quickbooks')),
  realm_id text,
  provider_company_name text not null default '' check (length(provider_company_name) <= 200),
  status text not null default 'connected'
    check (status in ('connected', 'needs_attention', 'disconnected')),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text not null default '' check (length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_company_provider_uq unique (company_id, provider)
);
create index if not exists integration_connections_realm_idx
  on public.integration_connections(provider, realm_id) where realm_id is not null;
alter table public.integration_connections enable row level security;
-- Clients may read connection STATUS only through RLS below; all writes
-- happen in server routes through the service role.
grant select on public.integration_connections to authenticated;
grant all on public.integration_connections to service_role;

drop policy if exists "integration connections owner/admin read" on public.integration_connections;
create policy "integration connections owner/admin read" on public.integration_connections
  for select to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = integration_connections.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));

comment on table public.integration_connections is
 'Per-company outside-accounting connections (migration 068). STATUS ONLY -- this table never holds token values; tokens live in integration_tokens (service role only). QuickBooks is the books of record once connected; WorkTeams remains the operational system.';

-- ============ 2. OAuth tokens -- SERVICE ROLE ONLY ============
create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references public.integration_connections(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integration_tokens enable row level security;
-- Deliberately NO policies and NO grant to authenticated or anon: with
-- RLS on and no policy, the table is unreachable through the API. Only
-- the service role (which bypasses RLS) touches it, from server routes.
revoke all on public.integration_tokens from authenticated, anon;
grant all on public.integration_tokens to service_role;

comment on table public.integration_tokens is
 'OAuth tokens for integration connections (migration 068). SERVICE ROLE ONLY: RLS on, no policies, no authenticated/anon grants. Never expose token values to the client, logs, or any other company.';

-- ============ 3. OAuth state nonces -- SERVICE ROLE ONLY ============
create table if not exists public.integration_oauth_states (
  nonce text primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('quickbooks')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.integration_oauth_states enable row level security;
-- Same lockdown as tokens: server routes only.
revoke all on public.integration_oauth_states from authenticated, anon;
grant all on public.integration_oauth_states to service_role;

comment on table public.integration_oauth_states is
 'Short-lived CSRF nonces for integration OAuth callbacks (migration 068). SERVICE ROLE ONLY. Rows are deleted when the callback consumes them and expire after 10 minutes.';

-- ============ 4. Chart-of-accounts mapping + unmapped queue anchor ============
create table if not exists public.integration_account_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('quickbooks')),
  app_category text not null check (app_category in
    ('invoice_income', 'invoice_tax', 'other_income', 'expense_default')),
  provider_ref_type text not null check (provider_ref_type in ('account', 'tax_code')),
  provider_ref_id text not null check (length(provider_ref_id) <= 100),
  provider_ref_name text not null default '' check (length(provider_ref_name) <= 300),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_mappings_company_provider_category_uq
    unique (company_id, provider, app_category)
);
alter table public.integration_account_mappings enable row level security;
grant select, insert, update, delete on public.integration_account_mappings to authenticated;
grant all on public.integration_account_mappings to service_role;

drop policy if exists "integration mappings owner/admin read" on public.integration_account_mappings;
create policy "integration mappings owner/admin read" on public.integration_account_mappings
  for select to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = integration_account_mappings.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
drop policy if exists "integration mappings owner/admin insert" on public.integration_account_mappings;
create policy "integration mappings owner/admin insert" on public.integration_account_mappings
  for insert to authenticated
  with check (exists (select 1 from public.company_members m
    where m.company_id = integration_account_mappings.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
drop policy if exists "integration mappings owner/admin update" on public.integration_account_mappings;
create policy "integration mappings owner/admin update" on public.integration_account_mappings
  for update to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = integration_account_mappings.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')))
  with check (exists (select 1 from public.company_members m
    where m.company_id = integration_account_mappings.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
drop policy if exists "integration mappings owner/admin delete" on public.integration_account_mappings;
create policy "integration mappings owner/admin delete" on public.integration_account_mappings
  for delete to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = integration_account_mappings.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));

comment on table public.integration_account_mappings is
 'Per-company mapping from WorkTeams categories to the company''s own QuickBooks chart of accounts / tax codes (migration 068). A transaction whose category is unmapped never auto-posts; it waits in the sync queue (integration_sync_items).';

-- ============ 5. Sync items: post links, queue, idempotency ============
create table if not exists public.integration_sync_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('quickbooks')),
  source_table text not null check (source_table in ('invoices')),
  source_id uuid not null,
  operation text not null check (operation in ('post')),
  idempotency_key uuid not null,
  status text not null default 'posting'
    check (status in ('posting', 'posted', 'queued_unmapped', 'failed')),
  provider_id text,
  provider_doc_number text,
  detail text not null default '' check (length(detail) <= 1000),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_sync_items_source_uq
    unique (company_id, provider, source_table, source_id, operation),
  constraint integration_sync_items_idempotency_uq
    unique (company_id, idempotency_key)
);
create index if not exists integration_sync_items_company_status_idx
  on public.integration_sync_items(company_id, status);
alter table public.integration_sync_items enable row level security;
-- Clients read post status/queue only; all writes are server-side.
grant select on public.integration_sync_items to authenticated;
grant all on public.integration_sync_items to service_role;

drop policy if exists "integration sync items owner/admin read" on public.integration_sync_items;
create policy "integration sync items owner/admin read" on public.integration_sync_items
  for select to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = integration_sync_items.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));

comment on table public.integration_sync_items is
 'One row per WorkTeams record posted (or waiting to post) to a provider (migration 068). idempotency_key is sent to QuickBooks as the create requestid, so retries never duplicate. Posting NEVER edits the source record: this table holds the link and status only.';

-- ============ 6. Sync log: the audit trail ============
create table if not exists public.integration_sync_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('quickbooks')),
  direction text not null check (direction in ('out', 'in', 'auth')),
  event text not null check (length(event) <= 100),
  summary text not null default '' check (length(summary) <= 1000),
  sync_item_id uuid references public.integration_sync_items(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists integration_sync_log_company_created_idx
  on public.integration_sync_log(company_id, created_at desc);
alter table public.integration_sync_log enable row level security;
grant select on public.integration_sync_log to authenticated;
grant all on public.integration_sync_log to service_role;

drop policy if exists "integration sync log owner/admin read" on public.integration_sync_log;
create policy "integration sync log owner/admin read" on public.integration_sync_log
  for select to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = integration_sync_log.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));

comment on table public.integration_sync_log is
 'Append-only audit of integration activity (migration 068): what was sent, what was acknowledged, what failed, and who initiated it. Summaries never contain token values.';

-- ============ 7. Remote records cache (webhook fetch-after-notify) ============
create table if not exists public.integration_remote_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('quickbooks')),
  entity_type text not null check (entity_type in ('invoice', 'payment', 'expense')),
  provider_id text not null check (length(provider_id) <= 100),
  summary jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  constraint integration_remote_records_uq
    unique (company_id, provider, entity_type, provider_id)
);
create index if not exists integration_remote_records_company_type_idx
  on public.integration_remote_records(company_id, entity_type, fetched_at desc);
alter table public.integration_remote_records enable row level security;
grant select on public.integration_remote_records to authenticated;
grant all on public.integration_remote_records to service_role;

drop policy if exists "integration remote records owner/admin read" on public.integration_remote_records;
create policy "integration remote records owner/admin read" on public.integration_remote_records
  for select to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = integration_remote_records.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));

comment on table public.integration_remote_records is
 'Cache of provider records fetched after webhook notifications or on-demand reads (migration 068). Display-only: summaries of QuickBooks invoices/payments/expenses, always labeled as QuickBooks data in the UI. QuickBooks remains the record; this cache is never edited back.';

COMMIT;
