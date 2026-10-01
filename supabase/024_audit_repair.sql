-- ============================================================
-- WorkTeams 024: AUDIT REPAIR ROUND 2 (independent audit, 2026-10-01)
-- Run each BLOCK separately in the Supabase SQL Editor, in order.
-- Every block is idempotent (safe to re-run).
--
-- Repairs:
--  A. Billing fields are now protected on company INSERT too, and
--     companies.created_by is immutable (owner bootstrap can't be reused).
--  B. Founder owner-row bootstrap is single-use; an admin can no longer
--     remove an owner (only an actual owner can).
--  C. Company members: teammates' emails/user_ids are no longer visible
--     to ordinary employees (new team_directory view for the roster).
--  D. Training step progress: INSERT bypass closed, sequence enforced
--     (a step unlocks only after the previous step is completed), exam
--     steps require a real passed exam and take the score from it.
--  E. Training enrollments: learners can only submit for approval;
--     they can no longer self-certify or touch certification fields.
--  F. training_approvals gets a working company-boundary trigger
--     (the old one referenced a company_id column that doesn't exist).
--  G. Paid tiers (Plus/Pro) are enforced by RLS, not just the UI.
--  H. Client portal function contract restored to match the UI
--     (flat client/location names, upcoming shifts, inspection dates,
--     work-order descriptions), keeping the uniform invalid/expired error.
-- ============================================================

-- ================= BLOCK A: billing INSERT guard + created_by immutable ===

-- Complimentary flag: lets the product owner grant free paid-tier access
-- (e.g. their own company) through a trusted server path only. Ordinary
-- clients can never set it — see the guard below.
alter table public.companies
  add column if not exists is_complimentary boolean not null default false;

-- Replaces the UPDATE-only guard from 023. Now fires on INSERT too, and
-- makes companies.created_by immutable so the founder bootstrap below
-- can't be re-armed by rewriting created_by.
create or replace function public.companies_billing_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  if TG_OP = 'INSERT' then
    -- Ordinary clients can never choose billing state at creation, even if
    -- they tamper with the request. The billing system (service_role) is
    -- the only writer of these columns.
    NEW.tier := 'starter';
    NEW.stripe_customer_id := null;
    NEW.stripe_subscription_id := null;
    NEW.subscription_status := 'none';
    NEW.is_complimentary := false;
    return NEW;
  end if;

  -- UPDATE: created_by is immutable; billing fields stay server-written.
  if NEW.created_by is distinct from OLD.created_by then
    raise exception 'Company creator cannot be changed.';
  end if;
  if NEW.tier is distinct from OLD.tier
     or NEW.stripe_customer_id is distinct from OLD.stripe_customer_id
     or NEW.stripe_subscription_id is distinct from OLD.stripe_subscription_id
     or NEW.subscription_status is distinct from OLD.subscription_status
     or NEW.is_complimentary is distinct from OLD.is_complimentary then
    raise exception 'Billing fields can only be changed by the billing system.';
  end if;
  return NEW;
end;
$$;

revoke all on function public.companies_billing_guard() from public;

drop trigger if exists companies_billing_guard on public.companies;
create trigger companies_billing_guard
  before insert or update on public.companies
  for each row execute function public.companies_billing_guard();

-- ================= BLOCK B: single-use founder bootstrap + owner removal ===

-- Records every membership removal so a removed founder cannot
-- delete-then-re-bootstrap their way back to owner: without this log,
-- "no current row" is indistinguishable from "never bootstrapped".
create table if not exists public.bootstrap_consumed (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  consumed_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
alter table public.bootstrap_consumed enable row level security;
-- No browser access at all: only triggers (security definer) and the
-- service role touch it. RLS enabled with no policies denies
-- anon/authenticated.
grant all on public.bootstrap_consumed to service_role;

-- The founder bootstrap (creator inserts their own owner row) is now
-- single-use: it only works while the founder has NO member row yet in the
-- company. A demoted/removed founder, or an admin who somehow rewrote
-- companies.created_by (now immutable per Block A), cannot reuse it.
-- Also: only an actual owner can now remove an owner (admins could before,
-- as long as another owner remained). The last-owner protection stays.
create or replace function public.company_members_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_owner boolean;
  v_is_founder boolean;
  v_has_row boolean;
  v_owner_count int;
  v_company_gone boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.role not in ('owner', 'admin', 'manager', 'employee') then
      raise exception 'Invalid member role.';
    end if;

    if NEW.role = 'owner' then
      select public.is_company_owner(NEW.company_id) into v_is_owner;
      if not coalesce(v_is_owner, false) then
        select exists (
          select 1 from public.companies c
          where c.id = NEW.company_id and c.created_by = auth.uid()
        ) into v_is_founder;
        select exists (
          select 1 from public.company_members cm
          where cm.company_id = NEW.company_id and cm.user_id = auth.uid()
        ) into v_has_row;
        -- A removal record means the bootstrap was already used and the
        -- row later deleted: delete-then-re-bootstrap is denied.
        if v_is_founder and not v_has_row and NEW.user_id = auth.uid() then
          select exists (
            select 1 from public.bootstrap_consumed bc
            where bc.company_id = NEW.company_id and bc.user_id = auth.uid()
          ) into v_has_row;
        end if;
        if not v_is_founder or v_has_row then
          raise exception 'Only a company owner can add another owner.';
        end if;
      end if;
    end if;

    if NEW.role in ('owner', 'admin') then
      select public.is_company_owner_admin(NEW.company_id) into v_is_owner;
      if not coalesce(v_is_owner, false) then
        select exists (
          select 1 from public.companies c
          where c.id = NEW.company_id and c.created_by = auth.uid()
        ) into v_is_founder;
        if not v_is_founder then
          raise exception 'Only a company owner or admin can add a privileged member.';
        end if;
      end if;
    end if;

    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if NEW.role not in ('owner', 'admin', 'manager', 'employee') then
      raise exception 'Invalid member role.';
    end if;
    if NEW.role is distinct from OLD.role then
      if OLD.role = 'owner' or NEW.role = 'owner' then
        select public.is_company_owner(OLD.company_id) into v_is_owner;
        if not coalesce(v_is_owner, false) then
          raise exception 'Only a company owner can change owner status.';
        end if;
      end if;
      if NEW.role in ('admin', 'manager') and OLD.role = 'employee' then
        select public.is_company_owner_admin(OLD.company_id) into v_is_owner;
        if not coalesce(v_is_owner, false) then
          raise exception 'Only a company owner or admin can promote a member.';
        end if;
      end if;
      if OLD.role in ('admin', 'manager') and NEW.role = 'employee' then
        select public.is_company_owner_admin(OLD.company_id) into v_is_owner;
        if not coalesce(v_is_owner, false) then
          raise exception 'Only a company owner or admin can demote a member.';
        end if;
      end if;
    end if;
    return NEW;
  end if;

  -- DELETE
  select not exists (
    select 1 from public.companies c where c.id = OLD.company_id
  ) into v_company_gone;
  if v_company_gone then
    return OLD;
  end if;

  -- Removing an owner requires an actual owner behind the request.
  if OLD.role = 'owner' then
    select public.is_company_owner(OLD.company_id) into v_is_owner;
    if not coalesce(v_is_owner, false) then
      raise exception 'Only a company owner can remove an owner.';
    end if;
    select count(*) into v_owner_count
      from public.company_members
      where company_id = OLD.company_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'A company must keep at least one owner.';
    end if;
  end if;

  -- Log the removal (after the checks above pass) so the founder
  -- bootstrap cannot be replayed after a delete: a removed founder must
  -- be re-invited by a current owner. Pending invites (user_id null)
  -- carry no bootstrap rights, so they are not logged.
  if OLD.user_id is not null then
    insert into public.bootstrap_consumed (company_id, user_id)
    values (OLD.company_id, OLD.user_id)
    on conflict do nothing;
  end if;
  return OLD;
end;
$$;

revoke all on function public.company_members_guard() from public;

drop trigger if exists company_members_guard on public.company_members;
create trigger company_members_guard
  before insert or update or delete on public.company_members
  for each row execute function public.company_members_guard();

-- Keep the RLS insert policy in sync with the single-use bootstrap.
-- (The delete-then-re-bootstrap denial lives in the security-definer
-- trigger above: a policy subquery on bootstrap_consumed could not see
-- those rows through RLS, so the trigger is the enforcing layer.)
drop policy if exists "members insert own owner row" on public.company_members;
create policy "members insert own owner row"
  on public.company_members for insert
  with check (
    company_members.user_id = auth.uid()
    and not exists (
      select 1 from public.company_members cm
      where cm.company_id = company_members.company_id
        and cm.user_id = auth.uid()
    )
    and exists (
      select 1 from public.companies c
      where c.id = company_members.company_id
        and c.created_by = auth.uid()
    )
  );

-- ================= BLOCK C: member directory + tighter member reads ===

-- Ordinary employees no longer need (or get) teammates' emails and user
-- ids. The roster view below exposes only id / display_name / role, scoped
-- to companies the caller belongs to. It runs as the view owner (definer),
-- so it works for every member regardless of the base-table policies.
create or replace function public.is_company_manager(cid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members
    where company_id = cid
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'manager')
  );
$$;

revoke all on function public.is_company_manager(uuid) from public;
grant execute on function public.is_company_manager(uuid) to authenticated;

create or replace view public.team_directory as
select m.id, m.company_id, m.display_name, m.role
from public.company_members m
where exists (
  select 1 from public.company_members me
  where me.company_id = m.company_id
    and me.user_id = auth.uid()
);

grant select on public.team_directory to authenticated;

-- Base table: drop the teammate-wide read. Members can read their own row;
-- owner/admin/manager can read the full roster (emails needed for
-- scheduling and team management). Everyone else uses team_directory.
drop policy if exists "members select if teammate" on public.company_members;

drop policy if exists "members select own row" on public.company_members;
create policy "members select own row"
  on public.company_members for select
  using (company_members.user_id = auth.uid());

drop policy if exists "members select if manager+" on public.company_members;
create policy "members select if manager+"
  on public.company_members for select
  using (public.is_company_manager(company_members.company_id));

-- ================= BLOCK D: training step-progress + enrollment guards ===

-- Replaces the 023 step-progress guard. Closes three bypasses:
--  1. Direct INSERT with status='completed' (trigger now fires on INSERT).
--  2. locked -> available -> completed on a SKIPPED step (a step can now
--     become available/completed only after the previous step is completed).
--  3. Exam steps (6/7) required no real exam: they now require a passed
--     training_exam_attempts row, and the score is taken from that graded
--     attempt — the client-supplied score is ignored.
-- Learners still move forward exactly the way the UI drives them:
-- enroll() seeds rows, unlockNext() opens the next step, completeStep()
-- finishes the current one. Managers keep full control (credit for prior
-- experience, reopening steps on send-back).
create or replace function public.training_step_progress_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_is_manager boolean;
  v_step_number int;
  v_step_key text;
  v_kind text;
  v_prev_completed boolean;
  v_passed_score numeric;
  v_forward boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  if TG_OP = 'INSERT' then
    select e.company_id into v_company
      from public.training_enrollments e
      where e.id = NEW.enrollment_id;
    if v_company is null then
      raise exception 'Training progress must belong to an enrollment.';
    end if;
    select public.is_company_owner_admin(v_company) into v_is_manager;
    if not coalesce(v_is_manager, false)
       and (NEW.status not in ('locked', 'available')
            or NEW.score is not null
            or NEW.completed_at is not null) then
      raise exception 'Training progress rows are created by enrollment.';
    end if;
    return NEW;
  end if;

  -- UPDATE
  if NEW.enrollment_id is distinct from OLD.enrollment_id
     or NEW.step_id is distinct from OLD.step_id then
    raise exception 'Training progress cannot be moved between enrollments or steps.';
  end if;

  select e.company_id into v_company
    from public.training_enrollments e
    where e.id = NEW.enrollment_id;
  if v_company is null then
    raise exception 'Training progress must belong to an enrollment.';
  end if;
  select public.is_company_owner_admin(v_company) into v_is_manager;
  if coalesce(v_is_manager, false) then
    return NEW;
  end if;

  -- Learners move strictly forward through the teaching sequence.
  v_forward := (OLD.status = 'locked' and NEW.status = 'available')
            or (OLD.status = 'available' and NEW.status in ('in_progress', 'completed'))
            or (OLD.status = 'in_progress' and NEW.status = 'completed');
  if OLD.status is distinct from NEW.status then
    if not v_forward then
      raise exception 'Training steps must be completed in order.';
    end if;
    -- A step opens only after the previous step is completed (step 1 is
    -- seeded 'available' at enrollment).
    select s.step_number, s.step_key into v_step_number, v_step_key
      from public.training_steps s where s.id = NEW.step_id;
    if v_step_number is null then
      raise exception 'Training step not found.';
    end if;
    if v_step_number > 1 then
      select exists (
        select 1
        from public.training_step_progress p
        join public.training_steps s2 on s2.id = p.step_id
        where p.enrollment_id = NEW.enrollment_id
          and s2.step_number = v_step_number - 1
          and p.status = 'completed'
      ) into v_prev_completed;
      if not coalesce(v_prev_completed, false) then
        raise exception 'Complete the previous step first.';
      end if;
    end if;
  end if;

  if NEW.status = 'completed' and OLD.status is distinct from NEW.status then
    -- Exam steps need a real passed exam; the score comes from grading.
    if v_step_key is null then
      select s.step_key into v_step_key
        from public.training_steps s where s.id = NEW.step_id;
    end if;
    if v_step_key in ('written_exam', 'scenario_exam') then
      v_kind := case when v_step_key = 'written_exam' then 'written' else 'scenario' end;
      select a.score into v_passed_score
        from public.training_exam_attempts a
        where a.enrollment_id = NEW.enrollment_id
          and a.kind = v_kind
          and a.passed = true
        order by a.completed_at desc nulls last, a.created_at desc
        limit 1;
      if v_passed_score is null then
        raise exception 'Pass the % exam before completing this step.', v_kind;
      end if;
      NEW.score := v_passed_score;
    end if;
    if NEW.completed_at is null then
      NEW.completed_at := now();
    end if;
    if NEW.attempts is not distinct from OLD.attempts then
      NEW.attempts := coalesce(OLD.attempts, 0) + 1;
    end if;
  else
    -- Scoring fields only move on completion.
    if NEW.score is distinct from OLD.score
       or NEW.attempts is distinct from OLD.attempts
       or NEW.completed_at is distinct from OLD.completed_at then
      raise exception 'Only step completion updates scoring fields.';
    end if;
  end if;

  return NEW;
end;
$$;

revoke all on function public.training_step_progress_guard() from public;

drop trigger if exists training_step_progress_guard on public.training_step_progress;
create trigger training_step_progress_guard
  before insert or update on public.training_step_progress
  for each row execute function public.training_step_progress_guard();

-- Learners can enroll and submit for approval; they can no longer certify
-- themselves or touch certification fields. Managers keep full control.
create or replace function public.training_enrollment_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_manager boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return NEW;
  end if;
  if TG_OP = 'INSERT' then
    return NEW;
  end if;

  if NEW.member_id is distinct from OLD.member_id
     or NEW.company_id is distinct from OLD.company_id
     or NEW.course_id is distinct from OLD.course_id then
    raise exception 'Training enrollments cannot be moved.';
  end if;

  select public.is_company_owner_admin(NEW.company_id) into v_is_manager;
  if coalesce(v_is_manager, false) then
    return NEW;
  end if;

  if NEW.completed_at is distinct from OLD.completed_at then
    raise exception 'Only a manager can certify an enrollment.';
  end if;
  if NEW.status is distinct from OLD.status
     and not (OLD.status = 'in_progress' and NEW.status = 'pending_approval') then
    raise exception 'Only a manager can change enrollment status.';
  end if;
  return NEW;
end;
$$;

revoke all on function public.training_enrollment_guard() from public;

drop trigger if exists training_enrollment_guard on public.training_enrollments;
create trigger training_enrollment_guard
  before update on public.training_enrollments
  for each row execute function public.training_enrollment_guard();

-- ================= BLOCK E: training_approvals company boundary ===

-- The old same_company_approvals trigger referenced NEW.company_id, but
-- training_approvals has no company_id column — legitimate approvals would
-- fail at runtime. This guard derives the company through the enrollment
-- and checks the reviewer's membership against it.
create or replace function public.training_approval_company_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_reviewer_company uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;
  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  select e.company_id into v_company
    from public.training_enrollments e
    where e.id = NEW.enrollment_id;
  if v_company is null then
    raise exception 'Approval must reference a training enrollment.';
  end if;
  if TG_OP = 'UPDATE' and NEW.enrollment_id is distinct from OLD.enrollment_id then
    raise exception 'Approval cannot be moved between enrollments.';
  end if;

  select m.company_id into v_reviewer_company
    from public.company_members m
    where m.id = NEW.reviewer_member_id;
  if v_reviewer_company is distinct from v_company then
    raise exception 'Reference crosses company boundary.';
  end if;
  return NEW;
end;
$$;

revoke all on function public.training_approval_company_guard() from public;

drop trigger if exists same_company_approvals on public.training_approvals;
drop trigger if exists training_approval_company_guard on public.training_approvals;
create trigger training_approval_company_guard
  before insert or update or delete on public.training_approvals
  for each row execute function public.training_approval_company_guard();

-- Sanity check: every remaining same_company_* trigger must sit on a table
-- that actually has a company_id column.
do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where t.tgname like 'same_company\_%' escape '\'
      and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = c.relname
          and column_name = 'company_id'
      )
  ) then
    raise exception 'A same_company_* trigger is attached to a table without company_id.';
  end if;
