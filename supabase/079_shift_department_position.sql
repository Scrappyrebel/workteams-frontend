-- 079_shift_department_position.sql
-- Scheduling fix: a shift has always recorded WHO works, WHERE and WHEN,
-- but never WHAT JOB the shift is for. Department views had to guess from
-- the person's current departments, and payroll could not price the
-- different kinds of work one person does (the same person cleaning one
-- day and covering Customer Service the next).
--
-- This adds two nullable columns to shifts:
--   department    — the "Working as" choice made when the shift was
--                   scheduled: one of the company's department labels
--                   (045 keys, shown by label: HR, Sales, Customer
--                   Service, Accounting, Field Ops, Compliance) or the
--                   plain default "Cleaning / Field Work".
--   position_name — reserved for a future per-person position label.
--                   WorkTeams members carry departments (045), not named
--                   positions, so the app leaves this null for now.
--
-- Both stay null on every existing row: nothing is backfilled and no
-- behavior changes for shifts scheduled before this runs. Client code
-- probes for the columns and falls back gracefully (the schedule page
-- retries its insert without them), so the app keeps working unchanged
-- until this is run.
--
-- shifts keeps its table-wide grants and RLS policies (see 031); the
-- column grants below are stated explicitly anyway — the same
-- discipline 068 used after 024's column-level grants lesson.

alter table public.shifts add column if not exists department text;
alter table public.shifts add column if not exists position_name text;

grant select (department, position_name),
      insert (department, position_name),
      update (department, position_name)
  on public.shifts to authenticated;
