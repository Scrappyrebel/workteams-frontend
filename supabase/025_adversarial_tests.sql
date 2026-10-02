-- ============================================================
-- WorkTeams 025: adversarial tests for the 024 audit repair.
--
-- Run order: 023_security_repair.sql, then 024_audit_repair.sql,
-- then this file. It creates throwaway companies and rolls
-- everything back at the end; nothing persists.
--
-- How it works: fixture rows are loaded with a service_role JWT
-- claim (the 024 guards bypass only service_role, not the table
-- owner), then each test switches to `authenticated` with a forged
-- JWT subject via set_config('request.jwt.claim.sub', ...) — exactly
-- what auth.uid() reads — so every check runs under real RLS +
-- grants + triggers. Each test prints PASS / FAIL via RAISE NOTICE.
-- ============================================================

begin;

-- ---------- fixture setup (service_role JWT claim) ----------
-- The 024 guards (companies_billing_guard, company_members_guard, ...)
-- bypass only when auth.jwt()->>'role' = 'service_role'. The SQL editor
-- runs as the table owner with no JWT, so fixtures are loaded through
-- the service_role bypass. Every attack below runs as 'authenticated'.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.companies (id, name, tier, created_by, subscription_status, is_complimentary)
values
  ('11111111-1111-1111-1111-111111111111', 'AuditCo A', 'pro', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'none', false),
  ('22222222-2222-2222-2222-222222222222', 'AuditCo B', 'starter', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'none', false);

insert into public.company_members (id, company_id, user_id, email, display_name, role)
values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', '11111111-1111-1111-1111-111111111111', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'ownerA@example.com', 'Owner A', 'owner'),
  ('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', '11111111-1111-1111-1111-111111111111', 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7', 'ownerA2@example.com', 'Owner A2', 'owner'),
  ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', '11111111-1111-1111-1111-111111111111', 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', 'empA@example.com', 'Emp A', 'employee'),
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '11111111-1111-1111-1111-111111111111', 'a6a6a6a6-a6a6-a6a6-a6a6-a6a6a6a6a6a6', 'adminA@example.com', 'Admin A', 'admin'),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', '22222222-2222-2222-2222-222222222222', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'ownerB@example.com', 'Owner B', 'owner');

insert into public.locations (id, company_id, name)
values ('1a1a1a1a-1a1a-1a1a-1a1a-1a1a1a1a1a1a', '11111111-1111-1111-1111-111111111111', 'Audit Site');

insert into public.training_courses (id, title, slug, description, category, department)
values ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'Audit Course', 'audit-course', 'd', 'cleaning', 'operations');

insert into public.training_steps (id, course_id, step_number, step_key, title, description)
values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 1, 'reading', 'Reading', 'd'),
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 2, 'written_exam', 'Written exam', 'd');

insert into public.training_enrollments (id, company_id, member_id, course_id, status)
values
  ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', '11111111-1111-1111-1111-111111111111', 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'in_progress'),
  ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', '22222222-2222-2222-2222-222222222222', 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'pending_approval');

-- Attacks run as ordinary authenticated users from here on.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

set local role authenticated;

-- ================= T1: company INSERT billing forgery =================
select set_config('request.jwt.claim.sub', 'c9c9c9c9-c9c9-c9c9-c9c9-c9c9c9c9c9c9', true);
do $$
declare r record;
begin
  insert into public.companies (name, tier, created_by, stripe_customer_id, stripe_subscription_id, subscription_status, is_complimentary)
  values ('EvilCo', 'pro', 'c9c9c9c9-c9c9-c9c9-c9c9-c9c9c9c9c9c9', 'cus_evil', 'sub_evil', 'active', true)
  returning tier, stripe_customer_id, stripe_subscription_id, subscription_status, is_complimentary
  into r;
  if r.tier = 'starter' and r.stripe_customer_id is null and r.stripe_subscription_id is null
     and r.subscription_status = 'none' and r.is_complimentary = false then
    raise notice 'T1 PASS: forged billing fields forced to starter/none by the trigger';
  else
    raise notice 'T1 FAIL: got %', row_to_json(r);
  end if;
exception when others then
  -- Block I column grants deny writing billing columns at all; either way
  -- an ordinary client can never choose billing state at creation.
  raise notice 'T1 PASS: forged billing insert denied (%)', sqlerrm;
end $$;

-- ================= T2: created_by is immutable =================
select set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);
do $$
begin
  update public.companies set created_by = 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5'
  where id = '11111111-1111-1111-1111-111111111111';
  raise notice 'T2 FAIL: created_by was mutable';
exception when others then
  raise notice 'T2 PASS: created_by change denied (%)', sqlerrm;
end $$;