end;
$$;

-- ================= BLOCK F: paid-tier enforcement at the DB layer ===

-- A company's paid tier counts only when it is backed by a real billing
-- relationship: an active/trialing Stripe subscription, or an explicit
-- complimentary grant (service_role only, e.g. the product owner's own
-- company). A forged tier value with subscription_status 'none' gets
-- Starter — exactly like the app's entitledTier() in lib/tiers.js.
create or replace function public.company_tier_meets(cid uuid, required text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when required = 'starter' then true
    when required = 'plus' then exists (
      select 1 from public.companies c
      where c.id = cid
        and c.tier in ('plus', 'pro')
        and (c.is_complimentary or c.subscription_status in ('active', 'trialing'))
    )
    when required = 'pro' then exists (
      select 1 from public.companies c
      where c.id = cid
        and c.tier = 'pro'
        and (c.is_complimentary or c.subscription_status in ('active', 'trialing'))
    )
    else false
  end;
$$;

revoke all on function public.company_tier_meets(uuid, text) from public;
grant execute on function public.company_tier_meets(uuid, text) to authenticated;

-- ---------- F1: Plus features ----------

drop policy if exists "inspections select if member" on public.inspections;
create policy "inspections select if member"
  on inspections for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = inspections.company_id and m.user_id = auth.uid()
    )
    and public.company_tier_meets(inspections.company_id, 'plus')
  );

