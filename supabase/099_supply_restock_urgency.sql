-- 099: Urgency level on supply restock requests
-- (Wendy, WorkTeams page-by-page walkthrough, 2026-11-19, item #33).
--
-- Three levels, in Wendy's words:
--   urgent      = they're OUT — need it ASAP; someone gets it there
--                 that evening.
--   running_low = needed within the next couple of days.
--   low         = at least a week of runway left.
--
-- Existing requests default to 'low' so no old request suddenly
-- reads as an emergency. The Inventory page's Restock requests form
-- sends the level with each new request and shows it on the list,
-- urgent first.
--
-- Additive only. public.supply_restock_requests already carries
-- table-level grants and RLS policies (migration 078); the new
-- column is covered by them.

begin;

alter table public.supply_restock_requests
  add column if not exists urgency text not null default 'low';

alter table public.supply_restock_requests
  drop constraint if exists supply_restock_requests_urgency_check;

alter table public.supply_restock_requests
  add constraint supply_restock_requests_urgency_check
  check (urgency in ('urgent', 'running_low', 'low'));

commit;
