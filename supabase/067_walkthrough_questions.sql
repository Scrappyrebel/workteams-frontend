-- ============================================================
-- 067: Walkthrough question set — Wendy's phone questions (Part 1),
-- on-site room-by-room questions (Part 2), the before-you-leave
-- checklist, walkthrough appointment fields, and walkthrough photos.
--
-- Run this whole file ONCE in the Supabase SQL Editor.
--
-- Safe order: the app update can be deployed BEFORE this is run.
-- The walkthrough pages probe for these columns and simply keep
-- working the old way (no question sections) until the migration
-- has been run, so nobody gets locked out either way.
--
-- Walkthroughs hold bid strategy, so — like the tables from 005 —
-- everything here stays owner/admin only.
-- ============================================================

-- ---------- Section 1: walkthroughs — appointment + answers ----------

alter table walkthroughs add column if not exists scheduled_at timestamptz;
alter table walkthroughs add column if not exists meet_contact text;
alter table walkthroughs add column if not exists entry_notes text;
-- Part 1 phone answers (header fields + the 16 intake questions).
alter table walkthroughs add column if not exists intake jsonb not null default '{}'::jsonb;
-- Part 2 building-level answers + before-you-leave checklist.
alter table walkthroughs add column if not exists answers jsonb not null default '{}'::jsonb;

-- ---------- Section 2: walkthrough_areas — floor type, fixtures, answers ----------

alter table walkthrough_areas add column if not exists floor_type text;
-- Restroom fixture counts (a real pricing input).
alter table walkthrough_areas add column if not exists toilets_count int;
alter table walkthrough_areas add column if not exists urinals_count int;
alter table walkthrough_areas add column if not exists sinks_count int;
-- Part 2 per-area answers (offices/desks/glass, restrooms, kitchen,
-- floors, trash question groups).
alter table walkthrough_areas add column if not exists details jsonb not null default '{}'::jsonb;

-- ---------- Section 3: walkthrough_photos table ----------

create table if not exists walkthrough_photos (
  id uuid default gen_random_uuid() primary key,
  walkthrough_id uuid references walkthroughs(id) on delete cascade,
  photo_url text not null,
  caption text,
  created_at timestamptz default now()
);

grant select, insert, update, delete on public.walkthrough_photos to authenticated;
grant all on public.walkthrough_photos to service_role;

alter table walkthrough_photos enable row level security;

drop policy if exists "walkthrough_photos owner/admin only" on walkthrough_photos;
create policy "walkthrough_photos owner/admin only"
  on walkthrough_photos for select
  using (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_photos.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "walkthrough_photos insert if owner/admin" on walkthrough_photos;
create policy "walkthrough_photos insert if owner/admin"
  on walkthrough_photos for insert
  with check (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_photos.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "walkthrough_photos update if owner/admin" on walkthrough_photos;
create policy "walkthrough_photos update if owner/admin"
  on walkthrough_photos for update
  using (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_photos.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "walkthrough_photos delete if owner/admin" on walkthrough_photos;
create policy "walkthrough_photos delete if owner/admin"
  on walkthrough_photos for delete
  using (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_photos.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ---------- Section 4: private storage bucket + file policies ----------
-- Photo files live at {company_id}/{walkthrough_id}/{filename} in the
-- private "walkthrough-photos" bucket, mirroring the inspection-photos
-- setup (024). Read/write stay owner/admin because a walkthrough is
-- bid strategy; Pro tier matches the walkthroughs feature gate.

insert into storage.buckets (id, name, public)
values ('walkthrough-photos', 'walkthrough-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "walkthrough-photos read if owner/admin" on storage.objects;
create policy "walkthrough-photos read if owner/admin"
  on storage.objects for select
  using (
    bucket_id = 'walkthrough-photos'
    and public.is_company_owner_admin(((string_to_array(name, '/'))[1])::uuid)
    and public.company_tier_meets(((string_to_array(name, '/'))[1])::uuid, 'pro')
  );

drop policy if exists "walkthrough-photos upload if owner/admin" on storage.objects;
create policy "walkthrough-photos upload if owner/admin"
  on storage.objects for insert
  with check (
    bucket_id = 'walkthrough-photos'
    and public.is_company_owner_admin(((string_to_array(name, '/'))[1])::uuid)
    and public.company_tier_meets(((string_to_array(name, '/'))[1])::uuid, 'pro')
  );

drop policy if exists "walkthrough-photos delete if owner/admin" on storage.objects;
create policy "walkthrough-photos delete if owner/admin"
  on storage.objects for delete
  using (
    bucket_id = 'walkthrough-photos'
    and public.is_company_owner_admin(((string_to_array(name, '/'))[1])::uuid)
    and public.company_tier_meets(((string_to_array(name, '/'))[1])::uuid, 'pro')
  );
