-- WorkTeams Training Academy — schema.
-- Courses are product-level (shared); enrollments/progress are per company+member.
-- Run once in the WorkTeams Supabase project.

-- ============ GLOBAL: course catalog ============

create table public.training_courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null,
  category text not null check (category in ('cleaning','business')),
  department text not null,
  sort_order int not null default 0,
  estimated_hours numeric not null default 2,
  recert_months int not null default 12,
  version int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- The 11 teaching steps per course.
create table public.training_steps (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  step_number int not null check (step_number between 1 and 11),
  step_key text not null check (step_key in (
    'reading','visual','worked_example','guided_practice','simulator',
    'written_exam','scenario_exam','practical_final','evidence',
    'approval','recertification'
  )),
  title text not null,
  description text not null,
  unique (course_id, step_number)
);

-- Lesson content for steps 1-5 (reading, visuals, worked examples, guided practice, simulator).
create table public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  step_id uuid not null references public.training_steps(id) on delete cascade,
  sort_order int not null default 0,
  kind text not null,
  title text not null,
  body text not null,
  media_svg text
);

-- Question bank for steps 6-7. correct_index/explanation are NEVER sent to trainees
-- (they read through a protected view; grading runs in a security-definer function).
create table public.training_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  kind text not null check (kind in ('written','scenario')),
  variant_group text not null,
  question text not null,
  choices jsonb not null,
  correct_index int not null,
  explanation text not null
);

-- Practical final checklists (step 8).
create table public.training_practicals (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  title text not null,
  instructions text not null,
  checklist jsonb not null
);

-- ============ PER-MEMBER: enrollments & records ============

create table public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress','pending_approval','certified','rejected','expired')),
  current_step int not null default 1,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (company_id, member_id, course_id)
);

create table public.training_step_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.training_enrollments(id) on delete cascade,
  step_id uuid not null references public.training_steps(id) on delete cascade,
  status text not null default 'available'
    check (status in ('locked','available','in_progress','completed')),
  score numeric,
  attempts int not null default 0,
  completed_at timestamptz,
  unique (enrollment_id, step_id)
);

create table public.training_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.training_enrollments(id) on delete cascade,
  kind text not null check (kind in ('written','scenario')),
  variant text not null,
  question_ids jsonb not null,
  answers jsonb,
  score numeric,
  passed boolean,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.training_evidence (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.training_enrollments(id) on delete cascade,
  file_url text,
  notes text,
  submitted_at timestamptz not null default now()
);

create table public.training_approvals (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.training_enrollments(id) on delete cascade,
  reviewer_member_id uuid references public.company_members(id) on delete set null,
  decision text check (decision in ('approved','rejected')),
  notes text,
  decided_at timestamptz
);

create table public.training_certifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  exam_variant text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Storage bucket for evidence photos.
insert into storage.buckets (id, name, public)
values ('training-evidence', 'training-evidence', false)
on conflict (id) do nothing;

-- ============ Grants (required) ============

grant select on public.training_courses to anon, authenticated;
grant select on public.training_steps to anon, authenticated;
grant select on public.training_lessons to anon, authenticated;
grant select on public.training_practicals to anon, authenticated;
grant select, insert, update on public.training_enrollments to authenticated;
grant select, insert, update on public.training_step_progress to authenticated;
grant select, insert, update on public.training_exam_attempts to authenticated;
grant select, insert on public.training_evidence to authenticated;
grant select, insert, update on public.training_approvals to authenticated;
grant select on public.training_certifications to authenticated;
grant all on public.training_courses to service_role;
grant all on public.training_steps to service_role;
grant all on public.training_lessons to service_role;
grant all on public.training_questions to service_role;
grant all on public.training_practicals to service_role;
grant all on public.training_enrollments to service_role;
grant all on public.training_step_progress to service_role;
grant all on public.training_exam_attempts to service_role;
grant all on public.training_evidence to service_role;
grant all on public.training_approvals to service_role;
grant all on public.training_certifications to service_role;

-- ============ RLS ============

alter table public.training_courses enable row level security;
alter table public.training_steps enable row level security;
alter table public.training_lessons enable row level security;
alter table public.training_questions enable row level security;
alter table public.training_practicals enable row level security;
alter table public.training_enrollments enable row level security;
alter table public.training_step_progress enable row level security;
alter table public.training_exam_attempts enable row level security;
alter table public.training_evidence enable row level security;
alter table public.training_approvals enable row level security;
alter table public.training_certifications enable row level security;

-- Catalog is readable by everyone (signed in).
create policy "catalog readable"
  on public.training_courses for select using (true);
create policy "steps readable"
  on public.training_steps for select using (true);
create policy "lessons readable"
  on public.training_lessons for select using (true);
create policy "practicals readable"
  on public.training_practicals for select using (true);

