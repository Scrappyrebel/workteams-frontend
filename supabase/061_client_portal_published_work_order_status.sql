-- WorkTeams: independently approved customer-safe work-order status.
-- No existing order is published and no customer permission is granted.
-- Never expose internal descriptions, comments, assigned employees or pricing.
alter table public.client_portal_location_grants
 add column if not exists can_view_work_orders boolean not null default false;

alter table public.client_portal_identity_management_events
 drop constraint if exists client_portal_identity_management_events_event_type_check;
alter table public.client_portal_identity_management_events
 add constraint client_portal_identity_management_events_event_type_check
 check(event_type in (
 'pilot_requested','pilot_cancelled','contact_approved','contact_revoked',
 'location_granted','login_activated','login_disabled',
 'quality_access_granted','quality_access_revoked',
 'work_order_access_granted','work_order_access_revoked'
 ));

create table if not exists public.client_portal_work_order_publications(
 id uuid primary key default gen_random_uuid(),
 work_order_id uuid not null references public.work_orders(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 location_id uuid not null references public.locations(id) on delete cascade,
 published boolean not null,
 customer_title text,
 actor_user_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint customer_work_order_title_check check(
  (published=false and customer_title is null) or
  (published=true and customer_title is not null
    and char_length(btrim(customer_title)) between 8 and 140
    and customer_title !~* '(https?://|www[.]|[.]pdf|[.]docx?|[.]zip)')
 )
);
create index if not exists client_portal_work_order_latest_idx
 on public.client_portal_work_order_publications(work_order_id,created_at desc,id desc);
alter table public.client_portal_work_order_publications enable row level security;
revoke all on public.client_portal_work_order_publications
 from public,anon,authenticated;
grant all on public.client_portal_work_order_publications to service_role;

create or replace function public.set_workteams_customer_work_order_access(
 p_company_id uuid,p_contact_id uuid,p_location_id uuid,p_allow boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_updated integer;
begin
 if p_company_id is null or p_contact_id is null or p_location_id is null
   or p_allow is null or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized to change customer work-order access.' using errcode='42501'; end if;
 if not exists(select 1 from public.client_portal_identity_settings s
  where s.company_id=p_company_id and s.pilot_requested=true)
 then raise exception 'Customer pilot has not been requested.' using errcode='42501'; end if;
 update public.client_portal_location_grants g
 set can_view_work_orders=p_allow,updated_at=now()
 where g.company_id=p_company_id and g.contact_id=p_contact_id
  and g.location_id=p_location_id and g.revoked_at is null
  and g.can_view_requests=true
  and exists(select 1 from public.client_portal_contacts ct
   where ct.company_id=g.company_id and ct.id=g.contact_id
    and ct.status='active' and ct.revoked_at is null)
  and exists(select 1 from public.locations l
   where l.company_id=g.company_id and l.id=g.location_id);
 get diagnostics v_updated=row_count;
 if v_updated<>1 then
  raise exception 'Active company contact and exact location required.' using errcode='42501'; end if;
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),
  case when p_allow then 'work_order_access_granted' else 'work_order_access_revoked' end);
 return jsonb_build_object('ok',true,'work_order_access',p_allow);
