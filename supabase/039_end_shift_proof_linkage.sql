-- 039: End-of-shift proof linkage (MediaRecorder repair)
-- Links shift videos + comm book entries to their time entry so proof is one
-- end-of-shift transaction. Adds two-phase clock-out support (upload_pending)
-- and per-company proof requirements.

-- 1. Two-phase clock-out flag on time entries
alter table public.time_entries
  add column if not exists upload_pending boolean not null default false;

-- 2. Link shift videos to their time entry
alter table public.shift_videos
  add column if not exists time_entry_id uuid references public.time_entries(id) on delete cascade;

create index if not exists shift_videos_time_entry_id_idx
  on public.shift_videos(time_entry_id);

-- 3. Link comm book entries to their time entry
alter table public.comm_book
  add column if not exists time_entry_id uuid references public.time_entries(id) on delete cascade;

create index if not exists comm_book_time_entry_id_idx
  on public.comm_book(time_entry_id);

-- 4. Per-company end-of-shift proof requirements (both default OFF = optional)
alter table public.companies
  add column if not exists require_walkthrough_video boolean not null default false,
  add column if not exists require_book_photo boolean not null default false;

-- 5. Explicit grants (Supabase 2026-10-30 rule: new tables need explicit grants;
--    these are ALTERs on existing tables, but keep the pattern explicit)
grant select, insert, update, delete on public.time_entries to authenticated;
grant all on public.time_entries to service_role;
grant select, insert, update, delete on public.shift_videos to authenticated;
grant all on public.shift_videos to service_role;
grant select, insert, update, delete on public.comm_book to authenticated;
grant all on public.comm_book to service_role;
