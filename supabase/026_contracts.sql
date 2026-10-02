-- ============ 026: client contracts + portal messaging ============
-- Bid -> client approval -> contract -> esign, plus portal contact inbox.

-- ---------- contracts ----------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  bid_id uuid references public.bids(id) on delete set null,
  client_name text not null,
  client_email text,
  scope_of_work jsonb not null default '[]'::jsonb,
  start_date date not null,
  end_date date,
  visits_per_week int,
  price_per_visit numeric,
  yearly_increase_pct numeric not null default 3,
  extra_clean_price numeric,
  heavy_clean_price numeric,
  terms_text text,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','signed','expired','cancelled')),
  sign_token text unique,
  signed_at timestamptz,
  signed_name text,
  signed_ip text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.contracts to authenticated;
grant all on public.contracts to service_role;
alter table public.contracts enable row level security;

drop policy if exists "contracts manage if owner/admin" on public.contracts;
create policy "contracts manage if owner/admin"
  on public.contracts for all
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = contracts.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = contracts.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

-- ---------- portal_messages (client "Contact us" inbox) ----------
create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  portal_token_id uuid references public.portal_tokens(id) on delete set null,
  sender_name text,
  subject text,
  body text not null,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.portal_messages to authenticated;
grant all on public.portal_messages to service_role;
alter table public.portal_messages enable row level security;

drop policy if exists "portal_messages read if owner/admin" on public.portal_messages;
create policy "portal_messages read if owner/admin"
  on public.portal_messages for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = portal_messages.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );
drop policy if exists "portal_messages update if owner/admin" on public.portal_messages;
create policy "portal_messages update if owner/admin"
  on public.portal_messages for update
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = portal_messages.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );
-- Inserts come only through the portal API (service role). No direct insert policy.

-- ---------- work_orders: track portal-requested extra cleans ----------
alter table public.work_orders
  add column if not exists source text not null default 'staff'
    check (source in ('staff','portal')),
  add column if not exists agreed_price numeric;

-- ---------- bids: client email for approval links ----------
alter table public.bids
  add column if not exists client_email text,
  add column if not exists approve_token text unique;

-- ---------- same-company guards on new tables ----------
drop trigger if exists same_company_contracts on public.contracts;
create trigger same_company_contracts
  before insert or update on public.contracts
  for each row execute function public.same_company_guard('location_id', 'locations', 'bid_id', 'bids');

drop trigger if exists same_company_portal_messages on public.portal_messages;
create trigger same_company_portal_messages
  before insert or update on public.portal_messages
  for each row execute function public.same_company_guard('location_id', 'locations', 'portal_token_id', 'portal_tokens');