drop policy if exists "inspections insert if owner/admin" on public.inspections;
create policy "inspections insert if owner/admin"
  on inspections for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = inspections.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(inspections.company_id, 'plus')
  );

drop policy if exists "inspections update if owner/admin" on public.inspections;
create policy "inspections update if owner/admin"
  on inspections for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = inspections.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(inspections.company_id, 'plus')
  );

drop policy if exists "inspections delete if owner/admin" on public.inspections;
create policy "inspections delete if owner/admin"
  on inspections for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = inspections.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(inspections.company_id, 'plus')
  );

drop policy if exists "inspection_photos select if member" on public.inspection_photos;
create policy "inspection_photos select if member"
  on inspection_photos for select
  using (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_photos.inspection_id
        and m.user_id = auth.uid()
    )
    and public.company_tier_meets(
      (select i.company_id from inspections i where i.id = inspection_photos.inspection_id),
      'plus'
    )
  );

drop policy if exists "inspection_photos insert if owner/admin" on public.inspection_photos;
create policy "inspection_photos insert if owner/admin"
  on inspection_photos for insert
  with check (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_photos.inspection_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(
      (select i.company_id from inspections i where i.id = inspection_photos.inspection_id),
      'plus'
    )
  );

drop policy if exists "inspection_photos delete if owner/admin" on public.inspection_photos;
create policy "inspection_photos delete if owner/admin"
  on inspection_photos for delete
  using (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_photos.inspection_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(
      (select i.company_id from inspections i where i.id = inspection_photos.inspection_id),
      'plus'
    )
  );

