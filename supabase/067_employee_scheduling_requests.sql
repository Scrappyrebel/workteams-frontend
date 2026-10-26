-- WorkTeams employee scheduling self-service (067).
-- Until now regular (non-temp) employees had no way to tell management when
-- they can work, and no way to ask for time off or a shift swap: availability
-- existed only inside the temp application (046/048), and scheduling was
-- manager-only. This migration adds the two record tables behind the new
-- My Schedule page:
--
--   * public.employee_availability — one row per employee per weekday:
--     available or not, an optional earliest-start / latest-end window, and
--     a short note. Employees maintain their own rows; owners, managers and
--     supervisors in the company can read them, so scheduling stops being
--     blind.
--
--   * public.schedule_requests — time-off and shift-swap requests. A request
--     is a RECORD ONLY: approving one never touches shifts, time entries or
--     shift proof (the protected time-clock area). Managers record their
--     decision here and then make any actual schedule change with the
--     existing shift tools. A swap names the other employee; that employee's
--     answer is recorded in swap_status, and the manager still arranges the
--     actual shift change — the request never moves a shift by itself.
--
-- Field-level write discipline on schedule_requests lives in the
-- schedule_requests_guard trigger (same pattern as company_members_guard in
-- 024): RLS decides WHO may write a row, the trigger decides WHAT each actor
-- may change — requesters can only cancel, the teammate asked can only
-- answer the swap, owners/admins can only record a decision.
--
-- Client code probes for these tables and falls back gracefully, so the app
-- keeps working unchanged until this migration is run.

-- ---------- employee availability ----------

create table if not exists public.employee_availability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  -- 0 = Sunday .. 6 = Saturday (matches the browser's Date.getDay()).
  day_of_week smallint not null check (day_of_week between 0 and 6),
  available boolean not null default true,
  start_time time,
  end_time time,
  note text check (note is null or char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  unique (company_id, member_id, day_of_week)
);
create index if not exists employee_availability_company_idx
  on public.employee_availability(company_id, member_id);

alter table public.employee_availability enable row level security;
grant select, insert, update, delete on public.employee_availability to authenticated;
grant all on public.employee_availability to service_role;

drop policy if exists "availability select own or leader" on public.employee_availability;
create policy "availability select own or leader"
  on public.employee_availability for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = employee_availability.company_id
        and m.user_id = auth.uid()
        and (
          m.id = employee_availability.member_id
          or m.role in ('owner', 'admin', 'manager', 'supervisor')
        )
    )
  );

drop policy if exists "availability insert own" on public.employee_availability;
create policy "availability insert own"
  on public.employee_availability for insert
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = employee_availability.company_id
        and m.user_id = auth.uid()
        and m.id = employee_availability.member_id
    )
  );

drop policy if exists "availability update own" on public.employee_availability;
create policy "availability update own"
  on public.employee_availability for update
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = employee_availability.company_id
        and m.user_id = auth.uid()
        and m.id = employee_availability.member_id
    )
  )
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = employee_availability.company_id
        and m.user_id = auth.uid()
        and m.id = employee_availability.member_id
    )
  );

drop policy if exists "availability delete own" on public.employee_availability;
create policy "availability delete own"
  on public.employee_availability for delete
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = employee_availability.company_id
        and m.user_id = auth.uid()
        and m.id = employee_availability.member_id
    )
  );

-- ---------- schedule requests (time off / shift swap) ----------

create table if not exists public.schedule_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  request_type text not null check (request_type in ('time_off', 'swap')),
  -- Swap only: the shift being offered and the teammate being asked.
  shift_id uuid references public.shifts(id) on delete set null,
  swap_with_member_id uuid references public.company_members(id) on delete set null,
  swap_status text check (swap_status is null or swap_status in ('pending_counterpart', 'accepted', 'declined')),
  -- Time off only: the dates being asked for.
  start_date date,
  end_date date,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  decided_by_member_id uuid references public.company_members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists schedule_requests_company_status_idx
  on public.schedule_requests(company_id, status, created_at desc);
