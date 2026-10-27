-- 077: Per-location money rollup (accounts receivable by location).
--
-- WorkTeams could already answer money questions in pieces: the
-- Profitability page totals accepted bids + manual revenue entries per
-- location, and the Invoices page lists what each invoice is owed. What
-- was missing is the single billing view per location -- estimated /
-- invoiced / credited / paid / balance due in one row per location --
-- the same shape the sister Workforce app's Job Cost Rollup (its file
-- 262) gives per client. In WorkTeams, locations ARE the clients.
--
-- This file adds ONE read-only security-definer function and nothing
-- else: no new tables, no writes to or behavior changes in any existing
-- table. The Money by Location page reads only through it.
--
-- Where every number comes from (the page labels this basis on screen):
--   Estimated   Accepted bids for the location, valued exactly the way
--               the Profitability page values them (pricing-mode aware,
--               file 004): 'line_items' bids sum their bid_items
--               (quantity x unit_price); 'hourly' bids are
--               hours x hourly_rate; 'sqft' bids are
--               square_footage x rate_per_sqft. Sent/draft/declined bids
--               are not counted -- accepted is the agreed figure, the
--               same line Profitability draws.
--   Invoiced    Sum of invoices.total for ISSUED invoices (status
--               'issued' or 'paid', file 061). Drafts are not billed
--               yet; voided invoices are excluded entirely -- voiding
--               removes an invoice from receivables, it does not credit
--               it against other invoices.
--   Credits     WorkTeams has NO credit-note mechanism. An issued
--               invoice is corrected by void-with-reason + re-issue
--               (061), and a mistaken payment is voided with a reason
--               (which simply stops counting in Paid). So this column
--               is 0 for every location today; it exists so the balance
--               identity below reads exactly as it does in the sister
--               app, and so a future credit feature has its column
--               already defined. Nothing is invented to fill it.
--   Paid        Sum of invoices.amount_paid on issued invoices. That
--               column is derived by trigger from the active
--               (non-voided) invoice_payments rows (061), so this IS
--               the payment ledger speaking, not a second copy of it.
--   Balance due Invoiced - Credits - Paid, summed per location from
--               (total - amount_paid) on the same issued invoices, so
--               the identity holds per row and in the page total.
--
-- Money with no location -- an invoice billed to a typed-in client
-- name, a bid saved without a location, or money whose location was
-- deleted afterwards (061/003 set location_id null) -- rolls into ONE
-- "No location" row (location_id null), the same honest bucket the
-- Profitability page uses for unallocated money (its "No location"
-- row). It is never spread across real locations, and the page total
-- includes it, so the total reconciles with the rows above it.
--
-- Access: money is owner/admin material in WorkTeams (the 061 RLS
-- posture). The function re-checks the caller's company role itself
-- and raises for anyone else, so the gate holds even if a page is
-- bypassed. Owners/admins of OTHER companies get nothing: every input
-- row is filtered to p_company_id and the role check is against that
-- same company.
--
-- Run in the Supabase SQL editor (project: WorkTeams). Paste the WHOLE
-- file into ONE query and run it ONCE -- it is a single BEGIN..COMMIT.
-- Safe to re-run (idempotent). Until it runs, the Money by Location
-- page shows a calm setup-pending state and nothing else changes.

BEGIN;

create or replace function public.workteams_location_money_rollup(p_company_id uuid)
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
begin
  if not exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'Owner or admin access required';
  end if;

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
revoke all on function public.workteams_location_money_rollup(uuid)
  from public, anon, authenticated;
grant execute on function public.workteams_location_money_rollup(uuid)
  to authenticated;

comment on function public.workteams_location_money_rollup(uuid) is
 'Per-location money rollup (migration 077): estimated (accepted bids, pricing-mode aware, as Profitability values them), invoiced (issued invoices only), credits (always 0 -- WorkTeams has no credit notes; corrections are void + re-issue), paid (ledger-derived amount_paid), balance due. Owner/admin only, enforced inside the function. Money with no location returns as one location_id-null row.';

COMMIT;