drop policy if exists "messages select if member" on public.messages;
create policy "messages select if member"
  on messages for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = messages.company_id and m.user_id = auth.uid()
    )
    and public.company_tier_meets(messages.company_id, 'plus')
  );

drop policy if exists "messages insert own if member" on public.messages;
create policy "messages insert own if member"
  on messages for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = messages.company_id
        and m.user_id = auth.uid()
        and m.id = messages.sender_id
    )
    and public.company_tier_meets(messages.company_id, 'plus')
  );

-- Inspection photo files live at {company_id}/{inspection_id}/{filename}.
drop policy if exists "inspection-photos read if member" on storage.objects;
create policy "inspection-photos read if member"
  on storage.objects for select
  using (
    bucket_id = 'inspection-photos'
    and public.is_company_member(((string_to_array(name, '/'))[1])::uuid)
    and public.company_tier_meets(((string_to_array(name, '/'))[1])::uuid, 'plus')
  );

drop policy if exists "inspection-photos upload if owner/admin" on storage.objects;
create policy "inspection-photos upload if owner/admin"
  on storage.objects for insert
  with check (
    bucket_id = 'inspection-photos'
    and public.is_company_owner_admin(((string_to_array(name, '/'))[1])::uuid)
    and public.company_tier_meets(((string_to_array(name, '/'))[1])::uuid, 'plus')
  );