create index if not exists schedule_requests_member_idx
  on public.schedule_requests(member_id, created_at desc);
create index if not exists schedule_requests_counterpart_idx
  on public.schedule_requests(swap_with_member_id, swap_status)
  where swap_with_member_id is not null;

alter table public.schedule_requests enable row level security;
grant select, insert, update on public.schedule_requests to authenticated;
grant all on public.schedule_requests to service_role;
-- No delete grant on purpose: requests are cancelled, never erased, so the
-- decision history stays auditable. (service_role keeps full access.)

drop policy if exists "schedule_requests select own counterpart manager" on public.schedule_requests;
create policy "schedule_requests select own counterpart manager"
  on public.schedule_requests for select
  using (
    public.is_company_owner_admin(schedule_requests.company_id)
    or exists (
      select 1 from public.company_members m
      where m.company_id = schedule_requests.company_id
        and m.user_id = auth.uid()
        and (
          m.id = schedule_requests.member_id
          or m.id = schedule_requests.swap_with_member_id
        )
    )
  );

-- Approved time off is ordinary scheduling information: anyone on the team
-- can see who will be off (the Schedule page shows it). Swap details and
-- pending/denied requests stay restricted to the policy above.
drop policy if exists "schedule_requests select approved time off if member" on public.schedule_requests;
create policy "schedule_requests select approved time off if member"
  on public.schedule_requests for select
  using (
    schedule_requests.status = 'approved'
    and schedule_requests.request_type = 'time_off'
    and public.is_company_member(schedule_requests.company_id)
  );

drop policy if exists "schedule_requests insert own" on public.schedule_requests;
create policy "schedule_requests insert own"
  on public.schedule_requests for insert
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = schedule_requests.company_id
        and m.user_id = auth.uid()
        and m.id = schedule_requests.member_id
    )
  );

drop policy if exists "schedule_requests update actors" on public.schedule_requests;
create policy "schedule_requests update actors"
  on public.schedule_requests for update
  using (
    public.is_company_owner_admin(schedule_requests.company_id)
    or exists (
      select 1 from public.company_members m
      where m.company_id = schedule_requests.company_id
        and m.user_id = auth.uid()
        and (
          m.id = schedule_requests.member_id
          or m.id = schedule_requests.swap_with_member_id
        )
    )
  )
  with check (
    public.is_company_owner_admin(schedule_requests.company_id)
    or exists (
      select 1 from public.company_members m
      where m.company_id = schedule_requests.company_id
        and m.user_id = auth.uid()
        and (
          m.id = schedule_requests.member_id
          or m.id = schedule_requests.swap_with_member_id
        )
    )
  );

-- ---------- write discipline: who may change what ----------

