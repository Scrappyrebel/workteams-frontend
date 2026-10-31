-- 083: Money by Location — period rollup + drill-through detail.
--
-- Migration 077 gave the Money by Location page ONE all-time rollup
-- (workteams_location_money_rollup). The page could not answer the
-- questions a multi-location business asks every month: what did each
-- location bill THIS period, and which invoices and bids sit behind a
-- figure? This file adds TWO read-only security-definer functions and
-- nothing else: no new tables, no writes, no change to 077 — the
-- all-time function and every figure it returns stay exactly as they
-- are, and the page keeps reading all-time figures through it.
--
-- Period semantics (the page states this basis on screen, and the
-- export repeats it):
--   A period figure is the money on the records that STARTED in the
--   period, per location:
--     Estimated   Accepted bids CREATED in the period, valued exactly
--                 as 077 / Profitability value them (pricing-mode
--                 aware, file 004). Bids carry no "accepted on" date —
--                 created_at is the only date a bid has — so the
--                 period line for estimates is the bid's creation
--                 date, in the company's own timezone (041).
--     Invoiced    Sum of invoices.total for issued invoices (status
--                 'issued' or 'paid', file 061) whose issue_date
--                 falls in the period. Drafts are not billed yet;
--                 voided invoices are excluded entirely, as in 077.
--     Paid        Sum of invoices.amount_paid on THOSE SAME invoices.
--                 amount_paid is derived by trigger from the active
--                 invoice_payments rows (061), so Paid is everything
--                 paid on the period's invoices so far, whenever the
--                 payment arrived. A payment received in the period
--                 on an invoice issued BEFORE the period is therefore
--                 NOT in the period's Paid — it belongs to the
--                 earlier period's cohort and to All time. This is
--                 deliberate: it keeps the identity
--                 Balance due = Invoiced - Paid true on every row of
--                 every period, and a period with no range (null
--                 bounds) returns exactly the 077 figures.
--     Balance due Invoiced - Paid, summed per location from
--                 (total - amount_paid) on the same issued invoices.
--
-- Money with no location rolls into the same ONE "No location" row
-- (location_id null) as 077 — never spread across real locations.
-- Locations with no activity in the period still return, at zero, so
-- a location never silently disappears from the report.
--
-- The detail function returns the individual records behind one
-- location's figures for one period — issued invoices and accepted
-- bids — so every total on the page can be traced to its records.
-- Invoice rows carry total / paid / balance as recorded; bid rows
-- carry their valued amount (paid / balance null — a bid is not a
-- receivable).
--
-- Access: identical posture to 077 — each function re-checks the
-- caller's company role itself (owner/admin) and raises for anyone
-- else; every input row is filtered to p_company_id.
--
-- Run in the Supabase SQL editor (project: WorkTeams). Paste the
-- WHOLE file into ONE query tab and run it ONCE — it is a single
-- BEGIN..COMMIT. Safe to re-run (idempotent). Until it runs, the
-- Money by Location page keeps showing its all-time figures exactly
-- as today; only the period view and the detail lists stay pending.

BEGIN;

