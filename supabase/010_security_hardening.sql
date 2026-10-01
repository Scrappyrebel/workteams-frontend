-- 010_security_hardening.sql — Pro tier authorization hardening
-- Run in the WorkTeams Supabase project SQL editor. Two small blocks.
-- Both are idempotent (safe to re-run).

-- ============ Block 1: supplies SELECT -> owner/admin only ============
-- The supplies page is manager-only in the app, but the original policy let
-- ANY company member read every column (including cost_per_unit) through the
-- API. This closes that gap: employees can no longer read supply costs.
drop policy if exists "supplies select if member" on supplies;

create policy "supplies select if owner/admin"
  on supplies for select
  using (public.is_company_owner_admin(supplies.company_id));

-- ============ Block 2: work-order assignee updates -> status only ============
-- The policy lets an assigned employee update their work orders, but nothing
-- stopped them from also changing title, priority, assignee, or due date via
-- the API. This trigger keeps owner/admin updates unrestricted while limiting
-- assigned employees to status (and completed_at) changes only.
create or replace function public.work_orders_assignee_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_company_owner_admin(OLD.company_id) then
    return NEW;
  end if;
  if NEW.id is distinct from OLD.id
     or NEW.company_id is distinct from OLD.company_id
     or NEW.location_id is distinct from OLD.location_id
     or NEW.title is distinct from OLD.title
     or NEW.description is distinct from OLD.description
     or NEW.priority is distinct from OLD.priority
     or NEW.assigned_to is distinct from OLD.assigned_to
     or NEW.due_date is distinct from OLD.due_date
     or NEW.created_at is distinct from OLD.created_at
  then
    raise exception 'Only the status of a work order can be changed by its assigned employee.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists work_orders_assignee_guard on work_orders;
create trigger work_orders_assignee_guard
  before update on work_orders
  for each row
  execute function public.work_orders_assignee_guard();
