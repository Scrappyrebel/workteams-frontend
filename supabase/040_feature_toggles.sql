-- Per-company toggles for Shift Videos and Comm Book features.
-- When disabled, the tabs hide and the end-shift sections are skipped.
-- Run in Supabase SQL editor.

alter table public.companies
  add column if not exists enable_shift_videos boolean not null default true,
  add column if not exists enable_comm_book boolean not null default true;