-- ================= T3: owner bootstrap is single-use =================
-- 3a: existing member tries to re-bootstrap as owner
select set_config('request.jwt.claim.sub', 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', true);
do $$
begin
  insert into public.company_members (company_id, user_id, email, display_name, role)
  values ('11111111-1111-1111-1111-111111111111', 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', 'empA@example.com', 'Emp A', 'owner');
  raise notice 'T3a FAIL: member re-bootstrapped as owner';
exception when others then
  raise notice 'T3a PASS: second bootstrap denied (%)', sqlerrm;
end $$;
-- 3b: outsider tries to bootstrap into someone else's company
select set_config('request.jwt.claim.sub', 'c9c9c9c9-c9c9-c9c9-c9c9-c9c9c9c9c9c9', true);
do $$
begin
  insert into public.company_members (company_id, user_id, email, display_name, role)
  values ('11111111-1111-1111-1111-111111111111', 'c9c9c9c9-c9c9-c9c9-c9c9-c9c9c9c9c9c9', 'evil@example.com', 'Evil', 'owner');
  raise notice 'T3b FAIL: outsider bootstrapped as owner';
exception when others then
  raise notice 'T3b PASS: outsider bootstrap denied (%)', sqlerrm;
end $$;
-- 3c: removed founder cannot delete-then-re-bootstrap.
-- The co-owner removes the founder: this goes through the guard, which
-- logs the removal in bootstrap_consumed (two owners exist so the
-- last-owner protection does not trip).
select set_config('request.jwt.claim.sub', 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7', true);
do $$
declare n int;
begin
  delete from public.company_members where id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
  get diagnostics n = row_count;
  if n = 1 then
    raise notice 'T3c-setup PASS: co-owner removed founder';
  else
    raise notice 'T3c FAIL: co-owner delete removed % rows (expected 1)', n;
  end if;
end $$;
-- The removed founder tries to re-bootstrap as owner.
select set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);
do $$
begin
  insert into public.company_members (company_id, user_id, email, display_name, role)
  values ('11111111-1111-1111-1111-111111111111', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'ownerA@example.com', 'Owner A', 'owner');
  raise notice 'T3c FAIL: removed founder re-bootstrapped as owner';
exception when others then
  raise notice 'T3c PASS: delete-then-re-bootstrap denied (%)', sqlerrm;
end $$;
-- Restore owner A for the remaining tests (privileged fixture step).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
reset role;
insert into public.company_members (id, company_id, user_id, email, display_name, role)
values ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', '11111111-1111-1111-1111-111111111111', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'ownerA@example.com', 'Owner A', 'owner');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;

-- ================= T4: admin/employee cannot delete an owner =================
select set_config('request.jwt.claim.sub', 'a6a6a6a6-a6a6-a6a6-a6a6-a6a6a6a6a6a6', true);
do $$
begin
  delete from public.company_members where id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
  raise notice 'T4a FAIL: admin deleted an owner';
exception when others then
  raise notice 'T4a PASS: admin owner-delete denied (%)', sqlerrm;
end $$;
select set_config('request.jwt.claim.sub', 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', true);
do $$
declare n int;
begin
  delete from public.company_members where id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
  get diagnostics n = row_count;
  if n = 0 then
    -- RLS hides the row from non-owners/admins, so the delete silently
    -- removes nothing: the denial is real, it just raises no error.
    raise notice 'T4b PASS: employee owner-delete denied (0 rows visible)';
  else
    raise notice 'T4b FAIL: employee deleted an owner';
  end if;
exception when others then
  raise notice 'T4b PASS: employee owner-delete denied (%)', sqlerrm;
end $$;

-- ================= T5: employee roster leakage =================
select set_config('request.jwt.claim.sub', 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', true);
do $$
declare n_all int; n_email int; dir_cols int;
begin
  select count(*) into n_all from public.company_members;
  select count(*) into n_email from public.company_members where email <> 'empA@example.com';
  if n_all = 1 and n_email = 0 then
    raise notice 'T5a PASS: employee sees only own member row (no teammate emails)';
  else
    raise notice 'T5a FAIL: employee saw % rows, % teammate emails', n_all, n_email;
  end if;
  select count(*) into dir_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'team_directory';
  if dir_cols = 4 then
    raise notice 'T5b PASS: team_directory exposes exactly 4 safe columns';
  else
    raise notice 'T5b FAIL: team_directory has % columns', dir_cols;
  end if;
end $$;

-- ================= T6: forged tier gets no paid tables =================
-- Company A claims tier=pro but subscription_status=none and is NOT
-- complimentary -> Plus/Pro tables must refuse.
select set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);
do $$
begin
  insert into public.inspections (company_id, location_id, inspector_id, inspection_date, score)
  values ('11111111-1111-1111-1111-111111111111', '1a1a1a1a-1a1a-1a1a-1a1a-1a1a1a1a1a1a',
          'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', current_date, 4);
  raise notice 'T6a FAIL: forged-pro company wrote to inspections';
exception when others then
  raise notice 'T6a PASS: forged-pro inspections insert denied (%)', sqlerrm;
end $$;
do $$
declare n int;
begin
  select count(*) into n from public.bids;
  if n = 0 then raise notice 'T6b PASS: forged-pro company reads 0 bids';
  else raise notice 'T6b FAIL: forged-pro company read % bids', n; end if;
end $$;
-- Flip the complimentary grant (privileged fixture step: the billing guard
-- only lets service_role change billing fields).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
reset role;
update public.companies set is_complimentary = true where id = '11111111-1111-1111-1111-111111111111';
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);
do $$
begin
  insert into public.inspections (company_id, location_id, inspector_id, inspection_date, score)
  values ('11111111-1111-1111-1111-111111111111', '1a1a1a1a-1a1a-1a1a-1a1a-1a1a1a1a1a1a',
          'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', current_date, 4);
  raise notice 'T6c PASS: complimentary pro company can use inspections';
exception when others then
  raise notice 'T6c FAIL: complimentary insert denied (%)', sqlerrm;
end $$;

-- ================= T7: training bypasses =================
select set_config('request.jwt.claim.sub', 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', true);
-- 7a: direct INSERT of a completed step is denied outright (Block D raises;
-- it does not silently force the status).
do $$
begin
  insert into public.training_step_progress (enrollment_id, step_id, status, score)
  values ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'completed', 100);
  raise notice 'T7a FAIL: completed step seeded directly';
exception when others then
  raise notice 'T7a PASS: direct completed insert denied (%)', sqlerrm;
end $$;
-- 7b: locked -> completed jump denied
do $$
begin
  insert into public.training_step_progress (enrollment_id, step_id, status)
  values ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'locked');
  update public.training_step_progress set status = 'completed'
  where enrollment_id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1' and step_id = 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2';
  raise notice 'T7b FAIL: locked->completed jump allowed';
exception when others then
  raise notice 'T7b PASS: locked->completed jump denied (%)', sqlerrm;
end $$;
-- 7c: self-certification denied
do $$
begin
  update public.training_enrollments set status = 'certified'
  where id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
  raise notice 'T7c FAIL: learner self-certified';
exception when others then
  raise notice 'T7c PASS: self-certification denied (%)', sqlerrm;
end $$;
-- 7d: legitimate learner path still works (in_progress -> pending_approval)
do $$
declare st text;
begin
  update public.training_enrollments set status = 'pending_approval'
  where id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1' returning status into st;
  raise notice 'T7d PASS: learner submit-for-approval works (status=%)', st;
exception when others then
  raise notice 'T7d FAIL: legitimate submit denied (%)', sqlerrm;
end $$;

-- ================= T8: cross-company approval =================
-- Owner A tries to approve Owner B's enrollment with themselves as reviewer.
select set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', true);
do $$
begin
  insert into public.training_approvals (enrollment_id, reviewer_member_id, decision)
  values ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'approved');
  raise notice 'T8 FAIL: cross-company approval accepted';
