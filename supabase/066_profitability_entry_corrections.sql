-- 066: Profitability manual entries — corrections, voids, audit trail.
--
-- The Profitability page's manual money (revenue_entries / expense_entries,
-- file 003) was insert-only in the product: the page never listed entries,
-- offered no edit or void, and the tables carried no actor column and no
-- change record — a mistyped amount was permanent in-product and invisible
-- in history, even though RLS has permitted owner/admin update/delete since
-- file 003 (re-created in 024). This file gives the two tables the same
-- correction story the rest of the app's money already has (invoices in
-- 061, and the sister Workforce app's expense audit trail in its file 231):
--
-- * created_by / updated_at / updated_by actor columns. New page inserts
--   stamp created_by; the history capture below records the actor for
--   every change regardless of which client wrote it.
-- * Void-with-reason instead of delete. A voided entry keeps its row,
--   stops counting in Profitability totals (the page filters voided rows),
--   and carries voided_at / voided_by / void_reason. A database guard
--   rejects hard deletes, edits to voided rows, and voids that try to
--   change the original entry or lack a 10-500 character reason.
-- * An append-only history table (profitability_entry_history) capturing
--   full before/after state for every insert, update, and void on both
--   tables. Written only by the capture trigger; owner/admin read.
--
-- These entries have no exported or paid state anywhere in the product —
-- nothing consumes them outside the Profitability page — so the only
-- locked state after this file is "voided". Amount rules match the
-- invoice path (at most two decimals, 0..999999999.99); on UPDATE the
-- amount rule applies only when the amount itself changes, so a legacy
-- row entered before this rule can still be corrected for date,
-- description, or location.
--
-- Nothing here touches the time clock, shift videos, Communication Book
-- photos, or recorded clock times.
--
-- Run in the Supabase SQL editor (project: WorkTeams). Paste the WHOLE
-- file into ONE query and run it ONCE -- it is a single BEGIN..COMMIT.
-- Safe to re-run (idempotent).

BEGIN;

-- ============ 1. Actor + void columns on both entry tables ============
alter table public.revenue_entries
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists void_reason text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.expense_entries
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists void_reason text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- ============ 2. Append-only history for both entry tables ============
create table if not exists public.profitability_entry_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entry_kind text not null check (entry_kind in ('revenue', 'expense')),
  entry_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  changed_at timestamptz not null default now(),
  changed_by uuid,
  before_state jsonb,
  after_state jsonb
);
create index if not exists profitability_entry_history_company_time
  on public.profitability_entry_history(company_id, changed_at desc);
create index if not exists profitability_entry_history_entry_idx
  on public.profitability_entry_history(company_id, entry_kind, entry_id, changed_at desc);
alter table public.profitability_entry_history enable row level security;
grant select on public.profitability_entry_history to authenticated;
grant all on public.profitability_entry_history to service_role;
revoke insert, update, delete on public.profitability_entry_history from authenticated, anon;

drop policy if exists "profitability entry history owner/admin read" on public.profitability_entry_history;
create policy "profitability entry history owner/admin read"
  on public.profitability_entry_history for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = profitability_entry_history.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(profitability_entry_history.company_id, 'pro')
  );

comment on table public.profitability_entry_history is
  'Append-only audit trail for manual profitability entries (revenue_entries / expense_entries, migration 066): every insert, update and void is captured with full before/after state by trigger. Written only by the capture trigger; owners/admins read. A voided entry remains visible here with its reason.';

-- ============ 3. Guard: no deletes, corrections by edit, removal by void ============
create or replace function public.workteams_guard_profitability_entry()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'Profitability entries cannot be deleted. Void with a recorded reason.';
  end if;
  if tg_op = 'INSERT' then
    if new.voided_at is not null or new.voided_by is not null or new.void_reason is not null then
      raise exception 'New entries must not be voided';
    end if;
    if new.amount is null or new.amount < 0 or new.amount > 999999999.99
       or new.amount <> round(new.amount, 2) then
      raise exception 'Enter an amount with at most two decimals';
    end if;
    return new;
  end if;
  -- UPDATE
  if old.voided_at is not null then
    raise exception 'Voided entries cannot be changed';
  end if;
  if new.voided_at is not null then
    if (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason' - 'updated_at' - 'updated_by')
       is distinct from
       (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason' - 'updated_at' - 'updated_by') then
      raise exception 'A void cannot change the original entry; void and re-record';
    end if;
    if new.voided_by is distinct from (select auth.uid())
       or length(btrim(coalesce(new.void_reason, ''))) < 10
       or length(coalesce(new.void_reason, '')) > 500
       or new.voided_at < now() - interval '5 minutes'
       or new.voided_at > now() + interval '5 minutes' then
      raise exception 'A void requires the current user and a reason (10-500 characters)';
    end if;
    return new;
  end if;
  if new.voided_by is not null or new.void_reason is not null then
    raise exception 'Entry void fields cannot be set outside a void';
  end if;
  if new.amount is distinct from old.amount
     and (new.amount is null or new.amount < 0 or new.amount > 999999999.99
          or new.amount <> round(new.amount, 2)) then
    raise exception 'Enter an amount with at most two decimals';
  end if;
  return new;
end $f$;
revoke all on function public.workteams_guard_profitability_entry() from public, anon, authenticated;

drop trigger if exists workteams_guard_revenue_entry on public.revenue_entries;
create trigger workteams_guard_revenue_entry
  before insert or update or delete on public.revenue_entries
  for each row execute function public.workteams_guard_profitability_entry();

drop trigger if exists workteams_guard_expense_entry on public.expense_entries;
create trigger workteams_guard_expense_entry
  before insert or update or delete on public.expense_entries
  for each row execute function public.workteams_guard_profitability_entry();

-- ============ 4. History capture (both tables, one function) ============
create or replace function public.workteams_capture_profitability_entry_history()
returns trigger language plpgsql security definer set search_path = ''
as $f$
begin
  insert into public.profitability_entry_history
    (company_id, entry_kind, entry_id, operation, changed_by, before_state, after_state)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    case when tg_table_name = 'revenue_entries' then 'revenue' else 'expense' end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    (select auth.uid()),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end $f$;
revoke all on function public.workteams_capture_profitability_entry_history() from public, anon, authenticated;

drop trigger if exists workteams_revenue_entry_history_capture on public.revenue_entries;
create trigger workteams_revenue_entry_history_capture
  after insert or update or delete on public.revenue_entries
  for each row execute function public.workteams_capture_profitability_entry_history();

drop trigger if exists workteams_expense_entry_history_capture on public.expense_entries;
create trigger workteams_expense_entry_history_capture
  after insert or update or delete on public.expense_entries
  for each row execute function public.workteams_capture_profitability_entry_history();

COMMIT;