drop policy if exists "inspection-photos delete if owner/admin" on storage.objects;
create policy "inspection-photos delete if owner/admin"
  on storage.objects for delete
  using (
    bucket_id = 'inspection-photos'
    and public.is_company_owner_admin(((string_to_array(name, '/'))[1])::uuid)
    and public.company_tier_meets(((string_to_array(name, '/'))[1])::uuid, 'plus')
  );

-- ---------- F2: Pro features ----------

drop policy if exists "bids owner/admin only" on public.bids;
create policy "bids owner/admin only"
  on bids for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = bids.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(bids.company_id, 'pro')
  );

drop policy if exists "bids insert if owner/admin" on public.bids;
create policy "bids insert if owner/admin"
  on bids for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = bids.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(bids.company_id, 'pro')
  );

drop policy if exists "bids update if owner/admin" on public.bids;
create policy "bids update if owner/admin"
  on bids for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = bids.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(bids.company_id, 'pro')
  );

drop policy if exists "bids delete if owner/admin" on public.bids;
create policy "bids delete if owner/admin"
  on bids for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = bids.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(bids.company_id, 'pro')
  );

drop policy if exists "bid_items select if owner/admin" on public.bid_items;
create policy "bid_items select if owner/admin"
  on bid_items for select
  using (
    exists (
      select 1 from bids b
      join company_members m on m.company_id = b.company_id
      where b.id = bid_items.bid_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(
      (select b.company_id from bids b where b.id = bid_items.bid_id),
      'pro'
    )
  );

drop policy if exists "bid_items insert if owner/admin" on public.bid_items;
create policy "bid_items insert if owner/admin"
  on bid_items for insert
  with check (
    exists (
      select 1 from bids b
      join company_members m on m.company_id = b.company_id
      where b.id = bid_items.bid_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(
      (select b.company_id from bids b where b.id = bid_items.bid_id),
      'pro'
    )
  );

drop policy if exists "bid_items update if owner/admin" on public.bid_items;
create policy "bid_items update if owner/admin"
  on bid_items for update
  using (
    exists (
      select 1 from bids b
      join company_members m on m.company_id = b.company_id
      where b.id = bid_items.bid_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(
      (select b.company_id from bids b where b.id = bid_items.bid_id),
      'pro'
    )
  );

drop policy if exists "bid_items delete if owner/admin" on public.bid_items;
create policy "bid_items delete if owner/admin"
  on bid_items for delete
  using (
    exists (
      select 1 from bids b
      join company_members m on m.company_id = b.company_id
      where b.id = bid_items.bid_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(
      (select b.company_id from bids b where b.id = bid_items.bid_id),
      'pro'
    )
  );

drop policy if exists "walkthroughs owner/admin only" on public.walkthroughs;
create policy "walkthroughs owner/admin only"
  on walkthroughs for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = walkthroughs.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(walkthroughs.company_id, 'pro')
  );

drop policy if exists "walkthroughs insert if owner/admin" on public.walkthroughs;
create policy "walkthroughs insert if owner/admin"
  on walkthroughs for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = walkthroughs.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(walkthroughs.company_id, 'pro')
  );

drop policy if exists "walkthroughs update if owner/admin" on public.walkthroughs;
create policy "walkthroughs update if owner/admin"
  on walkthroughs for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = walkthroughs.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(walkthroughs.company_id, 'pro')
  );

drop policy if exists "walkthroughs delete if owner/admin" on public.walkthroughs;
create policy "walkthroughs delete if owner/admin"
  on walkthroughs for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = walkthroughs.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(walkthroughs.company_id, 'pro')
  );

