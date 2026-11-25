-- Additive release repair. No historical punches or proof rows are removed.
alter table public.companies add column if not exists industry_key text;
-- Existing explicit cleaning-only service configuration is the authority;
-- never infer an industry from a business name.
update public.companies c set industry_key='janitorial_cleaning'
from public.temp_agency_config t
where t.company_id=c.id and c.industry_key is null
  and t.staffing_types=array['cleaning']::text[];

alter table public.locations
  add column if not exists require_walkthrough_video boolean not null default true,
  add column if not exists require_book_photo boolean not null default true;
grant select(industry_key),update(industry_key) on public.companies to authenticated;
grant select(require_walkthrough_video,require_book_photo),
  update(require_walkthrough_video,require_book_photo) on public.locations to authenticated;

-- An application precheck alone cannot serialize concurrent devices.
-- Creation aborts safely if an unresolved duplicate is ever present.
create unique index if not exists time_entries_one_open_per_member
on public.time_entries(company_id,member_id) where clock_out is null;

alter table public.time_entries
  add column if not exists clock_in_received_at timestamptz,
  add column if not exists clock_out_received_at timestamptz;
grant select(clock_in_received_at,clock_out_received_at) on public.time_entries to authenticated;
-- Existing records remain NULL: their historical receipt time is unknown.
create or replace function public.stamp_time_punch_receipt()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    new.clock_in_received_at=clock_timestamp();
    new.clock_out_received_at=case when new.clock_out is not null then clock_timestamp() else null end;
  else
    new.clock_in_received_at=old.clock_in_received_at;
    new.clock_out_received_at=case when old.clock_out is null and new.clock_out is not null
      then clock_timestamp() else old.clock_out_received_at end;
  end if;
  return new;
end $$;
revoke all on function public.stamp_time_punch_receipt() from public,anon,authenticated;
drop trigger if exists stamp_time_punch_receipt on public.time_entries;
create trigger stamp_time_punch_receipt before insert or update on public.time_entries
for each row execute function public.stamp_time_punch_receipt();

create or replace function public.guard_cleaning_communication_book()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.companies c where c.id=new.company_id
    and c.industry_key='janitorial_cleaning' and c.enable_comm_book is not false) then
    raise exception 'Communication Book is not enabled for this cleaning company' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_cleaning_communication_book() from public,anon,authenticated;
drop trigger if exists guard_cleaning_communication_book on public.comm_book;
create trigger guard_cleaning_communication_book before insert on public.comm_book
for each row execute function public.guard_cleaning_communication_book();
