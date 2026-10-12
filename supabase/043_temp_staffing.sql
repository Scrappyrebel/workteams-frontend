-- 043: Temp staffing module (gated second-company feature)
--
-- Powers a temp cleaning staffing service run as a separate company inside
-- WorkTeams: public customer booking + payment, open temp applications with
-- background-check consent, owner assignment dashboard, temp-to-hire tracking.
--
-- Design notes:
-- * The module is gated by temp_agency_config: only companies with a row
--   here get the temp-staffing UI. Other WorkTeams customers never see it.
-- * Public flows (booking, temp application) go through API routes using
--   service_role, so anon needs NO direct table access. Temp applications
--   contain PII (DOB, address) and are never directly readable by anon.
-- * Every new table gets its grants in THIS block (see 2026-10-12 outage:
--   new columns/tables without grants lock users out).

-- ---------- temp_agency_config ----------
create table if not exists public.temp_agency_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default true,
  -- Customer-facing price per cleaner per hour (dollars).
  base_hourly_rate numeric(10,2) not null default 35.00,
  -- What temps earn per hour (dollars). Margin = base - pay.
  temp_hourly_pay numeric(10,2) not null default 20.00,
  -- Temp-to-hire: days after which a client may hire the temp directly.
  -- 90 and 180 are both offered; per-client track chosen at assignment.
  hire_track_options int[] not null default '{90,180}',
  -- Optional flat conversion fee (dollars) when a client hires a temp.
  conversion_fee numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- temp_job_requests ----------
create table if not exists public.temp_job_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_type text not null check (service_type in (
    'commercial', 'residential', 'move_in_out', 'construction_cleanup', 'day_janitorial', 'other'
  )),
  cleaners_needed int not null check (cleaners_needed > 0),
  hours_requested numeric(10,2) not null check (hours_requested > 0),
  job_date date,
  -- For day_janitorial / long-term: recurring schedule description.
  schedule_notes text,
  site_address text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  job_details text,
  status text not null default 'pending' check (status in (
    'pending', 'quoted', 'paid', 'assigned', 'in_progress', 'completed', 'cancelled'
  )),
  quoted_cents int,
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists temp_job_requests_company_idx on public.temp_job_requests(company_id, status);

-- ---------- temp_applications ----------
create table if not exists public.temp_applications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  date_of_birth date,
  address text,
  -- FCRA: standalone disclosure + written authorization required before a
  -- third-party background check. Both recorded with timestamps.
  bg_check_disclosure_shown_at timestamptz,
  bg_check_consent boolean not null default false,
  bg_check_consent_at timestamptz,
  bg_check_status text not null default 'pending' check (bg_check_status in (
    'pending', 'clear', 'review', 'failed'
  )),
  bg_check_provider_ref text,
  experience text,
  availability text,
  -- If approved, link to the company_members row created for the temp.
  member_id uuid references public.company_members(id) on delete set null,
  status text not null default 'applied' check (status in (
    'applied', 'approved', 'rejected', 'hired_away'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists temp_applications_company_idx on public.temp_applications(company_id, status);

-- ---------- temp_assignments ----------
create table if not exists public.temp_assignments (
  id uuid primary key default gen_random_uuid(),
  job_request_id uuid not null references public.temp_job_requests(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  status text not null default 'offered' check (status in (
    'offered', 'accepted', 'declined', 'completed', 'no_show'
  )),
  -- Temp-to-hire clock starts when the temp first works for this client.
  hire_track_days int check (hire_track_days in (90, 180)),
  hire_eligible_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_request_id, member_id)
);

-- ---------- temp_hire_conversions ----------
create table if not exists public.temp_hire_conversions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  client_name text not null,
  first_work_date date not null,
  hire_track_days int not null check (hire_track_days in (90, 180)),
  eligible_date date not null,
  status text not null default 'cooling' check (status in (
    'cooling', 'eligible', 'converted', 'waived'
  )),
  conversion_fee_cents int not null default 0,
  converted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.temp_agency_config enable row level security;
alter table public.temp_job_requests enable row level security;
alter table public.temp_applications enable row level security;
alter table public.temp_assignments enable row level security;
alter table public.temp_hire_conversions enable row level security;

-- Owners/managers of the temp company get full access to all five tables.
-- Note: temp_assignments has no company_id of its own; its policy joins
-- through temp_job_requests.
do $$
declare t text;
begin
  foreach t in array array[
    'temp_agency_config', 'temp_job_requests', 'temp_applications',
    'temp_hire_conversions'
  ] loop
    execute format(
      'drop policy if exists %I on public.%I',
      'temp owner full ' || t, t);
    execute format(
      'create policy %I on public.%I for all using (public.is_company_manager(%I.company_id))',
      'temp owner full ' || t, t, t);
  end loop;
end $$;

drop policy if exists "temp owner full temp_assignments" on public.temp_assignments;
create policy "temp owner full temp_assignments"
  on public.temp_assignments for all
  using (
    exists (
      select 1 from public.temp_job_requests jr
      where jr.id = temp_assignments.job_request_id
        and public.is_company_manager(jr.company_id)
    )
  );

-- Assigned temps can read their own assignments.
drop policy if exists "temp own assignments" on public.temp_assignments;
create policy "temp own assignments"
  on public.temp_assignments for select
  using (
    exists (
      select 1 from public.company_members m
      where m.id = temp_assignments.member_id and m.user_id = auth.uid()
    )
  );

-- ---------- Grants (same block; see 2026-10-12 outage) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'temp_agency_config', 'temp_job_requests', 'temp_applications',
    'temp_assignments', 'temp_hire_conversions'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