drop policy if exists "walkthrough_areas owner/admin only" on public.walkthrough_areas;
create policy "walkthrough_areas owner/admin only"
  on walkthrough_areas for select
  using (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_areas.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(
      (select w.company_id from walkthroughs w where w.id = walkthrough_areas.walkthrough_id),
      'pro'
    )
  );

drop policy if exists "walkthrough_areas insert if owner/admin" on public.walkthrough_areas;
create policy "walkthrough_areas insert if owner/admin"
  on walkthrough_areas for insert
  with check (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_areas.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(
      (select w.company_id from walkthroughs w where w.id = walkthrough_areas.walkthrough_id),
      'pro'
    )
  );

drop policy if exists "walkthrough_areas update if owner/admin" on public.walkthrough_areas;
create policy "walkthrough_areas update if owner/admin"
  on walkthrough_areas for update
  using (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_areas.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(
      (select w.company_id from walkthroughs w where w.id = walkthrough_areas.walkthrough_id),
      'pro'
    )
  );

drop policy if exists "walkthrough_areas delete if owner/admin" on public.walkthrough_areas;
create policy "walkthrough_areas delete if owner/admin"
  on walkthrough_areas for delete
  using (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_areas.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(
      (select w.company_id from walkthroughs w where w.id = walkthrough_areas.walkthrough_id),
      'pro'
    )
  );

drop policy if exists "work_orders select if member" on public.work_orders;
create policy "work_orders select if member"
  on work_orders for select
  using (
    public.is_company_member(work_orders.company_id)
    and (
      public.is_company_owner_admin(work_orders.company_id)
      or exists (
        select 1 from company_members m
        where m.id = work_orders.assigned_to
          and m.user_id = auth.uid()
      )
    )
    and public.company_tier_meets(work_orders.company_id, 'pro')
  );

drop policy if exists "work_orders insert if owner/admin" on public.work_orders;
create policy "work_orders insert if owner/admin"
  on work_orders for insert
  with check (
    public.is_company_owner_admin(work_orders.company_id)
    and public.company_tier_meets(work_orders.company_id, 'pro')
  );

