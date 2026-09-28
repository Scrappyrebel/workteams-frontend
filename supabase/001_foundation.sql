-- ============================================================
-- WorkTeams Pass 1: foundation + Starter tier
-- Run each section separately in the Supabase SQL Editor.
-- ============================================================

-- ---------- Section 1: tables ----------

create table if not exists companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  tier text default 'starter',
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists company_members (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  user_id uuid,
  email text not null,
  display_name text,
  role text default 'employee',
  created_at timestamptz default now(),
  unique(company_id, email)
);

create table if not exists locations (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  address text,
  client_name text,
  client_phone text,
  notes text,
  lat numeric,
  lng numeric,
  geofence_radius_m int default 100,
  created_at timestamptz default now()
);

create table if not exists shifts (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  member_id uuid references company_members(id) on delete set null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  notes text,
  created_at timestamptz default now()
);

create table if not exists time_entries (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  member_id uuid references company_members(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  shift_id uuid references shifts(id) on delete set null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  clock_in_lat numeric,
  clock_in_lng numeric,
  clock_out_lat numeric,
  clock_out_lng numeric,
  notes text
);

-- ---------- Section 2: enable RLS ----------

alter table companies enable row level security;
alter table company_members enable row level security;
alter table locations enable row level security;
alter table shifts enable row level security;
alter table time_entries enable row level security;

-- ---------- Section 3: companies policies ----------

create policy "companies select if member"
  on companies for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = companies.id and m.user_id = auth.uid()
    )
  );

-- Lets the creator read the company immediately after creating it
-- (they are not a member yet at that point, so the member policy
-- alone would hide the just-created row from the insert's select).
create policy "companies select if creator"
  on companies for select
  using (created_by = auth.uid());

create policy "companies insert as creator"
  on companies for insert
  with check (created_by = auth.uid());

create policy "companies update if owner/admin"
  on companies for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = companies.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ---------- Section 4: company_members policies ----------
-- NOTE: policies on company_members must NEVER query company_members
-- directly (infinite recursion). They use the security-definer helpers
-- below, which check membership while bypassing RLS.

create or replace function public.is_company_member(cid uuid)
returns boolean language sql security definer set search_path = public
as $$ select exists (select 1 from company_members where company_id = cid and user_id = auth.uid()); $$;

create or replace function public.is_company_owner_admin(cid uuid)
returns boolean language sql security definer set search_path = public
as $$ select exists (select 1 from company_members where company_id = cid and user_id = auth.uid() and role in ('owner', 'admin')); $$;

grant execute on function public.is_company_member(uuid) to anon, authenticated;
grant execute on function public.is_company_owner_admin(uuid) to anon, authenticated;

create policy "members select if teammate"
  on company_members for select
  using (public.is_company_member(company_members.company_id));

create policy "members insert if owner/admin"
  on company_members for insert
  with check (public.is_company_owner_admin(company_members.company_id));

-- Lets the company creator insert their own owner row right after
-- creating the company (they aren't a member yet at that point).
create policy "members insert own owner row"
  on company_members for insert
  with check (
    company_members.user_id = auth.uid()
    and exists (
      select 1 from companies c
      where c.id = company_members.company_id
        and c.created_by = auth.uid()
    )
  );

-- Lets a user link their own auth account to a pending invite row
-- (user_id null) whose email matches their sign-in email.
create policy "members link own invite"
  on company_members for update
  using (
    company_members.user_id is null
    and company_members.email = (auth.jwt() ->> 'email')
  )
  with check (
    company_members.user_id = auth.uid()
  );

create policy "members update if owner/admin"
  on company_members for update
  using (public.is_company_owner_admin(company_members.company_id));

create policy "members delete if owner/admin"
  on company_members for delete
  using (public.is_company_owner_admin(company_members.company_id));

-- ---------- Section 5: locations policies ----------

create policy "locations select if member"
  on locations for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = locations.company_id and m.user_id = auth.uid()
    )
  );

create policy "locations manage if owner/admin"
  on locations for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = locations.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "locations update if owner/admin"
  on locations for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = locations.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "locations delete if owner/admin"
  on locations for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = locations.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ---------- Section 6: shifts policies ----------

create policy "shifts select if member"
  on shifts for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = shifts.company_id and m.user_id = auth.uid()
    )
  );

create policy "shifts manage if owner/admin"
  on shifts for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = shifts.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "shifts update if owner/admin"
  on shifts for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = shifts.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "shifts delete if owner/admin"
  on shifts for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = shifts.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ---------- Section 7: time_entries policies ----------

create policy "time select if member"
  on time_entries for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = time_entries.company_id and m.user_id = auth.uid()
    )
  );

create policy "time insert if member"
  on time_entries for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = time_entries.company_id
        and m.user_id = auth.uid()
        and m.id = time_entries.member_id
    )
  );

-- Clock out your own entry, or manage anyone's if owner/admin.
create policy "time update own or owner/admin"
  on time_entries for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = time_entries.company_id
        and m.user_id = auth.uid()
        and (
          m.id = time_entries.member_id
          or m.role in ('owner', 'admin')
        )
    )
  );

create policy "time delete if owner/admin"
  on time_entries for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = time_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
