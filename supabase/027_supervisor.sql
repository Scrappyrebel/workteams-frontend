-- ============ 027: supervisor role data access ============
-- Supervisors (new role) get team visibility: everyone's time entries and
-- the ability to create inspections. Everything financial, destructive, or
-- administrative stays owner/admin-only. No other policies change.

-- time_entries: supervisors read the team's in/out times (own or supervisor+).
drop policy if exists "time select own or manager" on public.time_entries;
create policy "time select own or supervisor+"
  on public.time_entries for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = time_entries.company_id
        and m.user_id = auth.uid()
        and (m.id = time_entries.member_id or m.role in ('owner', 'admin', 'supervisor'))
    )
  );

-- inspections: supervisors can run quality checks, not just view them.
drop policy if exists "inspections insert if owner/admin" on public.inspections;
create policy "inspections insert if supervisor+"
  on public.inspections for insert
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = inspections.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'supervisor')
    )
  );