drop policy if exists "work_orders update if owner/admin or assignee" on public.work_orders;
create policy "work_orders update if owner/admin or assignee"
  on work_orders for update
  using (
    (
      public.is_company_owner_admin(work_orders.company_id)
      or exists (
        select 1 from company_members m
        where m.id = work_orders.assigned_to
          and m.user_id = auth.uid()
      )
    )
    and public.company_tier_meets(work_orders.company_id, 'pro')
  );

drop policy if exists "work_orders delete if owner/admin" on public.work_orders;
create policy "work_orders delete if owner/admin"
  on work_orders for delete
  using (
    public.is_company_owner_admin(work_orders.company_id)
    and public.company_tier_meets(work_orders.company_id, 'pro')
  );

drop policy if exists "supplies select if member" on public.supplies;
create policy "supplies select if member"
  on supplies for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = supplies.company_id and m.user_id = auth.uid()
    )
    and public.company_tier_meets(supplies.company_id, 'pro')
  );

drop policy if exists "supplies insert if owner/admin" on public.supplies;
create policy "supplies insert if owner/admin"
  on supplies for insert
  with check (
    public.is_company_owner_admin(supplies.company_id)
    and public.company_tier_meets(supplies.company_id, 'pro')
  );

drop policy if exists "supplies update if owner/admin" on public.supplies;
create policy "supplies update if owner/admin"
  on supplies for update
  using (
    public.is_company_owner_admin(supplies.company_id)
    and public.company_tier_meets(supplies.company_id, 'pro')
  );

drop policy if exists "supplies delete if owner/admin" on public.supplies;
create policy "supplies delete if owner/admin"
  on supplies for delete
  using (
    public.is_company_owner_admin(supplies.company_id)
    and public.company_tier_meets(supplies.company_id, 'pro')
  );

drop policy if exists "portal_tokens select if owner/admin" on public.portal_tokens;
create policy "portal_tokens select if owner/admin"
  on portal_tokens for select
  using (
    public.is_company_owner_admin(portal_tokens.company_id)
    and public.company_tier_meets(portal_tokens.company_id, 'pro')
  );

drop policy if exists "portal_tokens insert if owner/admin" on public.portal_tokens;
create policy "portal_tokens insert if owner/admin"
  on portal_tokens for insert
  with check (
    public.is_company_owner_admin(portal_tokens.company_id)
    and public.company_tier_meets(portal_tokens.company_id, 'pro')
  );

drop policy if exists "portal_tokens update if owner/admin" on public.portal_tokens;
create policy "portal_tokens update if owner/admin"
  on portal_tokens for update
  using (
    public.is_company_owner_admin(portal_tokens.company_id)
    and public.company_tier_meets(portal_tokens.company_id, 'pro')
  );

drop policy if exists "portal_tokens delete if owner/admin" on public.portal_tokens;
create policy "portal_tokens delete if owner/admin"
  on portal_tokens for delete
  using (
    public.is_company_owner_admin(portal_tokens.company_id)
    and public.company_tier_meets(portal_tokens.company_id, 'pro')
  );

drop policy if exists "rate_areas owner/admin only" on public.rate_areas;
create policy "rate_areas owner/admin only"
  on rate_areas for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = rate_areas.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(rate_areas.company_id, 'pro')
  );

drop policy if exists "rate_areas insert if owner/admin" on public.rate_areas;
create policy "rate_areas insert if owner/admin"
  on rate_areas for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = rate_areas.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(rate_areas.company_id, 'pro')
  );

drop policy if exists "rate_areas update if owner/admin" on public.rate_areas;
create policy "rate_areas update if owner/admin"
  on rate_areas for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = rate_areas.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(rate_areas.company_id, 'pro')
  );

drop policy if exists "rate_areas delete if owner/admin" on public.rate_areas;
create policy "rate_areas delete if owner/admin"
  on rate_areas for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = rate_areas.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(rate_areas.company_id, 'pro')
  );

drop policy if exists "revenue_entries owner/admin only" on public.revenue_entries;
create policy "revenue_entries owner/admin only"
  on revenue_entries for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = revenue_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(revenue_entries.company_id, 'pro')
  );

drop policy if exists "revenue_entries insert if owner/admin" on public.revenue_entries;
create policy "revenue_entries insert if owner/admin"
  on revenue_entries for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = revenue_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(revenue_entries.company_id, 'pro')
  );

drop policy if exists "revenue_entries update if owner/admin" on public.revenue_entries;
create policy "revenue_entries update if owner/admin"
  on revenue_entries for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = revenue_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(revenue_entries.company_id, 'pro')
  );

