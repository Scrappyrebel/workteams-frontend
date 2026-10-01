-- ============================================================
-- WorkTeams 023: PRODUCTION SECURITY REPAIR
-- Run each BLOCK separately in the Supabase SQL Editor, in order.
-- Every block is idempotent (safe to re-run).
-- Findings reference the ChatGPT security review repair order.
-- ============================================================

-- ================= BLOCK A: #1 CRITICAL — invite escalation ============
-- Drops the unsafe UPDATE policy that let a pending invitee rewrite
-- their own member row (role/company/email/user_id). Invite claiming
-- now happens ONLY through the hardened claim_invite() RPC
-- (supabase/009_claim_invite.sql), which changes user_id and nothing else.

drop policy if exists "members link own invite" on public.company_members;

-- ================= BLOCK B: #2 owner/admin distinction + #10 billing ===
-- Part 1: owner-only helper (is_company_owner_admin already exists).

create or replace function public.is_company_owner(cid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$ select exists (
  select 1 from public.company_members
  where company_id = cid and user_id = auth.uid() and role = 'owner'
); $$;

revoke all on function public.is_company_owner(uuid) from public;
grant execute on function public.is_company_owner(uuid) to authenticated;

-- Part 2: trigger enforcing the owner/admin hierarchy on company_members.
-- Rules (apply to every client; service_role bypasses like RLS does):
--  - INSERT role='owner': only an existing owner, or the company founder
--    creating their own owner row right after creating the company.
--  - UPDATE/DELETE touching the owner role: owners only.
--  - The last owner can never be demoted or removed.
--  - company_id, user_id, email are immutable (except the invite-claim
--    pattern: pending row user_id null -> linked to the signed-in user,
--    which is exactly what claim_invite() does).
create or replace function public.company_members_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_owner boolean;
  v_owner_count int;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.role = 'owner' then
      select public.is_company_owner(NEW.company_id) into v_is_owner;
      if not coalesce(v_is_owner, false)
         and not exists (
           select 1 from public.companies c
           where c.id = NEW.company_id and c.created_by = auth.uid()
         ) then
        raise exception 'Only a company owner can add another owner.';
      end if;
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    -- Invite-claim pattern (claim_invite()): pending row linked to the
    -- signed-in user, nothing else changed.
    if OLD.user_id is null
       and NEW.user_id = auth.uid()
       and NEW.company_id = OLD.company_id
       and NEW.email = OLD.email
       and NEW.role = OLD.role
       and NEW.display_name is not distinct from OLD.display_name then
      return NEW;
    end if;
    if NEW.company_id is distinct from OLD.company_id
       or NEW.user_id is distinct from OLD.user_id
       or NEW.email is distinct from OLD.email then
      raise exception 'Member identity fields cannot be changed.';
    end if;
    if NEW.role is distinct from OLD.role
       and 'owner' in (OLD.role, NEW.role) then
      select public.is_company_owner(OLD.company_id) into v_is_owner;
      if not coalesce(v_is_owner, false) then
        raise exception 'Only a company owner can grant or remove the owner role.';
      end if;
    end if;
    if OLD.role = 'owner' and NEW.role is distinct from OLD.role then
      select count(*) into v_owner_count
      from public.company_members
      where company_id = OLD.company_id and role = 'owner' and id <> OLD.id;
      if v_owner_count = 0 then
        raise exception 'A company must keep at least one owner.';
      end if;
    end if;
    return NEW;
  end if;

  -- DELETE
  if OLD.role = 'owner' then
    select count(*) into v_owner_count
    from public.company_members
    where company_id = OLD.company_id and role = 'owner' and id <> OLD.id;
    if v_owner_count = 0 then
      raise exception 'A company must keep at least one owner.';
    end if;
  end if;
  return OLD;
end;
$$;

revoke all on function public.company_members_guard() from public;

drop trigger if exists company_members_guard on public.company_members;
create trigger company_members_guard
  before insert or update or delete on public.company_members
  for each row execute function public.company_members_guard();

-- Part 3 (#10): billing columns are write-protected. Only the billing
-- system (service_role: Stripe webhook + checkout routes) may change
-- tier / stripe_customer_id / stripe_subscription_id / subscription_status.
-- Everyone else (including owners) can still update name etc.
create or replace function public.companies_billing_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return NEW;
  end if;
  if NEW.tier is distinct from OLD.tier
     or NEW.stripe_customer_id is distinct from OLD.stripe_customer_id
     or NEW.stripe_subscription_id is distinct from OLD.stripe_subscription_id
     or NEW.subscription_status is distinct from OLD.subscription_status then
    raise exception 'Billing fields can only be changed by the billing system.';
  end if;
  return NEW;
end;
$$;

revoke all on function public.companies_billing_guard() from public;

drop trigger if exists companies_billing_guard on public.companies;
create trigger companies_billing_guard
  before update on public.companies
  for each row execute function public.companies_billing_guard();

-- ================= BLOCK C: #3 pay-rate isolation =====================
-- Moves hourly_rate out of company_members into member_pay, readable only
-- by owners/admins. Employees keep seeing names/roles, never pay.

create table if not exists public.member_pay (
  member_id uuid primary key references public.company_members(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  hourly_rate numeric,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.member_pay to authenticated;
grant all on public.member_pay to service_role;

alter table public.member_pay enable row level security;

drop policy if exists "member_pay owner/admin only" on public.member_pay;
create policy "member_pay owner/admin only"
  on public.member_pay for all
  using (public.is_company_owner_admin(member_pay.company_id))
  with check (public.is_company_owner_admin(member_pay.company_id));

-- Migrate existing rates, then remove the column from company_members.
insert into public.member_pay (member_id, company_id, hourly_rate)
  select id, company_id, hourly_rate from public.company_members
  where hourly_rate is not null
  on conflict (member_id) do update
  set hourly_rate = excluded.hourly_rate, updated_at = now();

alter table public.company_members drop column if exists hourly_rate;

-- ================= BLOCK D: #4 time-entry scoping + #6 =================
-- Employees read ONLY their own entries (GPS included); owners/admins read
-- the company's. Direct client INSERT/UPDATE policies are dropped: writes
-- now go exclusively through the server-side /api/time/* routes, which
-- verify the JWT, membership, and geofence before writing via service_role.

drop policy if exists "time select if member" on public.time_entries;
create policy "time select own or manager"
  on public.time_entries for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = time_entries.company_id
        and m.user_id = auth.uid()
        and (m.id = time_entries.member_id or m.role in ('owner', 'admin'))
    )
  );

drop policy if exists "time insert if member" on public.time_entries;
drop policy if exists "time update own or owner/admin" on public.time_entries;
-- No insert/update policies remain: direct browser writes are denied.

-- ================= BLOCK E: #5 location access-detail isolation ========
-- Gate codes, alarm notes, and client phone numbers move out of the
-- locations table (readable by every member) into location_private,
-- readable only by owners/admins.

create table if not exists public.location_private (
  location_id uuid primary key references public.locations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  client_phone text,
  notes text,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.location_private to authenticated;
grant all on public.location_private to service_role;

alter table public.location_private enable row level security;

drop policy if exists "location_private owner/admin only" on public.location_private;
create policy "location_private owner/admin only"
  on public.location_private for all
  using (public.is_company_owner_admin(location_private.company_id))
  with check (public.is_company_owner_admin(location_private.company_id));

insert into public.location_private (location_id, company_id, client_phone, notes)
  select id, company_id, client_phone, notes from public.locations
  where client_phone is not null or notes is not null
  on conflict (location_id) do update
  set client_phone = excluded.client_phone,
      notes = excluded.notes,
      updated_at = now();

alter table public.locations drop column if exists client_phone;
alter table public.locations drop column if exists notes;

-- ================= BLOCK F: #7 training-evidence storage scoping =======
-- Old policies let ANY signed-in user read/write ANY file in the bucket
-- (cross-company exposure). New policies scope access to the path's
-- company/enrollment: the trainee who owns the enrollment, or a manager
-- of that enrollment's company. Paths are {company_id}/{enrollment_id}/{file}.

drop policy if exists "training evidence upload" on storage.objects;
drop policy if exists "training evidence read" on storage.objects;

create policy "training evidence upload scoped"
  on storage.objects for insert
  with check (
    bucket_id = 'training-evidence'
    and (string_to_array(name, '/'))[1] ~ '^[0-9a-f-]{36}$'
    and (string_to_array(name, '/'))[2] ~ '^[0-9a-f-]{36}$'
    and exists (
      select 1 from public.training_enrollments e
      join public.company_members m on m.id = e.member_id
      where e.id = ((string_to_array(name, '/'))[2])::uuid
        and e.company_id = ((string_to_array(name, '/'))[1])::uuid
        and (m.user_id = auth.uid()
             or public.is_company_owner_admin(e.company_id))
    )
  );

create policy "training evidence read scoped"
  on storage.objects for select
  using (
    bucket_id = 'training-evidence'
    and (string_to_array(name, '/'))[2] ~ '^[0-9a-f-]{36}$'
    and exists (
      select 1 from public.training_enrollments e
      join public.company_members m on m.id = e.member_id
      where e.id = ((string_to_array(name, '/'))[2])::uuid
        and e.company_id = ((string_to_array(name, '/'))[1])::uuid
        and (m.user_id = auth.uid()
             or public.is_company_owner_admin(e.company_id))
    )
  );

-- Move pre-existing files ({enrollment_id}/{file}) under their company's
-- prefix so they stay reachable under the new policies.
update storage.objects o
set name = e.company_id::text || '/' || o.name
from public.training_enrollments e
where o.bucket_id = 'training-evidence'
  and array_length(string_to_array(o.name, '/'), 1) = 2
  and (string_to_array(o.name, '/'))[1] = e.id::text;

-- ================= BLOCK G: #8 training-record tamper protection ======
-- Part 1: exam attempts become function-written only. Trainees can read
-- their own attempts; nobody can INSERT/UPDATE/DELETE them directly, so
-- scores and pass/fail can only be set by the grading function.
drop policy if exists "exam attempts via enrollment" on public.training_exam_attempts;

create policy "exam attempts readable"
  on public.training_exam_attempts for select
  using (
    exists (
      select 1 from public.training_enrollments e
      join public.company_members m on m.id = e.member_id
      where e.id = training_exam_attempts.enrollment_id
        and (m.user_id = auth.uid() or public.is_company_owner_admin(e.company_id))
    )
  );

revoke insert, update, delete on public.training_exam_attempts from authenticated;
grant all on public.training_exam_attempts to service_role;

-- Part 2: step progress cannot be moved between enrollments/steps, and a
-- locked step cannot be jumped straight to completed (managers may
-- override, e.g. credit for prior experience).
create or replace function public.training_step_progress_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return NEW;
  end if;
  if NEW.enrollment_id is distinct from OLD.enrollment_id
     or NEW.step_id is distinct from OLD.step_id then
    raise exception 'Training progress cannot be moved between enrollments or steps.';
  end if;
  if OLD.status = 'locked' and NEW.status = 'completed' then
    select e.company_id into v_company
    from public.training_enrollments e where e.id = OLD.enrollment_id;
    if not public.is_company_owner_admin(v_company) then
      raise exception 'This step is locked. Complete the previous steps first.';
    end if;
  end if;
  return NEW;
end;
$$;

revoke all on function public.training_step_progress_guard() from public;

drop trigger if exists training_step_progress_guard on public.training_step_progress;
create trigger training_step_progress_guard
  before update on public.training_step_progress
  for each row execute function public.training_step_progress_guard();

-- Part 3: start_training_exam() refuses to start an exam whose step is
-- still locked; submit_training_exam() refuses to re-grade an attempt
-- that was already submitted.
create or replace function public.start_training_exam(p_enrollment_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
  v_variant text;
  v_attempt uuid;
  v_questions jsonb;
  v_step_status text;
begin
  select e.course_id into v_course
  from training_enrollments e
  join company_members m on m.id = e.member_id
  where e.id = p_enrollment_id and m.user_id = auth.uid();
  if v_course is null then
    raise exception 'enrollment not found';
  end if;

  -- Written = step 6, scenario = step 7. The step must be unlocked first.
  select tsp.status into v_step_status
  from training_step_progress tsp
  join training_steps ts on ts.id = tsp.step_id
  where tsp.enrollment_id = p_enrollment_id
    and ts.step_number = case p_kind when 'written' then 6 when 'scenario' then 7 else -1 end;
  if v_step_status is null or v_step_status = 'locked' then
    raise exception 'Finish the earlier steps before starting this exam.';
  end if;

  v_variant := 'v' || (1 + floor(random() * 999999))::text;

  insert into training_exam_attempts (enrollment_id, kind, variant, question_ids)
  values (p_enrollment_id, p_kind, v_variant, '[]'::jsonb)
  returning id into v_attempt;

  select jsonb_agg(q order by random()) into v_questions
  from (
    select distinct on (variant_group)
      id, question, choices, variant_group
    from training_questions
    where course_id = v_course and kind = p_kind
    order by variant_group, random()
  ) q;

  update training_exam_attempts
  set question_ids = (select jsonb_agg(x->>'id') from jsonb_array_elements(v_questions) x)
  where id = v_attempt;

  return jsonb_build_object('attempt_id', v_attempt, 'variant', v_variant, 'questions', v_questions);
end;
$$;

revoke all on function public.start_training_exam(uuid, text) from public;
grant execute on function public.start_training_exam(uuid, text) to authenticated;

create or replace function public.submit_training_exam(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment uuid;
  v_kind text;
  v_course uuid;
  v_qids jsonb;
  v_total int := 0;
  v_correct int := 0;
  v_qid text;
  v_q record;
  v_chosen int;
  v_map jsonb;
  v_original int;
  v_completed timestamptz;
begin
  select enrollment_id, kind into v_enrollment, v_kind
  from training_exam_attempts a
  join training_enrollments e on e.id = a.enrollment_id
  join company_members m on m.id = e.member_id
  where a.id = p_attempt_id and m.user_id = auth.uid();
  if v_enrollment is null then
    raise exception 'attempt not found';
  end if;

  select completed_at into v_completed
  from training_exam_attempts where id = p_attempt_id;
  if v_completed is not null then
    raise exception 'This exam was already submitted.';
  end if;

  select question_ids into v_qids from training_exam_attempts where id = p_attempt_id;

  for v_qid in select jsonb_array_elements_text(v_qids) loop
    v_total := v_total + 1;
    select * into v_q from training_questions where id = v_qid::uuid;
    v_chosen := (p_answers -> 'answers' ->> v_qid)::int;
    v_map := p_answers -> 'choice_map' -> v_qid;
    if v_chosen is not null and v_map is not null then
      v_original := (v_map -> v_chosen)::int;
      if v_original = v_q.correct_index then
        v_correct := v_correct + 1;
      end if;
    end if;
  end loop;

  update training_exam_attempts
  set answers = p_answers,
      score = case when v_total > 0 then round(v_correct::numeric / v_total * 100, 1) else 0 end,
      passed = (v_total > 0 and v_correct::numeric / v_total >= 0.8),
      completed_at = now()
  where id = p_attempt_id;

  return (select jsonb_build_object(
    'score', score, 'passed', passed, 'total', v_total, 'correct', v_correct
  ) from training_exam_attempts where id = p_attempt_id);
end;
$$;

revoke all on function public.submit_training_exam(uuid, jsonb) from public;
grant execute on function public.submit_training_exam(uuid, jsonb) to authenticated;

-- ================= BLOCK H: #9 inspection photos private ==============
-- The inspection-photos bucket becomes private; the app now serves
-- one-hour signed URLs. Pre-existing public URLs in inspection_photos
-- are normalized back to storage paths so signing keeps working.

update storage.buckets set public = false where id = 'inspection-photos';

update public.inspection_photos
set photo_url = substring(photo_url from 'inspection-photos/(.*)$')
where photo_url like '%/inspection-photos/%'
  and photo_url not like 'inspection-photos/%';

-- ================= BLOCK I: #14 webhook idempotency table =============
-- Consumed by /api/stripe/webhook. processed_at stays NULL until the
-- event is fully processed; failures leave it retryable.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  type text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

grant all on public.stripe_webhook_events to service_role;

alter table public.stripe_webhook_events enable row level security;
-- No policies: only the webhook route (service_role) touches this table.

-- ================= BLOCK J: #16 product_tiers write restriction =======
-- Tier prices are set by the product owner through the server-side
-- /api/admin/tier-prices route (service_role). Direct client writes are
-- revoked and the email-based policy is dropped.

drop policy if exists "product owner can set tier prices" on public.product_tiers;
revoke update on public.product_tiers from authenticated;

-- ================= BLOCK K: #17 same-company FK validation ============
-- Generic guard: for each (fk_column, referenced_table) pair, the
-- referenced row's company_id must equal the new row's company_id.
-- This closes the "point a row at another company's record" hole for
-- every company-scoped foreign key, including service-bypassing clients.
create or replace function public.same_company_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  fk_val uuid;
  ref_company uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return NEW;
  end if;
  for i in 0 .. (TG_NARGS / 2) - 1 loop
    execute format('select ($1).%I', TG_ARGV[i * 2]) using NEW into fk_val;
    if fk_val is not null then
      execute format('select company_id from public.%I where id = $1', TG_ARGV[i * 2 + 1])
        using fk_val into ref_company;
      if ref_company is null or ref_company is distinct from NEW.company_id then
        raise exception 'Reference crosses company boundary: %.% = %',
          TG_ARGV[i * 2 + 1], TG_ARGV[i * 2], fk_val;
      end if;
    end if;
  end loop;
  return NEW;
end;
$$;

revoke all on function public.same_company_guard() from public;

drop trigger if exists same_company_shifts on public.shifts;
create trigger same_company_shifts
  before insert or update on public.shifts
  for each row execute function public.same_company_guard('location_id', 'locations', 'member_id', 'company_members');

drop trigger if exists same_company_time_entries on public.time_entries;
create trigger same_company_time_entries
  before insert or update on public.time_entries
  for each row execute function public.same_company_guard('member_id', 'company_members', 'location_id', 'locations', 'shift_id', 'shifts');

drop trigger if exists same_company_inspections on public.inspections;
create trigger same_company_inspections
  before insert or update on public.inspections
  for each row execute function public.same_company_guard('location_id', 'locations', 'inspector_id', 'company_members');

drop trigger if exists same_company_messages on public.messages;
create trigger same_company_messages
  before insert or update on public.messages
  for each row execute function public.same_company_guard('sender_id', 'company_members');

drop trigger if exists same_company_bids on public.bids;
create trigger same_company_bids
  before insert or update on public.bids
  for each row execute function public.same_company_guard('location_id', 'locations');

drop trigger if exists same_company_work_orders on public.work_orders;
create trigger same_company_work_orders
  before insert or update on public.work_orders
  for each row execute function public.same_company_guard('location_id', 'locations', 'assigned_to', 'company_members');

drop trigger if exists same_company_portal_tokens on public.portal_tokens;
create trigger same_company_portal_tokens
  before insert or update on public.portal_tokens
  for each row execute function public.same_company_guard('location_id', 'locations');

drop trigger if exists same_company_walkthroughs on public.walkthroughs;
create trigger same_company_walkthroughs
  before insert or update on public.walkthroughs
  for each row execute function public.same_company_guard('location_id', 'locations', 'bid_id', 'bids');

drop trigger if exists same_company_locations on public.locations;
create trigger same_company_locations
  before insert or update on public.locations
  for each row execute function public.same_company_guard('rate_area_id', 'rate_areas');

drop trigger if exists same_company_enrollments on public.training_enrollments;
create trigger same_company_enrollments
  before insert or update on public.training_enrollments
  for each row execute function public.same_company_guard('member_id', 'company_members');

drop trigger if exists same_company_approvals on public.training_approvals;
create trigger same_company_approvals
  before insert or update on public.training_approvals
  for each row execute function public.same_company_guard('reviewer_member_id', 'company_members');

-- ================= BLOCK L: #18 portal hardening ======================
-- Part 1: one uniform error for invalid AND expired tokens, so outsiders
-- cannot probe which tokens exist.
create or replace function public.get_portal_data(tok text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pt record;
  loc_name text;
  loc_address text;
begin
  select * into pt from portal_tokens where token = tok;
  if pt.id is null or (pt.expires_at is not null and pt.expires_at < now()) then
    return jsonb_build_object('ok', false, 'error', 'This link is not valid or has expired.');
  end if;

  select name, address into loc_name, loc_address from locations where id = pt.location_id;
  if loc_name is null then
    return jsonb_build_object('ok', false, 'error', 'This location is no longer available.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'location', jsonb_build_object('name', loc_name, 'address', loc_address),
    'upcoming', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'title', title, 'status', status, 'priority', priority, 'due_date', due_date
      ) order by due_date nulls last, created_at desc), '[]'::jsonb)
      from work_orders
      where company_id = pt.company_id
        and location_id = pt.location_id
        and status in ('open', 'in_progress')
    ),
    'inspections', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'score', score, 'notes', notes, 'date', inspection_date
      ) order by inspection_date desc), '[]'::jsonb)
      from inspections
      where company_id = pt.company_id
        and location_id = pt.location_id
      limit 10
    ),
    'work_orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'title', title, 'status', status, 'priority', priority, 'due_date', due_date
      ) order by created_at desc), '[]'::jsonb)
      from work_orders
      where company_id = pt.company_id
        and location_id = pt.location_id
    )
  );
end;
$$;

revoke all on function public.get_portal_data(text) from public;
grant execute on function public.get_portal_data(text) to anon, authenticated;

-- Part 2: managers need an UPDATE policy to rotate/revoke tokens.
drop policy if exists "portal_tokens update if owner/admin" on public.portal_tokens;
create policy "portal_tokens update if owner/admin"
  on public.portal_tokens for update
  using (public.is_company_owner_admin(portal_tokens.company_id))
  with check (public.is_company_owner_admin(portal_tokens.company_id));

-- ================= BLOCK M: #20 function grant review =================
-- Every security-definer function is locked down to the roles that need
-- it; PUBLIC loses execute everywhere. (All functions already pin
-- search_path = public; verified against 001/003/009/021/023.)

revoke all on function public.is_company_member(uuid) from public;
grant execute on function public.is_company_member(uuid) to anon, authenticated;

revoke all on function public.is_company_owner_admin(uuid) from public;
grant execute on function public.is_company_owner_admin(uuid) to anon, authenticated;

revoke all on function public.claim_invite() from public;
grant execute on function public.claim_invite() to authenticated;
