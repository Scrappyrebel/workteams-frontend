-- 060: Customer invoicing (accounts receivable) for WorkTeams.
--
-- WorkTeams had NO invoicing anywhere: no invoices, no receivables, no
-- record of what a client owes. This file adds it, following the patterns
-- the rest of the app (and the sister Workforce app) already use:
--
-- * Client concept = locations. A location is the client site (name,
--   client_name, client_phone) and revenue/expense entries already hang
--   off it. An invoice may point at a location and snapshots the client
--   name/contact onto itself, so the invoice stays correct if the
--   location is edited later; one-off clients can be typed in directly.
--   (The temp agency module's separate client table is NOT used: it
--   belongs to that gated module only.)
-- * Money is numeric(12,2) dollars, matching the sister app.
-- * Lifecycle: draft -> issued -> paid, or -> void from any of those.
--   Drafts can be corrected and deleted. Issued invoices cannot be
--   hard-deleted and their content cannot be edited; corrections happen
--   by void-with-reason and re-issue. Voiding requires the voiding
--   manager and a reason of 10-500 characters, and is recorded.
-- * Payments are immutable per-payment rows (invoice_payments). A guard
--   trigger rejects overpayment and any edit that is not a
--   void-with-reason; deletes are rejected outright. The invoice's
--   amount_paid and its issued/paid status are DERIVED from the active
--   (non-voided) payment rows by trigger, never written by the client --
--   the same shape as the Workforce vendor-bill ledger (its files
--   209/210/230), adapted to invoice vocabulary.
-- * Access: invoices are a financial surface. Owner/admin ONLY at the
--   RLS level (the same policy shape as bids and the financial entries
--   in file 003: "Bids contain pricing: owner/admin only. Employees
--   never see them."). Department assignments gate no financial surface
--   in WorkTeams, so no department gate is invented here. No employee,
--   supervisor, or public access to any of these tables.
--
-- Invoice numbers are sequential PER COMPANY, claimed from
-- invoice_counters by a security-definer BEFORE INSERT trigger so two
-- managers creating invoices at the same moment can never collide.
--
-- Run in the Supabase SQL editor (project: WorkTeams). Paste the WHOLE
-- file into ONE query and run it ONCE -- it is a single BEGIN..COMMIT.
-- Safe to re-run (idempotent).

BEGIN;

-- ============ 1. Per-company invoice number counters ============
create table if not exists public.invoice_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  next_number integer not null default 1 check (next_number >= 1)
);
alter table public.invoice_counters enable row level security;
-- No policies on purpose: the counter is reachable only through the
-- security-definer numbering trigger below, never through the API.
grant select, insert, update, delete on public.invoice_counters to authenticated;
grant all on public.invoice_counters to service_role;

comment on table public.invoice_counters is
 'Per-company sequential invoice numbering for migration 060. next_number is the number the NEXT invoice in that company will claim. Written only by workteams_assign_invoice_number().';

