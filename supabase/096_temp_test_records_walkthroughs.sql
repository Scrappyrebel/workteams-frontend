-- 096: Temp staffing — durable test records + walkthrough records
--
-- The 2026-11-07 temp modules (WorkTeams PRs #185/#186) shipped against
-- interim storage: skills-test results ride temp_member_skills in an
-- encoded tag form, and completed sales walkthroughs persist only on the
-- salesperson's device. This migration creates the real tables so a
-- follow-up build can wire the modules to durable company records:
--
-- * temp_test_records: one row per recorded test result (retakes keep
--   history; the latest row for a test wins in the app). Holds who
--   recorded it, an optional validity/expiry date, and a certificate
--   reference — none of which the tag encoding can carry. The factory
--   walkthrough's safety record and the forklift two-state record
--   belong in durable storage, not in tags.
-- * temp_walkthroughs: one row per completed field-sales walkthrough
--   (cleaning / office / factory). The factory template's safety
--   section is the agency's OSHA inquire-and-verify record, so it must
--   be a company record, not a device-local note.
--
-- Conventions match 043/046: uuid keys, company_id scoping, RLS through
-- public.is_company_manager, grants in THIS same block (2026-10-12
-- outage rule: a new table without grants fails its first request).

begin;

-- ---------- temp_test_records ----------
create table if not exists public.temp_test_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  test_key text not null check (char_length(test_key) between 1 and 60),
  lane text not null check (lane in ('cleaning', 'office', 'manufacturing')),
  passed boolean not null,
  score numeric(10,2),
  score_kind text check (score_kind is null or score_kind in ('percent', 'wpm')),
  recorded_by uuid references public.company_members(id) on delete set null,
  certificate_ref text,
  expires_at date,
  created_at timestamptz not null default now()
);
create index if not exists temp_test_records_member_idx
  on public.temp_test_records(company_id, member_id, test_key);

-- ---------- temp_walkthroughs ----------
create table if not exists public.temp_walkthroughs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lane text not null check (lane in ('cleaning', 'office', 'manufacturing')),
  client_name text,
  site_address text,
  answers jsonb not null default '{}'::jsonb,
  quote jsonb,
  completed_by uuid references public.company_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists temp_walkthroughs_company_idx
  on public.temp_walkthroughs(company_id, created_at desc);

-- ---------- RLS ----------
alter table public.temp_test_records enable row level security;
alter table public.temp_walkthroughs enable row level security;

-- Owners/managers of the temp company get full access to both tables.
drop policy if exists "temp owner full temp_test_records" on public.temp_test_records;
create policy "temp owner full temp_test_records"
  on public.temp_test_records for all
  using (public.is_company_manager(temp_test_records.company_id));

drop policy if exists "temp owner full temp_walkthroughs" on public.temp_walkthroughs;
create policy "temp owner full temp_walkthroughs"
  on public.temp_walkthroughs for all
  using (public.is_company_manager(temp_walkthroughs.company_id));

-- Temps can read their own test records (never anyone else's).
drop policy if exists "temp own test records" on public.temp_test_records;
create policy "temp own test records"
  on public.temp_test_records for select
  using (
    exists (
      select 1 from public.company_members m
      where m.id = temp_test_records.member_id and m.user_id = auth.uid()
    )
  );

-- ---------- Grants (same block; see 2026-10-12 outage) ----------
grant select, insert, update, delete on public.temp_test_records to authenticated;
grant all on public.temp_test_records to service_role;
grant select, insert, update, delete on public.temp_walkthroughs to authenticated;
grant all on public.temp_walkthroughs to service_role;

commit;