-- Questions: NOBODY reads the raw table via API (answer keys stay protected).
-- Trainees get questions through start_training_exam(); managers via service role.
create policy "no direct question reads"
  on public.training_questions for select using (false);

-- Members manage their own enrollments; managers see their company's.
create policy "members own enrollments"
  on public.training_enrollments for all
  using (
    exists (
      select 1 from public.company_members m
      where m.id = training_enrollments.member_id and m.user_id = auth.uid()
    )
    or public.is_company_owner_admin(training_enrollments.company_id)
  )
  with check (
    exists (
      select 1 from public.company_members m
      where m.id = training_enrollments.member_id and m.user_id = auth.uid()
    )
  );

create policy "progress via enrollment"
  on public.training_step_progress for all
  using (
    exists (
      select 1 from public.training_enrollments e
      join public.company_members m on m.id = e.member_id
      where e.id = training_step_progress.enrollment_id
        and (m.user_id = auth.uid() or public.is_company_owner_admin(e.company_id))
    )
  )
  with check (
    exists (
      select 1 from public.training_enrollments e
      join public.company_members m on m.id = e.member_id
      where e.id = training_step_progress.enrollment_id
        and m.user_id = auth.uid()
    )
  );

create policy "exam attempts via enrollment"
  on public.training_exam_attempts for all
  using (
    exists (
      select 1 from public.training_enrollments e
      join public.company_members m on m.id = e.member_id
      where e.id = training_exam_attempts.enrollment_id
        and (m.user_id = auth.uid() or public.is_company_owner_admin(e.company_id))
    )
  )
  with check (
    exists (
      select 1 from public.training_enrollments e
      join public.company_members m on m.id = e.member_id
      where e.id = training_exam_attempts.enrollment_id
        and m.user_id = auth.uid()
    )
  );

create policy "evidence via enrollment"
  on public.training_evidence for all
  using (
    exists (
      select 1 from public.training_enrollments e
      join public.company_members m on m.id = e.member_id
      where e.id = training_evidence.enrollment_id
        and (m.user_id = auth.uid() or public.is_company_owner_admin(e.company_id))
    )
  )
  with check (
    exists (
      select 1 from public.training_enrollments e
      join public.company_members m on m.id = e.member_id
      where e.id = training_evidence.enrollment_id
        and m.user_id = auth.uid()
    )
  );

create policy "approvals managed by managers"
  on public.training_approvals for all
  using (
    exists (
      select 1 from public.training_enrollments e
      where e.id = training_approvals.enrollment_id
        and public.is_company_owner_admin(e.company_id)
    )
    or exists (
      select 1 from public.training_enrollments e
      join public.company_members m on m.id = e.member_id
      where e.id = training_approvals.enrollment_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.training_enrollments e
      where e.id = training_approvals.enrollment_id
        and public.is_company_owner_admin(e.company_id)
    )
  );

create policy "certifications readable in company"
  on public.training_certifications for select
  using (public.is_company_member(training_certifications.company_id));

-- Storage: trainees upload evidence, managers read.
create policy "training evidence upload"
  on storage.objects for insert
  with check (bucket_id = 'training-evidence' and auth.role() = 'authenticated');
create policy "training evidence read"
  on storage.objects for select
  using (bucket_id = 'training-evidence' and auth.role() = 'authenticated');

-- ============ Exam engine (answer keys never leave the database) ============

-- Starts an exam: picks one random question per variant_group, random order.
-- Returns the attempt id and the questions WITHOUT correct answers.
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
begin
  select e.course_id into v_course
  from training_enrollments e
  join company_members m on m.id = e.member_id
  where e.id = p_enrollment_id and m.user_id = auth.uid();
  if v_course is null then
    raise exception 'enrollment not found';
  end if;

  v_variant := 'v' || (1 + floor(random() * 999999))::text;

  insert into training_exam_attempts (enrollment_id, kind, variant, question_ids)
  values (p_enrollment_id, p_kind, v_variant, '[]'::jsonb)
  returning id into v_attempt;

  -- One random question per variant_group, shuffled.
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

grant execute on function public.start_training_exam(uuid, text) to authenticated;

-- Grades an exam: p_answers is {"question_id": chosen_index_after_client_shuffle,
--                              "choice_map": {"question_id": [shuffled_original_indexes]}}
-- Returns {score, passed, total}.
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
begin
  select enrollment_id, kind into v_enrollment, v_kind
  from training_exam_attempts a
  join training_enrollments e on e.id = a.enrollment_id
  join company_members m on m.id = e.member_id
  where a.id = p_attempt_id and m.user_id = auth.uid();
  if v_enrollment is null then
    raise exception 'attempt not found';
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

grant execute on function public.submit_training_exam(uuid, jsonb) to authenticated;