-- ============ 2. Invoices ============
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_number integer not null,
  location_id uuid references public.locations(id) on delete set null,
  client_name text not null default '' check (length(client_name) <= 200),
  client_contact text not null default '' check (length(client_contact) <= 200),
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'paid', 'void')),
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(6,3) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  notes text not null default '' check (length(notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_company_number_uq unique (company_id, invoice_number)
);
create unique index if not exists invoices_company_id_id_uq
  on public.invoices(company_id, id);
create index if not exists invoices_company_status_idx
  on public.invoices(company_id, status);
create index if not exists invoices_company_created_idx
  on public.invoices(company_id, created_at desc);
alter table public.invoices enable row level security;
grant select, insert, update, delete on public.invoices to authenticated;
grant all on public.invoices to service_role;

drop policy if exists "invoices owner/admin read" on public.invoices;
create policy "invoices owner/admin read" on public.invoices
  for select to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = invoices.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
drop policy if exists "invoices owner/admin insert" on public.invoices;
create policy "invoices owner/admin insert" on public.invoices
  for insert to authenticated
  with check (exists (select 1 from public.company_members m
    where m.company_id = invoices.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
drop policy if exists "invoices owner/admin update" on public.invoices;
create policy "invoices owner/admin update" on public.invoices
  for update to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = invoices.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')))
  with check (exists (select 1 from public.company_members m
    where m.company_id = invoices.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
drop policy if exists "invoices owner/admin delete" on public.invoices;
create policy "invoices owner/admin delete" on public.invoices
  for delete to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = invoices.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));

comment on table public.invoices is
 'Customer invoices (migration 060). Owner/admin only. subtotal/tax_amount/total are derived from invoice_line_items while the invoice is a draft and frozen at issue; amount_paid and the issued/paid status are derived from active invoice_payments rows. Issued invoices are never edited or deleted -- void with a recorded reason and re-issue.';

-- ============ 3. Invoice line items ============
create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null,
  description text not null default '' check (length(description) <= 500),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  amount numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_line_item_invoice_fk foreign key (company_id, invoice_id)
    references public.invoices(company_id, id) on delete cascade
);
create index if not exists invoice_line_items_invoice_idx
  on public.invoice_line_items(company_id, invoice_id, sort_order);
alter table public.invoice_line_items enable row level security;
grant select, insert, update, delete on public.invoice_line_items to authenticated;
grant all on public.invoice_line_items to service_role;

drop policy if exists "invoice line items owner/admin read" on public.invoice_line_items;
create policy "invoice line items owner/admin read" on public.invoice_line_items
  for select to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = invoice_line_items.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
drop policy if exists "invoice line items owner/admin insert" on public.invoice_line_items;
create policy "invoice line items owner/admin insert" on public.invoice_line_items
  for insert to authenticated
  with check (exists (select 1 from public.company_members m
    where m.company_id = invoice_line_items.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
drop policy if exists "invoice line items owner/admin update" on public.invoice_line_items;
create policy "invoice line items owner/admin update" on public.invoice_line_items
  for update to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = invoice_line_items.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')))
  with check (exists (select 1 from public.company_members m
    where m.company_id = invoice_line_items.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
drop policy if exists "invoice line items owner/admin delete" on public.invoice_line_items;
create policy "invoice line items owner/admin delete" on public.invoice_line_items
  for delete to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = invoice_line_items.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));

-- ============ 4. Invoice payments (immutable ledger) ============
create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null,
  amount numeric(12,2) not null check (amount > 0 and amount <= 999999999.99),
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
  updated_at timestamptz not null default now(),
  constraint invoice_payment_invoice_fk foreign key (company_id, invoice_id)
    references public.invoices(company_id, id) on delete restrict
);
create index if not exists invoice_payments_invoice_idx
  on public.invoice_payments(company_id, invoice_id, payment_date desc);
create index if not exists invoice_payments_active_idx
  on public.invoice_payments(company_id, invoice_id) where voided_at is null;
alter table public.invoice_payments enable row level security;
grant select, insert, update, delete on public.invoice_payments to authenticated;
grant all on public.invoice_payments to service_role;

drop policy if exists "invoice payments owner/admin read" on public.invoice_payments;
create policy "invoice payments owner/admin read" on public.invoice_payments
  for select to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = invoice_payments.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
drop policy if exists "invoice payments owner/admin insert" on public.invoice_payments;
create policy "invoice payments owner/admin insert" on public.invoice_payments
  for insert to authenticated
  with check (exists (select 1 from public.company_members m
    where m.company_id = invoice_payments.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
drop policy if exists "invoice payments owner/admin update" on public.invoice_payments;
create policy "invoice payments owner/admin update" on public.invoice_payments
  for update to authenticated
  using (exists (select 1 from public.company_members m
    where m.company_id = invoice_payments.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')))
  with check (exists (select 1 from public.company_members m
    where m.company_id = invoice_payments.company_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')));
-- No DELETE policy on invoice_payments: payments are never deleted,
-- and the guard trigger below rejects deletes even for owners.

comment on table public.invoice_payments is
 'Per-payment ledger for customer invoices (migration 060). invoices.amount_paid is derived from the active (non-voided) rows here by trigger; a payment is never edited or deleted -- void it with a recorded reason and record a corrected payment.';

-- ============ 5. Numbering: claim the next per-company number ============
create or replace function public.workteams_assign_invoice_number()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $f$
declare claimed integer;
begin
  if new.invoice_number is not null then
    return new;
  end if;
  insert into public.invoice_counters (company_id, next_number)
  values (new.company_id, 2)
  on conflict (company_id) do update
    set next_number = public.invoice_counters.next_number + 1
  returning next_number - 1 into claimed;
  new.invoice_number := claimed;
  return new;
end $f$;
revoke all on function public.workteams_assign_invoice_number() from public, anon, authenticated;
drop trigger if exists workteams_assign_invoice_number_trigger on public.invoices;
create trigger workteams_assign_invoice_number_trigger
  before insert on public.invoices
  for each row execute function public.workteams_assign_invoice_number();

-- ============ 6. Invoice state: derived totals, derived paid status, lifecycle ============
create or replace function public.workteams_invoice_state()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $f$
declare paid_total numeric;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New invoices start as drafts';
    end if;
    new.amount_paid := 0;
    new.subtotal := 0;
    new.tax_amount := 0;
    new.total := 0;
    return new;
  end if;

  -- UPDATE path.
  new.updated_at := now();

  if old.status = 'void' then
    raise exception 'Voided invoices cannot be changed';
  end if;

  -- Void path: the only way into 'void', and it must carry its record.
  if new.status = 'void' then
    if new.voided_at is null or new.voided_by is distinct from (select auth.uid())
       or length(btrim(coalesce(new.void_reason, ''))) < 10
       or length(coalesce(new.void_reason, '')) > 500
       or new.voided_at < now() - interval '5 minutes'
       or new.voided_at > now() + interval '5 minutes' then
      raise exception 'Voiding an invoice requires its current manager and a reason (10-500 characters)';
    end if;
    return new;
  end if;
  if new.voided_at is not null or new.voided_by is not null or new.void_reason is not null then
    raise exception 'Invoice void fields cannot be set outside a void';
  end if;

  -- amount_paid always comes from the active payment rows.
  select coalesce(sum(amount), 0) into paid_total
    from public.invoice_payments
    where company_id = new.company_id and invoice_id = new.id and voided_at is null;
  new.amount_paid := round(paid_total, 2);

  if old.status = 'draft' then
    if new.status not in ('draft', 'issued') then
      raise exception 'A draft invoice can only stay a draft or be issued';
    end if;
    if new.status = 'issued' then
      new.issued_at := coalesce(new.issued_at, now());
    end if;
    -- Totals are derived from the line items while drafting.
    select coalesce(sum(amount), 0) into new.subtotal
      from public.invoice_line_items
      where company_id = new.company_id and invoice_id = new.id;
    new.subtotal := round(new.subtotal, 2);
    new.tax_amount := round(new.subtotal * new.tax_rate / 100, 2);
    new.total := new.subtotal + new.tax_amount;
    return new;
  end if;

  -- Issued / paid: content and totals are frozen; only the derived
  -- issued<->paid status may move, driven by the payment rows.
  if new.location_id is distinct from old.location_id
     or new.client_name is distinct from old.client_name
     or new.client_contact is distinct from old.client_contact
     or new.issue_date is distinct from old.issue_date
     or new.due_date is distinct from old.due_date
     or new.tax_rate is distinct from old.tax_rate
     or new.notes is distinct from old.notes
     or new.invoice_number is distinct from old.invoice_number then
    raise exception 'Issued invoices cannot be edited. Void with a recorded reason and re-issue instead.';
  end if;
  new.subtotal := old.subtotal;
  new.tax_amount := old.tax_amount;
  new.total := old.total;
  new.issued_at := old.issued_at;
  new.status := case
    when new.total > 0 and new.amount_paid >= new.total then 'paid'
    else 'issued'
  end;
  return new;
end $f$;
revoke all on function public.workteams_invoice_state() from public, anon, authenticated;
drop trigger if exists workteams_invoice_state_trigger on public.invoices;
create trigger workteams_invoice_state_trigger
  before insert or update on public.invoices
  for each row execute function public.workteams_invoice_state();

-- ============ 7. Invoice delete guard: drafts only ============
create or replace function public.workteams_guard_invoice_delete()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $f$
begin
  if old.status <> 'draft' then
    raise exception 'Only draft invoices can be deleted. Void an issued invoice with a recorded reason instead.';
  end if;
  if exists (select 1 from public.invoice_payments p
    where p.company_id = old.company_id and p.invoice_id = old.id) then
    raise exception 'Invoices with recorded payments cannot be deleted.';
  end if;
  return old;
end $f$;
revoke all on function public.workteams_guard_invoice_delete() from public, anon, authenticated;
drop trigger if exists workteams_guard_invoice_delete_trigger on public.invoices;
create trigger workteams_guard_invoice_delete_trigger
  before delete on public.invoices
  for each row execute function public.workteams_guard_invoice_delete();

-- ============ 8. Line items: draft-only changes, derived amount, touch parent ============
create or replace function public.workteams_guard_invoice_line_item()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $f$
declare parent_status text;
begin
  if tg_op = 'DELETE' then
    select status into parent_status from public.invoices
      where id = old.invoice_id and company_id = old.company_id;
    if parent_status is null then
      raise exception 'Line item invoice not found in this company';
    end if;
    if parent_status <> 'draft' then
      raise exception 'Line items can only change while the invoice is a draft';
    end if;
    return old;
  end if;
  select status into parent_status from public.invoices
    where id = new.invoice_id and company_id = new.company_id;
  if parent_status is null then
    raise exception 'Line item invoice not found in this company';
  end if;
  if parent_status <> 'draft' then
    raise exception 'Line items can only change while the invoice is a draft';
  end if;
  new.amount := round(new.quantity * new.unit_price, 2);
  new.updated_at := now();
  return new;
end $f$;
revoke all on function public.workteams_guard_invoice_line_item() from public, anon, authenticated;
drop trigger if exists workteams_guard_invoice_line_item_trigger on public.invoice_line_items;
create trigger workteams_guard_invoice_line_item_trigger
  before insert or update or delete on public.invoice_line_items
  for each row execute function public.workteams_guard_invoice_line_item();

create or replace function public.workteams_touch_invoice_totals()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $f$
begin
  -- Touching the invoice fires workteams_invoice_state(), which
  -- re-derives subtotal / tax / total from the line items (draft only).
  if tg_op = 'DELETE' then
    update public.invoices set updated_at = now()
      where id = old.invoice_id and company_id = old.company_id;
    return old;
  end if;
  update public.invoices set updated_at = now()
    where id = new.invoice_id and company_id = new.company_id;
  return new;
end $f$;
revoke all on function public.workteams_touch_invoice_totals() from public, anon, authenticated;
drop trigger if exists workteams_touch_invoice_totals_trigger on public.invoice_line_items;
create trigger workteams_touch_invoice_totals_trigger
  after insert or update or delete on public.invoice_line_items
  for each row execute function public.workteams_touch_invoice_totals();

-- ============ 9. Payment guard: immutable originals, void-with-reason only ============
create or replace function public.workteams_guard_invoice_payment()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $f$
declare inv public.invoices%rowtype; active numeric;
begin
  if tg_op = 'DELETE' then
    raise exception 'Invoice payments cannot be deleted. Void with a recorded reason.';
  end if;
  if tg_op = 'INSERT' then
    if new.voided_at is not null or new.voided_by is not null or
       new.void_reason is not null then
      raise exception 'New invoice payments must not be voided';
    end if;
    if new.amount is null or new.amount <= 0 or new.amount > 999999999.99
       or new.amount <> round(new.amount, 2) then
      raise exception 'Enter a positive amount with at most two decimals';
    end if;
    -- The invoice row lock serializes simultaneous payments against
    -- this invoice, so the active-sum check below cannot race.
    select * into inv from public.invoices
      where id = new.invoice_id and company_id = new.company_id for update;
    if not found then raise exception 'Invoice does not belong to this company'; end if;
    if inv.status <> 'issued' then
      raise exception 'Payments can only be recorded on an issued invoice';
    end if;
    select coalesce(sum(amount), 0) into active from public.invoice_payments
      where company_id = new.company_id and invoice_id = new.invoice_id and voided_at is null;
    if active + new.amount > inv.total then
      raise exception 'Payment exceeds the remaining balance on this invoice';
    end if;
    return new;
  end if;
  if old.voided_at is not null then
    raise exception 'Voided invoice payments cannot be changed';
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
revoke all on function public.workteams_guard_invoice_payment() from public, anon, authenticated;
drop trigger if exists workteams_guard_invoice_payment_trigger on public.invoice_payments;
create trigger workteams_guard_invoice_payment_trigger
  before insert or update or delete on public.invoice_payments
  for each row execute function public.workteams_guard_invoice_payment();

-- ============ 10. Reconcile: invoice paid state derives from the ledger ============
create or replace function public.workteams_reconcile_invoice_payment()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $f$
begin
  -- Touching the invoice fires workteams_invoice_state(), which
  -- re-derives amount_paid and the issued/paid status from the ledger.
  update public.invoices set updated_at = now()
    where id = new.invoice_id and company_id = new.company_id;
  return new;
end $f$;
revoke all on function public.workteams_reconcile_invoice_payment() from public, anon, authenticated;
drop trigger if exists workteams_reconcile_invoice_payment_trigger on public.invoice_payments;
create trigger workteams_reconcile_invoice_payment_trigger
  after insert or update of voided_at on public.invoice_payments
  for each row execute function public.workteams_reconcile_invoice_payment();

COMMIT;
