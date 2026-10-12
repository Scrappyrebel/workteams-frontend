-- 045: department assignment for access control.
-- Null/empty = all departments (default for owners/managers).
-- Otherwise a list of allowed department keys:
--   hr, sales, service, accounting, field
-- Used to gate department content (e.g. playbook sections) so cleaners
-- never see HR material and HR staff see only their areas.
-- Owners always see everything regardless of this column.

alter table public.company_members
  add column if not exists departments text[] null default null;