drop policy if exists "revenue_entries delete if owner/admin" on public.revenue_entries;
create policy "revenue_entries delete if owner/admin"
  on revenue_entries for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = revenue_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(revenue_entries.company_id, 'pro')
  );

drop policy if exists "expense_entries owner/admin only" on public.expense_entries;
create policy "expense_entries owner/admin only"
  on expense_entries for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = expense_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(expense_entries.company_id, 'pro')
  );

drop policy if exists "expense_entries insert if owner/admin" on public.expense_entries;
create policy "expense_entries insert if owner/admin"
  on expense_entries for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = expense_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(expense_entries.company_id, 'pro')
  );

drop policy if exists "expense_entries update if owner/admin" on public.expense_entries;
create policy "expense_entries update if owner/admin"
  on expense_entries for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = expense_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(expense_entries.company_id, 'pro')
  );

drop policy if exists "expense_entries delete if owner/admin" on public.expense_entries;
create policy "expense_entries delete if owner/admin"
  on expense_entries for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = expense_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    and public.company_tier_meets(expense_entries.company_id, 'pro')
  );

-- ================= BLOCK G: client portal contract (matches the UI) ===

-- Restores the original portal contract that app/portal/[token]/page.js
-- expects (flat client_name / location_name / location_address, upcoming
-- shifts with shift_date+start_time+end_time, inspections with
-- inspection_date, open/in-progress work orders with descriptions).
-- Keeps the security properties: security-definer, token+company+location
-- scoping, a single uniform error for invalid AND expired tokens (no
-- oracle), and whitelisted fields only. The location row is additionally
-- scoped to the token's company.
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
  select * into pt from public.portal_tokens where token = tok;
  if pt.id is null
     or (pt.expires_at is not null and pt.expires_at < now()) then
    return jsonb_build_object('ok', false, 'error', 'This link is invalid or has expired.');
  end if;
  -- A company that drops below Pro loses portal serving too: otherwise a
  -- single month of Pro would mint permanent client links. The uniform
  -- error reveals nothing about which check failed.
  if not public.company_tier_meets(pt.company_id, 'pro') then
    return jsonb_build_object('ok', false, 'error', 'This link is invalid or has expired.');
  end if;

  select name, address into loc_name, loc_address
    from public.locations
    where id = pt.location_id and company_id = pt.company_id;
  if loc_name is null then
    return jsonb_build_object('ok', false, 'error', 'This location is no longer available.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'client_name', pt.client_name,
    'location_name', loc_name,
    'location_address', loc_address,
    'upcoming', (
      select coalesce(jsonb_agg(t order by t.shift_date, t.start_time), '[]'::jsonb)
      from (
        select shift_date, start_time, end_time
        from public.shifts
        where company_id = pt.company_id
          and location_id = pt.location_id
          and shift_date >= CURRENT_DATE
          and shift_date <= CURRENT_DATE + 14
        order by shift_date, start_time
        limit 20
      ) t
    ),
    'inspections', (
      select coalesce(jsonb_agg(t order by t.inspection_date desc), '[]'::jsonb)
      from (
        select inspection_date, score, notes
        from public.inspections
        where company_id = pt.company_id
          and location_id = pt.location_id
        order by inspection_date desc
        limit 5
      ) t
    ),
    'work_orders', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select title, description, status, priority, due_date
        from public.work_orders
        where company_id = pt.company_id
          and location_id = pt.location_id
          and status in ('open', 'in_progress')
        order by created_at desc
        limit 20
      ) t
    )
  );
end;
$$;

grant execute on function public.get_portal_data(text) to anon, authenticated;

-- ================= BLOCK H: final trigger sanity sweep =================
-- Re-run the same_company_* attachment check after all rewrites above.

do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where t.tgname like 'same_company\_%' escape '\'
      and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = c.relname
          and column_name = 'company_id'
      )
  ) then
    raise exception 'A same_company_* trigger is attached to a table without company_id.';
  end if;
end;
$$;

-- ================= BLOCK I: hide Stripe identifiers from browser reads ==

-- The browser only ever needs safe company columns. Stripe customer and
-- subscription IDs are readable only by the service role (Stripe routes,
-- webhook) and security-definer functions. Column-level grants enforce
-- this: even a SELECT * from the browser fails on the hidden columns,
-- so the app selects explicit safe columns instead.
revoke all on public.companies from anon, authenticated;

grant select (id, name, tier, subscription_status, is_complimentary, created_by, created_at)
  on public.companies to authenticated;
grant insert (name, tier, created_by)
  on public.companies to authenticated;
grant update (name)
  on public.companies to authenticated;
-- No delete grant: there is no companies DELETE policy, so browser
-- deletes were already denied by RLS.

grant all on public.companies to service_role;
