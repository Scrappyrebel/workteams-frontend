-- WorkTeams: isolated, opt-in authenticated-customer identity foundation.
-- THIS DOES NOT ENABLE customer login, customer-access RPCs or any new public read.
-- All companies start disabled, all per-action grants start false, zero rows inserted.
-- Existing one-location public bearer portal and employee/company_members unchanged.

create table if not exists public.client_portal_identity_settings(
 company_id uuid primary key references public.companies(id) on delete cascade,
 enabled boolean not null default false,
 enabled_by uuid references auth.users(id) on delete set null,
 enabled_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint client_portal_identity_settings_consistent check (
  (enabled=false) or (enabled_at is not null and enabled_by is not null)
 )
);

create table if not exists public.client_portal_contacts(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 email_normalized text not null check(
  char_length(email_normalized) between 3 and 254 and
  email_normalized=lower(btrim(email_normalized)) and
  email_normalized like '%@%.%'
 ),
 display_name text not null default '',
 status text not null default 'pending' check(status in('pending','active','disabled')),
 invite_language text not null default 'en' check(invite_language in('en','es')),
 approved_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,id),
 unique(company_id,email_normalized),
 constraint client_portal_contacts_approval_required check (
  status<>'active' or (approved_by is not null and approved_at is not null and revoked_at is null)
 )
);

create table if not exists public.client_portal_identity_links(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 contact_id uuid not null,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 email_normalized text not null,
 status text not null default 'pending' check(status in('pending','active','disabled')),
 verified_at timestamptz,
 linked_at timestamptz not null default now(),
 revoked_at timestamptz,
 updated_at timestamptz not null default now(),
 foreign key(company_id,contact_id)
   references public.client_portal_contacts(company_id,id) on delete cascade,
 unique(company_id,contact_id,auth_user_id),
 constraint client_portal_identity_links_active_verified check(
  status<>'active' or (verified_at is not null and revoked_at is null)
 )
);

-- Composite location key is required to enforce tenant isolation not just
-- at creation, but if a location's company_id is later changed.
create unique index if not exists
 client_portal_locations_company_id_id_key on public.locations(company_id,id);

create table if not exists public.client_portal_location_grants(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 contact_id uuid not null,
 location_id uuid not null,
 can_view_contracts boolean not null default false,
 can_view_quality boolean not null default false,
 can_view_requests boolean not null default false,
 can_view_documents boolean not null default false,
 can_request_services boolean not null default false,
 can_sign boolean not null default false,
 starts_at timestamptz,
 expires_at timestamptz,
 revoked_at timestamptz,
 approved_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,contact_id)
   references public.client_portal_contacts(company_id,id) on delete cascade,
 foreign key(company_id,location_id)
   references public.locations(company_id,id) on delete cascade,
 unique(company_id,contact_id,location_id),
 constraint client_portal_location_grants_date_order check(
  starts_at is null or expires_at is null or expires_at>starts_at
 )
);

-- Fail closed: NONE of these tables currently has an authenticated-customer
-- SELECT/INSERT/UPDATE policy, even if someone accidentally grants SQL privileges.
alter table public.client_portal_identity_settings enable row level security;
alter table public.client_portal_contacts enable row level security;
alter table public.client_portal_identity_links enable row level security;
alter table public.client_portal_location_grants enable row level security;

revoke all on public.client_portal_identity_settings from public,anon,authenticated;
revoke all on public.client_portal_contacts from public,anon,authenticated;
revoke all on public.client_portal_identity_links from public,anon,authenticated;
revoke all on public.client_portal_location_grants from public,anon,authenticated;

-- Only future carefully reviewed server-side management actions may access
-- these records using a protected secret; never from a location token.
grant all on public.client_portal_identity_settings to service_role;
grant all on public.client_portal_contacts to service_role;
grant all on public.client_portal_identity_links to service_role;
grant all on public.client_portal_location_grants to service_role;
