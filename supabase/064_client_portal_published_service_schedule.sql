-- 064: customer-safe service visit publication for WorkTeams.
-- No company, shift, contact or customer permission is activated by migration.
-- Private staffing assignments, shift notes and employee identity stay hidden.
alter table public.client_portal_location_grants
 add column if not exists can_view_schedule boolean not null default false;

create unique index if not exists shifts_company_location_id_unique
 on public.shifts(company_id,location_id,id);

create table if not exists public.client_portal_service_schedule_publications (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 location_id uuid not null,
 shift_id uuid not null,
 published boolean not null,
 public_note text,
 shift_date date not null,
 start_time time not null,
 end_time time not null,
 actor_user_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 foreign key(company_id,location_id,shift_id)
  references public.shifts(company_id,location_id,id) on delete cascade,
 constraint client_portal_schedule_public_note_limit check (
   public_note is null or char_length(public_note) between 5 and 300)
);
create index if not exists client_portal_service_schedule_latest_idx
 on public.client_portal_service_schedule_publications
 (company_id,location_id,shift_id,created_at desc,id desc);
alter table public.client_portal_service_schedule_publications enable row level security;
revoke all on public.client_portal_service_schedule_publications from public,anon,authenticated;
grant all on public.client_portal_service_schedule_publications to service_role;

alter table public.client_portal_identity_management_events
 drop constraint if exists client_portal_identity_management_events_event_type_check;
alter table public.client_portal_identity_management_events
 add constraint client_portal_identity_management_events_event_type_check
 check(event_type in (
 'pilot_requested','pilot_cancelled','contact_approved','contact_revoked',
 'location_granted','login_activated','login_disabled',
 'quality_access_granted','quality_access_revoked',
 'work_order_access_granted','work_order_access_revoked',
 'document_access_granted','document_access_revoked',
 'schedule_access_granted','schedule_access_revoked'
 ));

create or replace function public.set_workteams_customer_schedule_access(
 p_company_id uuid,p_contact_id uuid,p_location_id uuid,p_allow boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if p_company_id is null or p_contact_id is null or p_location_id is null
 or p_allow is null or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized to change customer schedule access.' using errcode='42501'; end if;
 if not exists (select 1 from public.client_portal_identity_settings s
                where s.company_id=p_company_id and s.pilot_requested)
 then raise exception 'Customer pilot not requested.' using errcode='42501'; end if;
 update public.client_portal_location_grants g
 set can_view_schedule=p_allow,updated_at=now()
 where g.company_id=p_company_id and g.contact_id=p_contact_id
  and g.location_id=p_location_id and g.revoked_at is null
  and g.can_view_requests=true
  and exists(select 1 from public.client_portal_contacts ct
    where ct.company_id=p_company_id and ct.id=p_contact_id
    and ct.status='active' and ct.revoked_at is null)
  and exists(select 1 from public.locations l
    where l.company_id=p_company_id and l.id=p_location_id);
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Active contact and exact company location required.' using errcode='42501'; end if;
 insert into public.client_portal_identity_management_events(company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),case when p_allow then
 'schedule_access_granted' else 'schedule_access_revoked' end);
 return jsonb_build_object('ok',true,'schedule_access',p_allow);
