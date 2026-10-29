-- ============ 080: contracts that left draft are records — cancel with a reason, never delete ============
-- Page 3 scrutiny fix (professional audit, Wave 1 item 3).
--
-- Before this migration, any owner/admin could hard-delete ANY contract
-- from the contracts list behind one generic confirm() — including a
-- signed agreement. The delete took the terms text, the client's signed
-- name/date/IP, the drawn signature image, and every amendment with it
-- (contract_amendments.contract_id is on delete cascade), and left no
-- trace that the record ever existed.
--
-- The house pattern already exists in 061 (invoicing): a committed record
-- is never edited or deleted — it is voided with a recorded reason, and
-- trigger guards enforce that at the database, not just in the UI.
-- Contracts get the same treatment, in the status vocabulary the table
-- already carries: 'cancelled' has been in the status check since 026
-- created the table, but nothing could ever set it. Now something can.
--
-- * cancelled_at / cancelled_by / cancel_reason record who ended the
--   contract, when, and why (reason 10-500 characters, as in 061).
-- * workteams_contract_state() polices the lifecycle: a cancelled
--   contract cannot be changed at all; the only way into 'cancelled'
--   carries its full record; cancel fields cannot be set otherwise.
-- * workteams_guard_contract_delete(): only drafts can be deleted.
--   A sent or signed contract is cancelled with a reason instead.
--   (As with 061's invoice guard, the delete guard also fires on
--   cascade deletes, so a company holding sent/signed contracts cannot
--   be wiped silently either.)
-- Contracts were granted at table level in 026, so the new columns ride
-- the existing grants — no column grants needed.

alter table public.contracts
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancel_reason text;

comment on table public.contracts is
  'Client contracts (migration 026). Lifecycle: draft -> sent -> viewed -> signed, or -> cancelled from sent/viewed/signed with a recorded reason (migration 080). Only drafts can be deleted; a cancelled contract keeps its terms, signature record, and amendments on file and cannot be changed.';

-- ============ Contract state: cancelled is terminal and carries its record ============
create or replace function public.workteams_contract_state()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $f$
begin
  if tg_op = 'INSERT' then
    if new.status = 'cancelled' then
      if new.cancelled_at is null or new.cancelled_by is distinct from (select auth.uid())
         or length(btrim(coalesce(new.cancel_reason, ''))) < 10
         or length(coalesce(new.cancel_reason, '')) > 500
         or new.cancelled_at < now() - interval '5 minutes'
         or new.cancelled_at > now() + interval '5 minutes' then
        raise exception 'Cancelling a contract requires its current manager and a reason (10-500 characters)';
      end if;
    elsif new.cancelled_at is not null or new.cancelled_by is not null or new.cancel_reason is not null then
      raise exception 'Contract cancel fields cannot be set outside a cancellation';
    end if;
    return new;
  end if;

  -- UPDATE path.
  if old.status = 'cancelled' then
    raise exception 'Cancelled contracts cannot be changed';
  end if;

  -- Cancel path: the only way into 'cancelled', and it must carry its record.
  if new.status = 'cancelled' then
    if new.cancelled_at is null or new.cancelled_by is distinct from (select auth.uid())
       or length(btrim(coalesce(new.cancel_reason, ''))) < 10
       or length(coalesce(new.cancel_reason, '')) > 500
       or new.cancelled_at < now() - interval '5 minutes'
       or new.cancelled_at > now() + interval '5 minutes' then
      raise exception 'Cancelling a contract requires its current manager and a reason (10-500 characters)';
    end if;
    return new;
  end if;
  if new.cancelled_at is not null or new.cancelled_by is not null or new.cancel_reason is not null then
    raise exception 'Contract cancel fields cannot be set outside a cancellation';
  end if;
  return new;
end $f$;
revoke all on function public.workteams_contract_state() from public, anon, authenticated;
drop trigger if exists workteams_contract_state_trigger on public.contracts;
create trigger workteams_contract_state_trigger
  before insert or update on public.contracts
  for each row execute function public.workteams_contract_state();

-- ============ Contract delete guard: drafts only ============
create or replace function public.workteams_guard_contract_delete()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $f$
begin
  if old.status <> 'draft' then
    raise exception 'Only draft contracts can be deleted. Cancel a sent or signed contract with a recorded reason instead.';
  end if;
  return old;
end $f$;
revoke all on function public.workteams_guard_contract_delete() from public, anon, authenticated;
drop trigger if exists workteams_guard_contract_delete_trigger on public.contracts;
create trigger workteams_guard_contract_delete_trigger
  before delete on public.contracts
  for each row execute function public.workteams_guard_contract_delete();