create or replace function public.workteams_location_money_rollup_period(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  location_id uuid,
  location_name text,
  accepted_bids bigint,
  estimated numeric,
  issued_invoices bigint,
  invoiced numeric,
  credits numeric,
  paid numeric,
  balance_due numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
declare
  v_tz text;
begin
  if not exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'Owner or admin access required';
  end if;

  select coalesce(c.timezone, 'America/Chicago') into v_tz
  from public.companies c
  where c.id = p_company_id;

  return query
  with bid_amounts as (
    select b.location_id as lid,
      case
        when b.pricing_mode = 'hourly'
          then coalesce(b.hours, 0) * coalesce(b.hourly_rate, 0)
        when b.pricing_mode = 'sqft'
          then coalesce(b.square_footage, 0) * coalesce(b.rate_per_sqft, 0)
        else coalesce(li.items_total, 0)
      end as amount
    from public.bids b
    left join (
      select bi.bid_id, sum(bi.quantity * bi.unit_price) as items_total
      from public.bid_items bi
      group by bi.bid_id
    ) li on li.bid_id = b.id
    where b.company_id = p_company_id
      and b.status = 'accepted'
      and (p_from is null
        or (b.created_at at time zone coalesce(v_tz, 'America/Chicago'))::date >= p_from)
      and (p_to is null
        or (b.created_at at time zone coalesce(v_tz, 'America/Chicago'))::date <= p_to)
  ),
  est as (
    select ba.lid,
      count(*)::bigint as bid_count,
      round(sum(ba.amount), 2) as estimated_total
    from bid_amounts ba
    group by ba.lid
  ),
  inv as (
    select i.location_id as lid,
      count(*)::bigint as invoice_count,
      round(sum(i.total), 2) as invoiced_total,
      round(sum(i.amount_paid), 2) as paid_total,
      round(sum(i.total - i.amount_paid), 2) as balance_total
    from public.invoices i
    where i.company_id = p_company_id
      and i.status in ('issued', 'paid')
      and (p_from is null or i.issue_date >= p_from)
      and (p_to is null or i.issue_date <= p_to)
    group by i.location_id
  ),
  keys as (
    select l.id as lid
    from public.locations l
    where l.company_id = p_company_id
    union
    select e.lid from est e
    union
    select v.lid from inv v
  )
  select
    k.lid,
    (select l.name from public.locations l where l.id = k.lid),
    coalesce(e.bid_count, 0),
    coalesce(e.estimated_total, 0),
    coalesce(v.invoice_count, 0),
    coalesce(v.invoiced_total, 0),
    0::numeric,
    coalesce(v.paid_total, 0),
    coalesce(v.balance_total, 0)
  from keys k
  left join est e on e.lid is not distinct from k.lid
  left join inv v on v.lid is not distinct from k.lid
  order by (k.lid is null),
    (select l.name from public.locations l where l.id = k.lid);
end $f$;
revoke all on function public.workteams_location_money_rollup_period(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.workteams_location_money_rollup_period(uuid, date, date)
  to authenticated;

comment on function public.workteams_location_money_rollup_period(uuid, date, date) is
 'Per-location money rollup for one period (migration 083): same definitions as the 077 all-time rollup, cohort-filtered — accepted bids created in the period (company timezone), issued invoices with issue_date in the period; Paid is the ledger-derived amount_paid on those same invoices, so Balance due = Invoiced - Paid holds per row. Null bounds = all time, returning exactly the 077 figures. Owner/admin only, enforced inside the function.';

create or replace function public.workteams_location_money_detail(
  p_company_id uuid,
  p_location_id uuid,
  p_unallocated boolean,
  p_from date,
  p_to date
)
returns table (
  kind text,
  record_id uuid,
  label text,
  detail text,
  record_date date,
  status text,
  total numeric,
  paid numeric,
  balance_due numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
declare
  v_tz text;
begin
  if not exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'Owner or admin access required';
  end if;

  if not coalesce(p_unallocated, false) and p_location_id is null then
    raise exception 'A location is required';
  end if;

  select coalesce(c.timezone, 'America/Chicago') into v_tz
  from public.companies c
  where c.id = p_company_id;

  return query
  select
    'invoice'::text,
    i.id,
    'Invoice #' || i.invoice_number::text,
    i.client_name,
    i.issue_date,
    i.status,
    round(i.total, 2),
    round(i.amount_paid, 2),
    round(i.total - i.amount_paid, 2)
  from public.invoices i
  where i.company_id = p_company_id
    and i.status in ('issued', 'paid')
    and (p_from is null or i.issue_date >= p_from)
    and (p_to is null or i.issue_date <= p_to)
    and (
      (coalesce(p_unallocated, false) and i.location_id is null)
      or (not coalesce(p_unallocated, false) and i.location_id = p_location_id)
    )
  union all
  select
    'bid'::text,
    b.id,
    b.title,
    b.client_name,
    (b.created_at at time zone coalesce(v_tz, 'America/Chicago'))::date,
    b.status,
    round(
      case
        when b.pricing_mode = 'hourly'
          then coalesce(b.hours, 0) * coalesce(b.hourly_rate, 0)
        when b.pricing_mode = 'sqft'
          then coalesce(b.square_footage, 0) * coalesce(b.rate_per_sqft, 0)
        else coalesce(li.items_total, 0)
      end, 2),
    null::numeric,
    null::numeric
  from public.bids b
  left join (
    select bi.bid_id, sum(bi.quantity * bi.unit_price) as items_total
    from public.bid_items bi
    group by bi.bid_id
  ) li on li.bid_id = b.id
  where b.company_id = p_company_id
    and b.status = 'accepted'
    and (p_from is null
      or (b.created_at at time zone coalesce(v_tz, 'America/Chicago'))::date >= p_from)
    and (p_to is null
      or (b.created_at at time zone coalesce(v_tz, 'America/Chicago'))::date <= p_to)
    and (
      (coalesce(p_unallocated, false) and b.location_id is null)
      or (not coalesce(p_unallocated, false) and b.location_id = p_location_id)
    )
  order by 5 desc, 1, 3;
end $f$;
revoke all on function public.workteams_location_money_detail(uuid, uuid, boolean, date, date)
  from public, anon, authenticated;
grant execute on function public.workteams_location_money_detail(uuid, uuid, boolean, date, date)
  to authenticated;

comment on function public.workteams_location_money_detail(uuid, uuid, boolean, date, date) is
 'Drill-through for Money by Location (migration 083): the individual issued invoices and accepted bids behind one location''s rollup figures for one period, same cohort definitions as workteams_location_money_rollup_period. p_unallocated = true selects the location_id-null "No location" bucket. Owner/admin only, enforced inside the function.';

COMMIT;
