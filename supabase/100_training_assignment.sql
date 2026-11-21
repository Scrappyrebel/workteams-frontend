-- 100: Who assigned a training enrollment
-- (Wendy, WorkTeams page-by-page walkthrough, 2026-11-19, item #24).
--
-- Managers assign courses to a person from the Training Records
-- page; until now a course could only be started by the person
-- taking it, and nothing recorded the difference. This column
-- records the manager who made the assignment (NULL = the person
-- started the course themselves), so the records page can say
-- "Assigned by …" and the results that come back are tied to the
-- assignment.
--
-- No policy change is needed: migration 021's "members own
-- enrollments" and "progress via enrollment" policies already let
-- a company owner/admin create enrollments and seed step progress
-- for their company's members (is_company_owner_admin), and the
-- records page already reads those rows back for managers.
--
-- Additive only. public.training_enrollments already carries
-- table-level grants and RLS policies (migration 021); the new
-- column is covered by them.

begin;

alter table public.training_enrollments
  add column if not exists assigned_by_member_id uuid
    references public.company_members(id) on delete set null;

commit;