end $$;
revoke all on function public.set_workteams_customer_schedule_access(uuid,uuid,uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.set_workteams_customer_schedule_access(uuid,uuid,uuid,boolean)
 to authenticated;

create or replace function public.set_workteams_customer_service_visit_publication(
 p_company_id uuid,p_shift_id uuid,p_publish boolean,p_public_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_shift public.shifts%rowtype;v_note text;v_id uuid;
begin
 if p_company_id is null or p_shift_id is null or p_publish is null
 or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized to publish customer visits.' using errcode='42501'; end if;
 select * into v_shift from public.shifts
 where id=p_shift_id and company_id=p_company_id and location_id is not null for update;
 if v_shift.id is null then raise exception 'Company shift not found.' using errcode='42501'; end if;
 if v_shift.shift_date<current_date or v_shift.shift_date>current_date+60
 then raise exception 'Only upcoming service visits within 60 days can be published.' using errcode='22023'; end if;
 v_note:=nullif(btrim(coalesce(p_public_note,'')),'');
 if p_publish and v_note is not null and char_length(v_note) not between 5 and 300
 then raise exception 'Customer-safe note must be 5 to 300 characters.' using errcode='22023'; end if;
 if not p_publish then v_note:=null; end if;
 insert into public.client_portal_service_schedule_publications(
  company_id,location_id,shift_id,published,public_note,shift_date,
  start_time,end_time,actor_user_id)
 values(p_company_id,v_shift.location_id,v_shift.id,p_publish,v_note,
  v_shift.shift_date,v_shift.start_time,v_shift.end_time,auth.uid())
 returning id into v_id;
 return jsonb_build_object('ok',true,'publication_id',v_id,'published',p_publish);
end $$;
revoke all on function public.set_workteams_customer_service_visit_publication(
 uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.set_workteams_customer_service_visit_publication(
 uuid,uuid,boolean,text) to authenticated;

create or replace function public.list_workteams_customer_service_visits_for_manager(
 p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;
begin
 if p_company_id is null or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',x.id,'location_id',x.location_id,'location_name',x.location_name,
   'date',x.shift_date,'start',x.start_time,'end',x.end_time,
   'published',x.is_published,'public_note',x.safe_note
 ) order by x.shift_date,x.start_time,x.id),'[]'::jsonb)
 into v_items from (
   select s.id,s.location_id,l.name as location_name,
    s.shift_date,s.start_time,s.end_time,
    (coalesce(pub.published,false) and pub.shift_date=s.shift_date
      and pub.start_time=s.start_time and pub.end_time=s.end_time) as is_published,
    case when pub.published and pub.shift_date=s.shift_date
      and pub.start_time=s.start_time and pub.end_time=s.end_time
      then pub.public_note else null end as safe_note
   from public.shifts s
   join public.locations l on l.id=s.location_id and l.company_id=s.company_id
   left join lateral (
     select p.published,p.public_note,p.shift_date,p.start_time,p.end_time
     from public.client_portal_service_schedule_publications p
     where p.company_id=s.company_id and p.location_id=s.location_id
       and p.shift_id=s.id order by p.created_at desc,p.id desc limit 1
   ) pub on true
   where s.company_id=p_company_id and s.shift_date>=current_date
     and s.shift_date<=current_date+30
   order by s.shift_date,s.start_time,s.id limit 60
 ) x;
 return jsonb_build_object('ok',true,'visits',v_items);
end $$;
revoke all on function public.list_workteams_customer_service_visits_for_manager(uuid)
 from public,anon,authenticated;
grant execute on function public.list_workteams_customer_service_visits_for_manager(uuid)
 to authenticated;

create or replace function public.get_workteams_authenticated_service_schedule(
 p_company_id uuid,p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_contact uuid;v_items jsonb;
begin
 v_contact:=public.workteams_customer_authorized_location(p_company_id,p_location_id);
 if v_contact is null or not exists(
  select 1 from public.client_portal_location_grants g
  where g.company_id=p_company_id and g.contact_id=v_contact
   and g.location_id=p_location_id and g.can_view_schedule=true
   and g.revoked_at is null and g.can_view_requests=true
   and (g.starts_at is null or g.starts_at<=now())
   and (g.expires_at is null or g.expires_at>now())
 ) then raise exception 'Customer schedule access is not authorized.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'date',x.shift_date,'start',x.start_time,'end',x.end_time,
  'note',x.public_note
 ) order by x.shift_date,x.start_time),'[]'::jsonb)
 into v_items from (
   select s.shift_date,s.start_time,s.end_time,pub.public_note
   from public.shifts s
   join lateral (
     select p.published,p.public_note,p.shift_date,p.start_time,p.end_time
     from public.client_portal_service_schedule_publications p
     where p.company_id=s.company_id and p.location_id=s.location_id
      and p.shift_id=s.id
     order by p.created_at desc,p.id desc limit 1
   ) pub on pub.published=true and pub.shift_date=s.shift_date
     and pub.start_time=s.start_time and pub.end_time=s.end_time
   where s.company_id=p_company_id and s.location_id=p_location_id
    and s.shift_date>=current_date and s.shift_date<=current_date+30
   order by s.shift_date,s.start_time,s.id limit 20
 ) x;
 return jsonb_build_object('ok',true,'visits',v_items);
end $$;
revoke all on function public.get_workteams_authenticated_service_schedule(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.get_workteams_authenticated_service_schedule(uuid,uuid)
 to authenticated;

-- Preserve previous contact readiness/quality/work-order/document flags, adding
-- ONLY a separate per-location schedule consent indicator for managers.
create or replace function public.list_workteams_customer_identity_contacts(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;v_enabled boolean;
begin
 if p_company_id is null or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',ct.id,'email',ct.email_normalized,'name',ct.display_name,
  'status',ct.status,'language',ct.invite_language,
  'account_linked',exists(
    select 1 from public.client_portal_identity_links il
    join auth.users au on au.id=il.auth_user_id
    where il.company_id=ct.company_id and il.contact_id=ct.id
      and il.email_normalized=ct.email_normalized
      and il.status='active' and il.revoked_at is null and il.verified_at is not null
      and au.email_confirmed_at is not null and lower(btrim(au.email))=ct.email_normalized),
  'locations',coalesce((
    select jsonb_agg(jsonb_build_object(
     'id',g.location_id,'name',l.name,
     'revoked',g.revoked_at is not null,'basic_portal',g.can_view_requests,
     'quality_access',g.can_view_quality,
     'work_order_access',g.can_view_work_orders,
     'document_access',g.can_view_documents,
     'schedule_access',g.can_view_schedule,
     'active',g.revoked_at is null
       and g.can_view_requests=true
       and (g.starts_at is null or g.starts_at<=now())
       and (g.expires_at is null or g.expires_at>now()))
    order by l.name)
    from public.client_portal_location_grants g
    join public.locations l on l.id=g.location_id and l.company_id=g.company_id
    where g.company_id=ct.company_id and g.contact_id=ct.id
  ),'[]'::jsonb)
 ) order by ct.created_at desc),'[]'::jsonb)
 into v_rows from public.client_portal_contacts ct where ct.company_id=p_company_id;
 select s.enabled into v_enabled from public.client_portal_identity_settings s
 where s.company_id=p_company_id;
 return jsonb_build_object('ok',true,'contacts',v_rows,
  'customer_login_enabled',coalesce(v_enabled,false));
end $$;
revoke all on function public.list_workteams_customer_identity_contacts(uuid)
 from public,anon,authenticated;
grant execute on function public.list_workteams_customer_identity_contacts(uuid)
 to authenticated;
