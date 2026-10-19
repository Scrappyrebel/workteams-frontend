-- 048: Temp staffing Batch 3 — multi-type intake round.
-- * temp_agency_config.staffing_types: which temp lanes the agency runs
--   (cleaning / office / manufacturing / hospitality / general_labor).
-- * temp_staffing_types: catalog of lanes, per-lane skills + onboarding questions.
-- * temp_client_profiles: one-time client intake (POINT 1), reused to prefill bookings.
-- * temp_applications: onboarding columns (POINT 3) — worker profile.
-- * temp_shift_offers: per-assignment offer accept/decline (POINT 4).
-- * temp_job_requests: per-request booking columns (POINT 2).
-- Never collected in-app: SSN, W-4, I-9 documents, bank/direct-deposit, drug-test results.
-- Attorney review required before in-app signing: non-solicitation, MSA, drug-testing policy.

-- ---------- staffing lanes on the agency config ----------
alter table public.temp_agency_config
  add column if not exists staffing_types text[] not null default '{cleaning}';

-- ---------- staffing type catalog ----------
create table if not exists public.temp_staffing_types (
  key text primary key,
  label text not null,
  description text not null,
  default_skills text[] not null default '{}',
  -- [{key,label,type: text|number|yesno|select|multiselect, options?}]
  onboarding_fields jsonb not null default '[]'
);
alter table public.temp_staffing_types enable row level security;
grant select on public.temp_staffing_types to anon, authenticated;
grant all on public.temp_staffing_types to service_role;
drop policy if exists "public read staffing types" on public.temp_staffing_types;
create policy "public read staffing types"
  on public.temp_staffing_types for select using (true);

insert into public.temp_staffing_types (key, label, description, default_skills, onboarding_fields)
values
  ('cleaning', 'Cleaning / Janitorial',
   'Janitorial and cleaning temps for commercial, residential and specialty sites.',
   '{general cleaning,restrooms,trash removal,mopping,vacuuming,floor strip & wax,carpet extraction,window cleaning,pressure washing}',
   '[{"key":"years_janitorial","label":"Years of janitorial experience","type":"number"},
     {"key":"facility_types","label":"Facility types cleaned before","type":"multiselect","options":["office","church","school","medical","restaurant","retail","warehouse","residential"]},
     {"key":"can_lift_40","label":"Can lift up to 40 lbs","type":"yesno"},
     {"key":"ok_alone","label":"Comfortable working alone on site","type":"yesno"},
     {"key":"ok_alarms","label":"Comfortable with alarm systems and lock-up","type":"yesno"}]'),
  ('office', 'Office / Administrative',
   'Admin, clerical and front-office temps.',
   '{data entry,typing 50+ wpm,microsoft office,quickbooks,filing,reception,customer service,scheduling,phones}',
   '[{"key":"typing_wpm","label":"Typing speed (words per minute)","type":"number"},
     {"key":"software","label":"Software you know well","type":"text"},
     {"key":"years_office","label":"Years of office experience","type":"number"}]'),
  ('manufacturing', 'Manufacturing / Industrial',
   'Industrial, warehouse and production temps.',
   '{forklift certified,assembly,packaging,machine operation,quality inspection,shipping & receiving,inventory,pallet jack}',
   '[{"key":"forklift_cert","label":"Forklift certified","type":"yesno"},
     {"key":"shift_pref","label":"Shift preference","type":"select","options":["1st shift","2nd shift","3rd shift","any"]},
     {"key":"steel_toe","label":"Own steel-toe boots","type":"yesno"},
     {"key":"can_lift_50","label":"Can lift up to 50 lbs","type":"yesno"}]'),
  ('hospitality', 'Hospitality / Events',
   'Event, food-service and guest-service temps.',
   '{serving,bartending,housekeeping,front desk,banquet setup,cashiering,barista}',
   '[{"key":"alcohol_cert","label":"Alcohol serving certified (where required)","type":"yesno"},
     {"key":"years_hospitality","label":"Years of hospitality experience","type":"number"}]'),
  ('general_labor', 'General Labor',
   'Day labor, moving, outdoor and site-support temps.',
   '{loading & unloading,landscaping,moving help,demolition,flagging,warehouse support}',
   '[{"key":"can_lift_50","label":"Can lift up to 50 lbs","type":"yesno"},
     {"key":"outdoor_ok","label":"OK working outdoors in all weather","type":"yesno"}]')
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  default_skills = excluded.default_skills,
  onboarding_fields = excluded.onboarding_fields;

