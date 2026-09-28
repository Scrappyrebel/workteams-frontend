-- ============================================================
-- WorkTeams Pass 2: Plus tier (inspections, messaging, geofencing)
-- Run each section separately in the Supabase SQL Editor.
-- ============================================================

-- ---------- Section 1: tables ----------

create table if not exists inspections (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  inspector_id uuid references company_members(id) on delete set null,
  inspection_date date not null default CURRENT_DATE,
  score int check (score >= 1 and score <= 5),
  notes text,
  created_at timestamptz default now()
);

create table if not exists inspection_photos (
  id uuid default gen_random_uuid() primary key,
  inspection_id uuid references inspections(id) on delete cascade,
  photo_url text not null,
  caption text,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  sender_id uuid references company_members(id) on delete set null,
  content text not null,
  created_at timestamptz default now()
);

-- Geofence columns on locations (safe if already present from Pass 1).
alter table locations add column if not exists lat numeric;
alter table locations add column if not exists lng numeric;
alter table locations add column if not exists geofence_radius_m int default 100;

-- ---------- Section 2: enable RLS ----------

alter table inspections enable row level security;
alter table inspection_photos enable row level security;
alter table messages enable row level security;

-- ---------- Section 3: inspections policies ----------

create policy "inspections select if member"
  on inspections for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = inspections.company_id and m.user_id = auth.uid()
    )
  );

create policy "inspections insert if owner/admin"
  on inspections for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = inspections.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "inspections update if owner/admin"
  on inspections for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = inspections.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "inspections delete if owner/admin"
  on inspections for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = inspections.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ---------- Section 4: inspection_photos policies ----------

create policy "inspection_photos select if member"
  on inspection_photos for select
  using (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_photos.inspection_id
        and m.user_id = auth.uid()
    )
  );

create policy "inspection_photos insert if owner/admin"
  on inspection_photos for insert
  with check (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_photos.inspection_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "inspection_photos delete if owner/admin"
  on inspection_photos for delete
  using (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_photos.inspection_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ---------- Section 5: messages policies ----------

create policy "messages select if member"
  on messages for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = messages.company_id and m.user_id = auth.uid()
    )
  );

create policy "messages insert own if member"
  on messages for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = messages.company_id
        and m.user_id = auth.uid()
        and m.id = messages.sender_id
    )
  );

-- ---------- Section 6: storage bucket + policies ----------

insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', true)
on conflict (id) do nothing;

-- Photos are stored at {company_id}/{inspection_id}/{filename}.
-- Read: any member of the company. Write/delete: owner/admin only.
-- Uses the security-definer helpers from Pass 1 (no RLS recursion).

create policy "inspection-photos read if member"
  on storage.objects for select
  using (
    bucket_id = 'inspection-photos'
    and public.is_company_member(((string_to_array(name, '/'))[1])::uuid)
  );

create policy "inspection-photos upload if owner/admin"
  on storage.objects for insert
  with check (
    bucket_id = 'inspection-photos'
    and public.is_company_owner_admin(((string_to_array(name, '/'))[1])::uuid)
  );

create policy "inspection-photos delete if owner/admin"
  on storage.objects for delete
  using (
    bucket_id = 'inspection-photos'
    and public.is_company_owner_admin(((string_to_array(name, '/'))[1])::uuid)
  );
