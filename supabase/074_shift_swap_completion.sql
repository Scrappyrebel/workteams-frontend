-- WorkTeams shift-swap completion (074).
--
-- Migration 069 made shift swaps a RECORD: the requester offers one of
-- their shifts, the named teammate answers in swap_status, and a manager
-- records a decision in status — but approving never moved the shift.
-- Its header said so plainly: "the manager still arranges the actual
-- shift change — the request never moves a shift by itself." Managers
-- then had to re-do the change by hand in the shift tools, and the two
-- records could disagree.
--
-- This migration completes the loop, the way Workforce's Dept 3 build
-- finished it there (its migration 260):
--
--   * public.approve_shift_swap(request_id, decision_note) is the ONE
--     moment a swap takes effect. A manager (owner/admin — the same
--     actors 069's guard lets decide) approves an accepted, still
--     pending swap, and inside that single call: the shift's member_id
--     moves to the teammate who accepted, and the request's decision is
--     recorded (069's guard trigger stamps decided_by / decided_at on
--     the same update). If anything is refused, nothing changes.
--
--   * HARD RULE, enforced here in the database (not just the UI): a
--     shift with ANY recorded time entries can never be swapped. The
--     approval raises a plain refusal instead. Swaps never insert,
--     update or delete time entries — recorded time is never moved.
--     This build touches scheduling only; the time clock, clock-in/out,
--     shift videos and Communication Book are untouched.
--
--   * public.schedule_request_events is the audit trail: one row per
--     step — offered, accepted, declined, approved, denied, cancelled,
--     reassigned — with who acted and when. An AFTER trigger on
--     schedule_requests records the steps the existing app flows already
--     write (offer / answer / decide / cancel), and approve_shift_swap
--     adds the 'reassigned' step with the from/to members. The trail is
--     append-only for the app: authenticated gets SELECT only, and the
--     rows are written exclusively by the two security-definer
--     functions below.
--
-- Everything else in 069 is unchanged: time-off requests still never
-- move a shift (approving time off records the decision only), the
-- guard trigger's field discipline is untouched (this migration does
-- not replace it), and availability stays advisory. Client code probes
-- for the new function/table and falls back to the 069 record-only
-- decision until this migration is run, so nothing breaks beforehand.

BEGIN;

-- ---------- swap audit trail ----------

create table if not exists public.schedule_request_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null references public.schedule_requests(id) on delete cascade,
  actor_member_id uuid references public.company_members(id) on delete set null,
  event text not null check (event in ('offered', 'accepted', 'declined', 'approved', 'denied', 'cancelled', 'reassigned')),
  -- Only the 'reassigned' step fills these two in.
  from_member_id uuid references public.company_members(id) on delete set null,
  to_member_id uuid references public.company_members(id) on delete set null,
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists schedule_request_events_request_idx
  on public.schedule_request_events(request_id, created_at);
create index if not exists schedule_request_events_company_idx
  on public.schedule_request_events(company_id, created_at desc);

comment on table public.schedule_request_events is
  'Append-only audit trail for schedule requests (migration 074): one row per swap step — offered, accepted, declined, approved, denied, cancelled, reassigned — written only by security-definer functions.';

alter table public.schedule_request_events enable row level security;
grant select on public.schedule_request_events to authenticated;
grant all on public.schedule_request_events to service_role;
-- No insert/update/delete grant for authenticated on purpose: the trail
-- can be read by the people involved but only written by the
-- security-definer functions below, so a step cannot be forged or erased.