-- ---------- client profiles (POINT 1: asked once, reused) ----------
create table if not exists public.temp_client_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  staffing_type text not null default 'cleaning',
  business_name text not null,
  contact_first text,
  contact_last text,
  phone text,
  email text,
  billing_address text,
  invoice_method text,
  payment_terms text,
  site_address text,
  site_city text,
  site_zip text,
  facility_type text,
  supplies_provider text,
  access_info text,
  parking_info text,
  on_site_contact_name text,
  on_site_contact_phone text,
  task_checklist text[] not null default '{}',
  off_limits text,
  dress_code text,
  hazards text,
  ppe_required text,
  min_experience text,
  bg_check_required boolean not null default false,
  drug_test_required boolean not null default false,
  -- Private: staff who should never be sent back to this client.
  do_not_return text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists temp_client_profiles_company_idx
  on public.temp_client_profiles(company_id);
alter table public.temp_client_profiles enable row level security;
grant select, insert, update, delete on public.temp_client_profiles to authenticated;
grant all on public.temp_client_profiles to service_role;
drop policy if exists "temp manager full client_profiles" on public.temp_client_profiles;
create policy "temp manager full client_profiles"
  on public.temp_client_profiles for all
  using (public.is_company_manager(temp_client_profiles.company_id));

-- ---------- temp onboarding columns (POINT 3: worker profile) ----------
alter table public.temp_applications
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_relation text,
  add column if not exists emergency_contact_phone text,
  add column if not exists city text,
  add column if not exists zip text,
  add column if not exists earliest_start time,
  add column if not exists latest_end time,
  add column if not exists max_hours_per_week int,
  add column if not exists reliable_transportation boolean,
  add column if not exists years_experience int,
  add column if not exists facility_types text[] not null default '{}',
  add column if not exists can_lift_40lbs boolean,
  add column if not exists ok_work_alone boolean,
  add column if not exists ok_alarms_lockup boolean,
  add column if not exists drug_policy_ack boolean not null default false,
  add column if not exists drug_policy_ack_at timestamptz,
  add column if not exists reference_1_name text,
  add column if not exists reference_1_phone text,
  add column if not exists reference_2_name text,
  add column if not exists reference_2_phone text,
  add column if not exists staffing_types text[] not null default '{cleaning}',
  add column if not exists i9_completed boolean,
  add column if not exists everify_status text
    check (everify_status in ('yes', 'no', 'not_required')),
  -- Per-lane extra answers, keyed by onboarding_fields keys above.
  add column if not exists extra_answers jsonb not null default '{}',
  add column if not exists onboarding_completed boolean not null default false;

-- ---------- shift offers (POINT 4: accept / decline) ----------
create table if not exists public.temp_shift_offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid references public.temp_job_requests(id) on delete set null,
  temp_member_id uuid not null,
  staffing_type text not null default 'cleaning',
  client_name text not null,
  site_address text not null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  pay_rate numeric(10,2) not null,
  status text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'expired', 'cancelled')),
  respond_by timestamptz,
  -- Revealed to the temp on accept.
  report_to text,
  parking_info text,
  access_info text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists temp_shift_offers_company_idx
  on public.temp_shift_offers(company_id);
create index if not exists temp_shift_offers_member_idx
  on public.temp_shift_offers(temp_member_id);
alter table public.temp_shift_offers enable row level security;
grant select, insert, update, delete on public.temp_shift_offers to authenticated;
grant all on public.temp_shift_offers to service_role;
drop policy if exists "temp manager full shift_offers" on public.temp_shift_offers;
create policy "temp manager full shift_offers"
  on public.temp_shift_offers for all
  using (public.is_company_manager(temp_shift_offers.company_id));
drop policy if exists "temp own shift_offers" on public.temp_shift_offers;
create policy "temp own shift_offers"
  on public.temp_shift_offers for select
  using (exists (
    select 1 from public.company_members cm
    where cm.id = temp_shift_offers.temp_member_id
      and cm.user_id = auth.uid()
  ));
drop policy if exists "temp respond shift_offers" on public.temp_shift_offers;
create policy "temp respond shift_offers"
  on public.temp_shift_offers for update
  using (exists (
    select 1 from public.company_members cm
    where cm.id = temp_shift_offers.temp_member_id
      and cm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.company_members cm
    where cm.id = temp_shift_offers.temp_member_id
      and cm.user_id = auth.uid()
  ));

-- ---------- per-request booking columns (POINT 2) ----------
alter table public.temp_job_requests
  add column if not exists staffing_type text not null default 'cleaning',
  add column if not exists shift_start time,
  add column if not exists shift_end time,
  add column if not exists recurring_days text[] not null default '{}',
  add column if not exists recurring_until date,
  add column if not exists on_site_contact_name text,
  add column if not exists on_site_contact_phone text,
  add column if not exists bill_rate_confirmed numeric(10,2),
  add column if not exists engagement_type text not null default 'temp'
    check (engagement_type in ('temp', 'temp_to_hire', 'direct_hire')),
  add column if not exists client_profile_id uuid
    references public.temp_client_profiles(id) on delete set null;