end $$;
revoke all on function public.set_workteams_customer_work_order_access(uuid,uuid,uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.set_workteams_customer_work_order_access(uuid,uuid,uuid,boolean)
 to authenticated;

create or replace function public.set_workteams_work_order_publication(
 p_order_id uuid,p_publish boolean,p_customer_title text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.work_orders%rowtype;v_title text;v_id uuid;
begin
 if auth.uid() is null or p_order_id is null or p_publish is null
 then raise exception 'Manager authorization is required.' using errcode='42501'; end if;
 select * into v_order from public.work_orders w where w.id=p_order_id for update;
 if v_order.id is null or v_order.company_id is null or v_order.location_id is null
   or not public.workteams_client_portal_pilot_manager(v_order.company_id)
 then raise exception 'Manager authorization or work order location is unavailable.' using errcode='42501'; end if;
 v_title:=nullif(btrim(coalesce(p_customer_title,'')),'');
 if p_publish then
  if v_title is null or char_length(v_title) not between 8 and 140 or
    v_title ~* '(https?://|www[.]|[.]pdf|[.]docx?|[.]zip)'
  then raise exception 'Enter a safe public title between 8 and 140 characters, without links.' using errcode='22023'; end if;
 else v_title:=null;
 end if;
 insert into public.client_portal_work_order_publications(
  work_order_id,company_id,location_id,published,customer_title,actor_user_id)
 values(v_order.id,v_order.company_id,v_order.location_id,p_publish,v_title,auth.uid())
 returning id into v_id;
 return jsonb_build_object('ok',true,'publication_id',v_id,'published',p_publish);
end $$;
revoke all on function public.set_workteams_work_order_publication(uuid,boolean,text)
 from public,anon,authenticated;
grant execute on function public.set_workteams_work_order_publication(uuid,boolean,text)
 to authenticated;

create or replace function public.get_workteams_work_order_publication_for_manager(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_order public.work_orders%rowtype;v_publication record;
begin
 select * into v_order from public.work_orders w where w.id=p_order_id;
 if v_order.id is null or not public.workteams_client_portal_pilot_manager(v_order.company_id)
 then raise exception 'Not authorized to read work order publication.' using errcode='42501'; end if;
 select x.published,x.customer_title,x.created_at into v_publication
 from public.client_portal_work_order_publications x
 where x.work_order_id=p_order_id and x.company_id=v_order.company_id
  and x.location_id=v_order.location_id
 order by x.created_at desc,x.id desc limit 1;
 return jsonb_build_object('ok',true,'published',coalesce(v_publication.published,false),
  'customer_title',v_publication.customer_title,'updated_at',v_publication.created_at);
end $$;
revoke all on function public.get_workteams_work_order_publication_for_manager(uuid)
 from public,anon,authenticated;
grant execute on function public.get_workteams_work_order_publication_for_manager(uuid)
 to authenticated;

create or replace function public.get_workteams_authenticated_customer_work_orders(
 p_company_id uuid,p_location_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_contact uuid;v_items jsonb;
begin
 v_contact:=public.workteams_customer_authorized_location(p_company_id,p_location_id);
 if v_contact is null or not exists(
  select 1 from public.client_portal_location_grants g
  where g.company_id=p_company_id and g.contact_id=v_contact
   and g.location_id=p_location_id and g.can_view_work_orders=true
   and g.revoked_at is null
   and (g.starts_at is null or g.starts_at<=now())
   and (g.expires_at is null or g.expires_at>now())
 ) then raise exception 'Customer work-order access is not authorized.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'title',r.customer_title,'status',r.status,'due_date',r.due_date
 ) order by r.created_at desc),'[]'::jsonb)
 into v_items from (
  select w.id,w.status,w.due_date,w.created_at,pub.customer_title
  from public.work_orders w
  join lateral (
   select x.published,x.customer_title,x.company_id,x.location_id
   from public.client_portal_work_order_publications x
   where x.work_order_id=w.id
   order by x.created_at desc,x.id desc limit 1
  ) pub on pub.published=true and pub.company_id=w.company_id
   and pub.location_id=w.location_id
  where w.company_id=p_company_id and w.location_id=p_location_id
   and w.status in ('open','in_progress','completed','cancelled')
  order by w.created_at desc,w.id desc limit 20
 ) r;
 return jsonb_build_object('ok',true,'work_orders',v_items);
end $$;
revoke all on function public.get_workteams_authenticated_customer_work_orders(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.get_workteams_authenticated_customer_work_orders(uuid,uuid)
 to authenticated;

-- Retain existing onboarding readiness boolean and published-quality grants.
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
   join auth.users u on u.id=il.auth_user_id
   where il.company_id=ct.company_id and il.contact_id=ct.id
    and il.email_normalized=ct.email_normalized
    and il.status='active' and il.revoked_at is null
    and il.verified_at is not null and u.email_confirmed_at is not null
    and lower(btrim(u.email))=ct.email_normalized
  ),
  'locations',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',g.location_id,'name',l.name,
     'revoked',g.revoked_at is not null,
     'basic_portal',g.can_view_requests,
     'quality_access',g.can_view_quality,
     'work_order_access',g.can_view_work_orders,
     'active',g.revoked_at is null and g.can_view_requests
       and (g.starts_at is null or g.starts_at<=now())
       and (g.expires_at is null or g.expires_at>now())
   ) order by l.name)
   from public.client_portal_location_grants g
   join public.locations l on l.id=g.location_id and l.company_id=g.company_id
   where g.company_id=ct.company_id and g.contact_id=ct.id
  ),'[]'::jsonb)
 ) order by ct.created_at desc),'[]'::jsonb)
 into v_rows from public.client_portal_contacts ct
 where ct.company_id=p_company_id;
 select s.enabled into v_enabled from public.client_portal_identity_settings s
 where s.company_id=p_company_id;
 return jsonb_build_object('ok',true,'contacts',v_rows,
  'customer_login_enabled',coalesce(v_enabled,false));
end $$;
revoke all on function public.list_workteams_customer_identity_contacts(uuid)
 from public,anon,authenticated;
grant execute on function public.list_workteams_customer_identity_contacts(uuid)
 to authenticated;
