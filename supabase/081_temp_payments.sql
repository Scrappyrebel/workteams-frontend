-- 081: Temp pay — record what temps were actually PAID (payment ledger).
--
-- Page 4 scrutiny fix (professional audit, Wave 1 item 4).
--
-- Before this migration, the temp module computed what each temp is OWED
-- (lib/temp-pay-owed.js: assignment rate x client-confirmed hours, on
-- accepted assignments of completed jobs) but had NO payment state
-- anywhere: no table, no column, no mark-as-paid. An amount once "owed"
-- stayed in "Total owed" forever, and the record of who was paid what,
-- when, and how existed only outside the app.
--
-- The house pattern already exists in 061 (invoicing): payments are
-- immutable per-payment rows in a ledger. A payment is never edited or
-- deleted — a mistake is voided with a recorded reason and a corrected
-- payment is recorded. Temp pay gets the same treatment, in the temp
-- module's own conventions (integer cents end-to-end, is_company_manager
-- RLS like the other temp tables):
--
-- * temp_payments: one row per payout against ONE assignment — the temp,
--   the amount (integer cents, snapshotted as a recorded fact at payment
--   time), the date, method/reference/note, and who recorded it.
-- * workteams_guard_temp_payment() polices the ledger: no deletes; a new
--   payment must be against an assignment that is payable by the same
--   recorded facts the pay-owed report uses (accepted/completed +
--   job completed + client-confirmed hours + a recorded rate), must
--   name the assignment's own temp, and must not push the active total
--   past the amount owed on that assignment; an update may ONLY void a
--   payment, carrying the current manager and a reason (10-500 chars).
--
-- Paid/outstanding is derived from these rows by the report (the same
-- rows a manager sees), never stored back onto the assignment — so a
-- later rate or hours correction changes what is owed, never what the
-- ledger says was paid.

BEGIN;

-- ============ 1. Temp payments ledger ============
create table if not exists public.temp_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assignment_id uuid not null references public.temp_assignments(id) on delete restrict,
  member_id uuid not null,
  amount_cents int not null check (amount_cents > 0 and amount_cents <= 99999999),
  payment_date date not null default current_date,
  method text not null default ''
    check (method in ('', 'Cash', 'Card', 'Check', 'Bank transfer', 'Other')),
  reference text not null default '' check (length(reference) <= 120),
  note text not null default '' check (length(note) <= 500),
  recorded_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists temp_payments_assignment_idx
  on public.temp_payments(company_id, assignment_id, payment_date desc);
create index if not exists temp_payments_active_idx
  on public.temp_payments(company_id, assignment_id) where voided_at is null;
create index if not exists temp_payments_member_idx
  on public.temp_payments(company_id, member_id, payment_date desc);
alter table public.temp_payments enable row level security;
grant select, insert, update, delete on public.temp_payments to authenticated;
grant all on public.temp_payments to service_role;

