-- ============ 028: dual pay rates (cleaner / manager hats) ============
-- A manager who also cleans gets two rates: one for cleaning hours, one for
-- managing hours. They pick their hat at clock-in; each time entry snapshots
-- the hat and the rate so payroll stays correct even if rates change later.

alter table public.member_pay add column if not exists cleaner_hourly_rate numeric;
alter table public.member_pay add column if not exists manager_hourly_rate numeric;
alter table public.member_pay add column if not exists cleaner_title text;
alter table public.member_pay add column if not exists manager_title text;

-- Backfill: everyone's current rate becomes their base (cleaner) rate.
update public.member_pay
set cleaner_hourly_rate = hourly_rate
where cleaner_hourly_rate is null and hourly_rate is not null;

alter table public.time_entries add column if not exists clock_in_role text;
alter table public.time_entries add column if not exists pay_rate_applied numeric;
