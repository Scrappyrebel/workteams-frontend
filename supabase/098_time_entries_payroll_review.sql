-- 098: Payroll review flag for abnormal time entries
-- (Sebastian audit §2, 2026-11-15).
--
-- A completed time entry longer than 16 hours is held out of the
-- WorkTeams payroll report's totals as NEEDS REVIEW until a
-- manager corrects the entry or marks it reviewed. This column
-- records the review. It changes nothing about the entry's own
-- times, and existing rows default to false (not reviewed).
--
-- Additive only. public.time_entries already carries table-level
-- grants and RLS policies; the new column is covered by them.

begin;

alter table public.time_entries
  add column if not exists payroll_reviewed boolean not null default false;

commit;
