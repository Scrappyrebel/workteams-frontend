-- 046: Temp staffing Batch 1 — skill tags + per-assignment pay.
--
-- * temp_member_skills: skill tags on approved temps, per company
--   (e.g. "floor care", "windows", "construction cleanup").
-- * temp_assignments.pay_rate_cents: per-assignment pay override, in cents.
--   NULL means "use the company's default temp_hourly_pay".
--
-- Grants + RLS in the SAME block (see 2026-10-12 outage: new tables
-- without grants fail their first Data API request).

-- ---------- temp_member_skills ----------
create table if not exists public.temp_member_skills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  skill text not null check (char_length(skill) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (company_id, member_id, skill)
);
create index if not exists temp_member_skills_member_idx
  on public.temp_member_skills(company_id, member_id);

-- ---------- per-assignment pay ----------
alter table public.temp_assignments
  add column if not exists pay_rate_cents int
    check (pay_rate_cents is null or pay_rate_cents >= 0);

-- ---------- RLS ----------
alter table public.temp_member_skills enable row level security;

-- Owners/managers of the company get full access.
drop policy if exists "temp owner full temp_member_skills" on public.temp_member_skills;
create policy "temp owner full temp_member_skills"
  on public.temp_member_skills for all
  using (public.is_company_manager(temp_member_skills.company_id));

-- Temps can read their own skill tags.
drop policy if exists "temp own skills" on public.temp_member_skills;
create policy "temp own skills"
  on public.temp_member_skills for select
  using (
    exists (
      select 1 from public.company_members m
      where m.id = temp_member_skills.member_id and m.user_id = auth.uid()
    )
  );

-- ---------- Grants (same block) ----------
grant select, insert, update, delete on public.temp_member_skills to authenticated;
grant all on public.temp_member_skills to service_role;
-- temp_assignments keeps its existing table-level grants; the new column
-- is covered automatically.