create or replace function public.schedule_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
begin
  -- Server-side code (service role) does its own checks in the API routes.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  select m.id, m.role into v_caller_id, v_caller_role
  from public.company_members m
  where m.company_id = coalesce(NEW.company_id, OLD.company_id)
    and m.user_id = auth.uid();

  if TG_OP = 'INSERT' then
    if v_caller_id is null or v_caller_id <> NEW.member_id then
      raise exception 'You can only create requests for yourself.';
    end if;
    if NEW.status <> 'pending'
       or NEW.decided_by_member_id is not null
       or NEW.decided_at is not null
       or NEW.decision_note is not null then
      raise exception 'New requests start as pending and undecided.';
    end if;
    if NEW.request_type = 'time_off' then
      if NEW.start_date is null or NEW.end_date is null then
        raise exception 'Time off needs a start and an end date.';
      end if;
      if NEW.shift_id is not null
         or NEW.swap_with_member_id is not null
         or NEW.swap_status is not null then
        raise exception 'Time-off requests cannot carry swap details.';
      end if;
    elsif NEW.request_type = 'swap' then
      if NEW.shift_id is null or NEW.swap_with_member_id is null then
        raise exception 'A swap needs a shift and the teammate you are asking.';
      end if;
      if NEW.swap_with_member_id = NEW.member_id then
        raise exception 'You cannot swap a shift with yourself.';
      end if;
      if not exists (
        select 1 from public.company_members m
        where m.id = NEW.swap_with_member_id
          and m.company_id = NEW.company_id
      ) then
        raise exception 'That teammate is not in this company.';
      end if;
      if not exists (
        select 1 from public.shifts s
        where s.id = NEW.shift_id
          and s.company_id = NEW.company_id
          and s.member_id = NEW.member_id
      ) then
        raise exception 'You can only offer one of your own shifts.';
      end if;
      NEW.swap_status := 'pending_counterpart';
    else
      raise exception 'Unknown request type.';
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    -- The identity of a request can never be rewritten after submitting.
    if NEW.company_id is distinct from OLD.company_id
       or NEW.member_id is distinct from OLD.member_id
       or NEW.request_type is distinct from OLD.request_type
       or NEW.shift_id is distinct from OLD.shift_id
       or NEW.swap_with_member_id is distinct from OLD.swap_with_member_id
       or NEW.start_date is distinct from OLD.start_date
       or NEW.end_date is distinct from OLD.end_date
       or NEW.reason is distinct from OLD.reason
       or NEW.created_at is distinct from OLD.created_at then
      raise exception 'Request details cannot be changed after submitting.';
    end if;

    if v_caller_role in ('owner', 'admin') then
      -- Owners/managers record the decision. They cannot answer the swap
      -- for the teammate who was asked.
      if NEW.swap_status is distinct from OLD.swap_status then
        raise exception 'Only the teammate asked can answer the swap.';
      end if;
      if NEW.status is distinct from OLD.status then
        if OLD.status <> 'pending' then
          raise exception 'Only a pending request can be decided or cancelled.';
        end if;
        if NEW.status in ('approved', 'denied') then
          NEW.decided_by_member_id := v_caller_id;
          NEW.decided_at := now();
        elsif NEW.status = 'cancelled' and v_caller_id = OLD.member_id then
          -- A manager cancelling their own request.
          null;
        else
          raise exception 'Managers can approve or deny a pending request.';
        end if;
      elsif NEW.decided_by_member_id is distinct from OLD.decided_by_member_id
         or NEW.decided_at is distinct from OLD.decided_at then
        raise exception 'Decision details are recorded automatically.';
      end if;
    elsif v_caller_id = OLD.member_id then
      -- The requester can only cancel their own pending request.
      if NEW.status is distinct from OLD.status then
        if OLD.status <> 'pending' or NEW.status <> 'cancelled' then
          raise exception 'You can only cancel a pending request.';
        end if;
      end if;
      if NEW.swap_status is distinct from OLD.swap_status
         or NEW.decision_note is distinct from OLD.decision_note
         or NEW.decided_by_member_id is distinct from OLD.decided_by_member_id
         or NEW.decided_at is distinct from OLD.decided_at then
        raise exception 'You can only cancel your own request.';
      end if;
    elsif v_caller_id = OLD.swap_with_member_id and OLD.request_type = 'swap' then
      -- The teammate asked can only answer the swap itself.
      if NEW.swap_status is distinct from OLD.swap_status then
        if OLD.swap_status <> 'pending_counterpart'
           or NEW.swap_status not in ('accepted', 'declined') then
          raise exception 'This swap has already been answered.';
        end if;
      end if;
      if NEW.status is distinct from OLD.status
         or NEW.decision_note is distinct from OLD.decision_note
         or NEW.decided_by_member_id is distinct from OLD.decided_by_member_id
         or NEW.decided_at is distinct from OLD.decided_at then
        raise exception 'You can only accept or decline the swap.';
      end if;
    else
      raise exception 'You cannot change this request.';
    end if;

    NEW.updated_at := now();
    return NEW;
  end if;

  return OLD;
end;
$$;

revoke all on function public.schedule_requests_guard() from public;

drop trigger if exists schedule_requests_guard on public.schedule_requests;
create trigger schedule_requests_guard
  before insert or update on public.schedule_requests
  for each row execute function public.schedule_requests_guard();