-- Managers of the company (the temp module's own RLS shape, 043/046).
-- No DELETE policy: payments are never deleted, and the guard trigger
-- below rejects deletes even where a grant would allow them.
drop policy if exists "temp payments manager read" on public.temp_payments;
create policy "temp payments manager read" on public.temp_payments
  for select to authenticated
  using (public.is_company_manager(temp_payments.company_id));
drop policy if exists "temp payments manager insert" on public.temp_payments;
create policy "temp payments manager insert" on public.temp_payments
  for insert to authenticated
  with check (public.is_company_manager(temp_payments.company_id));
drop policy if exists "temp payments manager update" on public.temp_payments;
create policy "temp payments manager update" on public.temp_payments
  for update to authenticated
  using (public.is_company_manager(temp_payments.company_id))
  with check (public.is_company_manager(temp_payments.company_id));

comment on table public.temp_payments is
 'Per-payment ledger for temp pay (migration 081). One row per payout against one temp assignment; amount_cents is the recorded fact of what was paid. Paid/outstanding on the Temp pay owed report is derived from the active (non-voided) rows here. A payment is never edited or deleted — void it with a recorded reason and record a corrected payment. Recording a payment here never moves money; it records pay already made outside the app.';

-- ============ 2. Payment guard: immutable originals, void-with-reason only ============
create or replace function public.workteams_guard_temp_payment()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $f$
declare
  asg public.temp_assignments%rowtype;
  jr public.temp_job_requests%rowtype;
  cfg_rate numeric;
  rate_cents numeric;
  owed numeric;
  active numeric;
begin
  if tg_op = 'DELETE' then
    raise exception 'Temp payments cannot be deleted. Void with a recorded reason.';
  end if;

  if tg_op = 'INSERT' then
    if new.voided_at is not null or new.voided_by is not null or
       new.void_reason is not null then
      raise exception 'New temp payments must not be voided';
    end if;
    if new.amount_cents is null or new.amount_cents <= 0 then
      raise exception 'Enter a positive payment amount';
    end if;

    -- The assignment row lock serializes simultaneous payments against
    -- this assignment, so the active-sum check below cannot race.
    select * into asg from public.temp_assignments
      where id = new.assignment_id for update;
    if not found then raise exception 'Assignment not found'; end if;
    select * into jr from public.temp_job_requests
      where id = asg.job_request_id;
    if not found or jr.company_id is distinct from new.company_id then
      raise exception 'Assignment does not belong to this company';
    end if;
    if new.member_id is distinct from asg.member_id then
      raise exception 'Payment must name the temp on the assignment';
    end if;

    -- Payable by the same recorded facts the pay-owed report uses:
    -- accepted/completed assignment, completed job, client-confirmed
    -- hours. Requested hours are never pay.
    if asg.status not in ('accepted', 'completed') then
      raise exception 'Payments can only be recorded once the temp has accepted the assignment';
    end if;
    if jr.status <> 'completed' then
      raise exception 'Payments can only be recorded once the job is marked completed';
    end if;
    if jr.hours_confirmed is null then
      raise exception 'Payments can only be recorded once the client has confirmed the hours';
    end if;

    -- Owed = the assignment's recorded rate (the agency default when the
    -- assignment has none) x the client-confirmed hours, integer cents —
    -- the same math as lib/temp-pay-owed.js.
    select temp_hourly_pay into cfg_rate from public.temp_agency_config
      where company_id = new.company_id;
    rate_cents := coalesce(asg.pay_rate_cents::numeric,
                           case when cfg_rate is null then null
                                else round(cfg_rate * 100) end);
    if rate_cents is null then
      raise exception 'No pay rate is recorded for this assignment';
    end if;
    owed := round(rate_cents * round(jr.hours_confirmed * 100) / 100);

    select coalesce(sum(amount_cents), 0) into active from public.temp_payments
      where company_id = new.company_id and assignment_id = new.assignment_id
        and voided_at is null;
    if active + new.amount_cents > owed then
      raise exception 'Payment exceeds the amount still owed on this assignment';
    end if;
    return new;
  end if;

  -- UPDATE path: the only permitted change is a void, carrying its record.
  if old.voided_at is not null then
    raise exception 'Voided temp payments cannot be changed';
  end if;
  if (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason' - 'updated_at') then
    raise exception 'Original payment details cannot be edited; void and re-record';
  end if;
  if new.voided_at is null or new.voided_by is distinct from (select auth.uid())
     or length(btrim(coalesce(new.void_reason, ''))) < 10
     or length(coalesce(new.void_reason, '')) > 500
     or new.voided_at < now() - interval '5 minutes'
     or new.voided_at > now() + interval '5 minutes' then
    raise exception 'A void requires its current manager and a reason (10-500 characters)';
  end if;
  return new;
end $f$;
revoke all on function public.workteams_guard_temp_payment() from public, anon, authenticated;
drop trigger if exists workteams_guard_temp_payment_trigger on public.temp_payments;
create trigger workteams_guard_temp_payment_trigger
  before insert or update or delete on public.temp_payments
  for each row execute function public.workteams_guard_temp_payment();

COMMIT;