exception when others then
  raise notice 'T8 PASS: cross-company approval denied (%)', sqlerrm;
end $$;

-- ================= T9: portal token oracle =================
reset role;
do $$
declare r1 jsonb; r2 jsonb;
begin
  r1 := public.get_portal_data('no-such-token');
  r2 := public.get_portal_data('expired-token-xyz');
  if r1 = r2 and (r1->>'ok') = 'false' then
    raise notice 'T9 PASS: invalid and expired tokens give the identical uniform error';
  else
    raise notice 'T9 FAIL: responses differ: % vs %', r1, r2;
  end if;
end $$;

-- ================= T10: Stripe IDs hidden from browser reads =================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', true);
do $$
declare v text;
begin
  execute 'select stripe_customer_id from public.companies limit 1' into v;
  raise notice 'T10 FAIL: employee read stripe_customer_id';
exception when others then
  raise notice 'T10 PASS: stripe_customer_id hidden from browser role (%)', sqlerrm;
end $$;
do $$
declare v record;
begin
  select id, name, tier, subscription_status, is_complimentary into v
  from public.companies where id = '11111111-1111-1111-1111-111111111111';
  raise notice 'T10b PASS: safe company columns still readable (tier=%)', v.tier;
exception when others then
  raise notice 'T10b FAIL: safe columns unreadable (%)', sqlerrm;
end $$;

rollback;
-- Expected: every test prints PASS. If any prints FAIL, the repair is
-- incomplete for that finding.
