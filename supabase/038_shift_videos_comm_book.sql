-- 038: Shift videos (walkthrough videos) + Communication book
-- Run in Supabase SQL editor.

-- ============ shift_videos table ============
create table if not exists public.shift_videos (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  video_url text not null,
  thumbnail_url text,
  duration_seconds integer,
  file_size_bytes bigint,
  notes text,
  keep_video boolean not null default false,
  video_expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz default now()
);

alter table public.shift_videos enable row level security;

-- Company members can view videos in their company.
create policy "shift_videos select if member"
  on public.shift_videos for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = shift_videos.company_id
      and m.user_id = auth.uid()
    )
  );

-- Any member can upload (insert) their own video.
create policy "shift_videos insert if member"
  on public.shift_videos for insert
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = shift_videos.company_id
      and m.user_id = auth.uid()
      and m.id = shift_videos.member_id
    )
  );

-- Managers can mark keep_video (update); members can update their own notes.
create policy "shift_videos update if manager or owner"
  on public.shift_videos for update
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = shift_videos.company_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
    )
  );

-- Managers can delete.
create policy "shift_videos delete if manager"
  on public.shift_videos for delete
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = shift_videos.company_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
    )
  );

grant select, insert, update, delete on public.shift_videos to authenticated;
grant all on public.shift_videos to service_role;

-- ============ comm_book table ============
create table if not exists public.comm_book (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  category text not null default 'note',
  message text not null,
  photo_url text,
  response text,
  responded_by uuid references public.company_members(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz default now()
);

alter table public.comm_book enable row level security;

create policy "comm_book select if member"
  on public.comm_book for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = comm_book.company_id
      and m.user_id = auth.uid()
    )
  );

create policy "comm_book insert if member"
  on public.comm_book for insert
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = comm_book.company_id
      and m.user_id = auth.uid()
      and m.id = comm_book.member_id
    )
  );

-- Managers can respond (update); members can edit their own entries.
create policy "comm_book update if manager or own"
  on public.comm_book for update
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = comm_book.company_id
      and m.user_id = auth.uid()
      and (
        m.role in ('owner', 'admin')
        or m.id = comm_book.member_id
      )
    )
  );

create policy "comm_book delete if manager"
  on public.comm_book for delete
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = comm_book.company_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
    )
  );

grant select, insert, update, delete on public.comm_book to authenticated;
grant all on public.comm_book to service_role;

-- ============ Storage bucket for shift videos ============
insert into storage.buckets (id, name, public)
values ('shift-videos', 'shift-videos', false)
on conflict (id) do nothing;

-- Managers/owners can read; members can upload.
create policy "shift-videos read if member"
  on storage.objects for select
  using (
    bucket_id = 'shift-videos'
    and exists (
      select 1 from public.company_members m
      join public.shift_videos v on v.company_id = m.company_id
      where m.user_id = auth.uid()
      and (storage.foldername(objects.name))[1] = m.company_id::text
    )
  );

create policy "shift-videos upload if member"
  on storage.objects for insert
  with check (
    bucket_id = 'shift-videos'
    and exists (
      select 1 from public.company_members m
      where m.user_id = auth.uid()
      and (storage.foldername(objects.name))[1] = m.company_id::text
    )
  );

create policy "shift-videos delete if manager"
  on storage.objects for delete
  using (
    bucket_id = 'shift-videos'
    and exists (
      select 1 from public.company_members m
      where m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
      and (storage.foldername(objects.name))[1] = m.company_id::text
    )
  );
