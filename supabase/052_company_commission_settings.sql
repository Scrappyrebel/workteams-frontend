-- 052: Per-company sales commission / bonus tool settings (WorkTeams).
--
-- commission_mode:
--   'off'   (default for every new/existing company) — no commission
--           screens, wording, links or math anywhere, for any role.
--   'owner' — calculator, settings and plan live ONLY in owner-visible
--           areas. Employees/managers see nothing about commission.
--   'team'  — managers/salespeople can see the plan wording (generated
--           from these settings, never hard-coded) and commission
--           projections for the company's bids.
--
-- Rates are percentages (8.5 = 8.5%). flat_monthly_amount is an
-- optional alternative to percentage-of-revenue; NULL = use the %.
-- Collected-revenue rule: no commission accrues on uncollected revenue
-- or canceled months; renewals/add-ons earn nothing unless the owner
-- changes these settings.
--
-- Storage route: a NEW per-company settings table (mirrors Business HQ's
-- company_commission_settings) — NOT new columns on public.companies, so
-- the migration-024 column-grant regime for companies does not apply.
--
-- Safe to run before the app update ships: client code tolerates this
-- table being absent and falls back to mode 'off' + defaults.
-- NEVER applied by the builder — Wendy runs this herself.

create table if not exists public.company_commission_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  commission_mode text not null default 'off'
    check (commission_mode in ('off', 'owner', 'team')),
  salesperson_rate_percent numeric(6, 3) not null default 8.5
    check (salesperson_rate_percent >= 0 and salesperson_rate_percent <= 100),
  company_rate_percent numeric(6, 3) not null default 4.25
    check (company_rate_percent >= 0 and company_rate_percent <= 100),
  payout_months integer not null default 12
    check (payout_months >= 1 and payout_months <= 120),
  flat_monthly_amount numeric(12, 2)
    check (flat_monthly_amount is null or flat_monthly_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.company_commission_settings enable row level security;

-- Grants (required in the same block for new public tables).
grant select, insert, update, delete on public.company_commission_settings to authenticated;
grant all on public.company_commission_settings to service_role;

-- Active company members may read their own company's settings
-- (the app gates every commission surface by mode + role on top of
-- this; in 'team' mode managers need the rates to see the plan).
-- Uses the existing security-definer helpers from 001/023 so the
-- policies never query company_members in a way that can recurse.
drop policy if exists "company members read commission settings" on public.company_commission_settings;
create policy "company members read commission settings"
  on public.company_commission_settings
  for select to authenticated
  using (public.is_company_member(company_commission_settings.company_id));

-- Only the company owner may create the settings row.
drop policy if exists "company owner insert commission settings" on public.company_commission_settings;
create policy "company owner insert commission settings"
  on public.company_commission_settings
  for insert to authenticated
  with check (public.is_company_owner(company_commission_settings.company_id));

-- Only the company owner may change the settings.
drop policy if exists "company owner update commission settings" on public.company_commission_settings;
create policy "company owner update commission settings"
  on public.company_commission_settings
  for update to authenticated
  using (public.is_company_owner(company_commission_settings.company_id))
  with check (public.is_company_owner(company_commission_settings.company_id));