-- Readable by exactly the people who can read the request itself
-- (mirrors migration 069's select policy on schedule_requests):
-- owners/admins of the company, the requester, and the teammate asked.
drop policy if exists "schedule request events select parties" on public.schedule_request_events;
create policy "schedule request events select parties"
  on public.schedule_request_events for select
  using (
    public.is_company_owner_admin(schedule_request_events.company_id)
    or exists (
      select 1
      from public.schedule_requests r
      join public.company_members m
        on m.company_id = r.company_id
       and m.user_id = auth.uid()
      where r.id = schedule_request_events.request_id
        and (m.id = r.member_id or m.id = r.swap_with_member_id)
    )
  );

-- ---------- audit recorder: follows the steps the app already writes ----------

create or replace function public.schedule_requests_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_event text;
begin
  -- Server-side code (service role) does its own checks elsewhere.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return coalesce(NEW, OLD);
  end if;

  -- The trail covers the swap chain; time-off steps are already fully
  -- described by the request row itself (decision + decided_by/at).
  if NEW.request_type <> 'swap' then
    return NEW;
  end if;

  select m.id into v_actor
  from public.company_members m
  where m.company_id = NEW.company_id
    and m.user_id = auth.uid();

  if TG_OP = 'INSERT' then
    insert into public.schedule_request_events (company_id, request_id, actor_member_id, event)
    values (NEW.company_id, NEW.id, coalesce(v_actor, NEW.member_id), 'offered');
    return NEW;
  end if;

  if NEW.swap_status is distinct from OLD.swap_status then
    if NEW.swap_status = 'accepted' then
      v_event := 'accepted';
    elsif NEW.swap_status = 'declined' then
      v_event := 'declined';
    else
      v_event := null;
    end if;
    if v_event is not null then
      insert into public.schedule_request_events (company_id, request_id, actor_member_id, event)
      values (NEW.company_id, NEW.id, coalesce(v_actor, NEW.swap_with_member_id), v_event);
    end if;
  end if;

  if NEW.status is distinct from OLD.status then
    if NEW.status = 'approved' then
      v_event := 'approved';
    elsif NEW.status = 'denied' then
      v_event := 'denied';
    elsif NEW.status = 'cancelled' then
      v_event := 'cancelled';
    else
      v_event := null;
    end if;
    if v_event is not null then
      insert into public.schedule_request_events (company_id, request_id, actor_member_id, event)
      values (
        NEW.company_id,
        NEW.id,
        case
          when v_event in ('approved', 'denied')
            then coalesce(NEW.decided_by_member_id, v_actor, NEW.member_id)
          else coalesce(v_actor, NEW.member_id)
        end,
        v_event
      );
    end if;
  end if;

  return NEW;
end;
$$;

revoke all on function public.schedule_requests_audit() from public;

drop trigger if exists schedule_requests_audit on public.schedule_requests;
create trigger schedule_requests_audit
  after insert or update on public.schedule_requests
  for each row execute function public.schedule_requests_audit();

-- ---------- the approval that actually moves the shift ----------

create or replace function public.approve_shift_swap(p_request_id uuid, p_decision_note text default null)
returns public.schedule_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_req public.schedule_requests;
  v_shift public.shifts;
begin
  -- Lock the request first so two managers cannot approve it twice;
  -- every check below then runs against a stable row.
  select * into v_req
  from public.schedule_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'That swap request no longer exists.';
  end if;
  if v_req.request_type <> 'swap' then
    raise exception 'That request is not a shift swap.';
  end if;

  -- The caller must be a manager (owner/admin) of the request's own
  -- company — the same actors migration 069's guard lets record a
  -- decision. Re-verified here because this function is security
  -- definer and its shift update bypasses RLS.
  select m.id into v_caller_id
  from public.company_members m
  where m.company_id = v_req.company_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'admin');
  if v_caller_id is null then
    raise exception 'Only a manager can approve a shift swap.';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'This swap has already been decided.';
  end if;
  if v_req.swap_status = 'declined' then
    raise exception 'The teammate declined this swap, so it cannot be approved. Deny it to close it out.';
  end if;
  if v_req.swap_status <> 'accepted' then
    raise exception 'The teammate has not accepted this swap yet.';
  end if;

  select * into v_shift
  from public.shifts
  where id = v_req.shift_id
  for update;
  if not found then
    raise exception 'The shift being swapped no longer exists.';
  end if;
  if v_shift.company_id <> v_req.company_id
     or v_shift.member_id is distinct from v_req.member_id then
    raise exception 'This shift is no longer assigned to the teammate who offered it, so there is nothing to swap.';
  end if;
  if not exists (
    select 1 from public.company_members m
    where m.id = v_req.swap_with_member_id
      and m.company_id = v_req.company_id
  ) then
    raise exception 'The teammate who accepted is no longer on this team.';
  end if;

  -- HARD RULE: a shift with recorded time on it can never be swapped,
  -- and a swap never writes time entries. Recorded time stays exactly
  -- where it was recorded.
  if exists (
    select 1 from public.time_entries te
    where te.shift_id = v_shift.id
  ) then
    raise exception 'This shift already has recorded time on it, so it cannot be swapped. Recorded time is never moved.';
  end if;

  -- The single moment the swap takes effect: the assignment moves and
  -- the decision is recorded in the same transaction (069's guard
  -- trigger stamps decided_by / decided_at on this update).
  update public.shifts
  set member_id = v_req.swap_with_member_id
  where id = v_shift.id;

  update public.schedule_requests
  set status = 'approved',
      decision_note = coalesce(nullif(left(p_decision_note, 500), ''), decision_note)
  where id = v_req.id
  returning * into v_req;

  insert into public.schedule_request_events
    (company_id, request_id, actor_member_id, event, from_member_id, to_member_id, detail)
  values
    (v_req.company_id, v_req.id, v_caller_id, 'reassigned',
     v_req.member_id, v_req.swap_with_member_id,
     'Shift moved to the teammate who accepted the swap.');

  return v_req;
end;
$$;

revoke all on function public.approve_shift_swap(uuid, text) from public;
grant execute on function public.approve_shift_swap(uuid, text) to authenticated;

COMMIT;
