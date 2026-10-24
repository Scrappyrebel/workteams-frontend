-- Customer Portal privacy/security alignment with Business HQ and Workforce.
-- WorkTeams links are bearer tokens scoped to one company/location. No shared identity.
-- All historical inspection notes, internal work descriptions, and legacy name-matched
-- temporary staffing requests remain private by default; no customer record is changed.

alter table public.temp_job_requests
  add column if not exists portal_token_id uuid references public.portal_tokens(id) on delete set null;

create index if not exists temp_job_requests_portal_token_recent_idx
  on public.temp_job_requests (portal_token_id,created_at desc)
  where portal_token_id is not null;

create table if not exists public.client_portal_inspection_publications (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  published boolean not null,
  customer_summary text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_portal_customer_summary_length
    check (customer_summary is null or char_length(customer_summary) between 10 and 600)
);

create index if not exists client_portal_publications_latest_idx
  on public.client_portal_inspection_publications(inspection_id,created_at desc,id desc);

alter table public.client_portal_inspection_publications enable row level security;
revoke all on table public.client_portal_inspection_publications
  from public,anon,authenticated;

-- Only this authenticated manager action can publish/withdraw customer-safe content.
-- Internal inspection notes/photos/checklists are NEVER included.
create or replace function public.set_client_portal_inspection_publication(
 p_inspection_id uuid, p_publish boolean, p_customer_summary text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 i public.inspections%rowtype;
 v_id uuid;
 v_summary text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into i from public.inspections where id=p_inspection_id for update;
 if i.id is null or i.company_id is null or i.location_id is null
 then raise exception 'Inspection is unavailable for customer publication'; end if;
 if not exists(
   select 1 from public.company_members m
   where m.company_id=i.company_id and m.user_id=auth.uid()
     and m.role in ('owner','admin')
 ) then raise exception 'Only the company owner or administrator may publish customer quality reports'; end if;
 if p_publish is null then raise exception 'Publication choice is required'; end if;
 v_summary:=nullif(btrim(coalesce(p_customer_summary,'')),'');
 if p_publish then
   if i.score is null then raise exception 'Finish the scored inspection first'; end if;
   if v_summary is null or char_length(v_summary)<10 or char_length(v_summary)>600
   then raise exception 'Write a customer-safe summary between 10 and 600 characters'; end if;
 else
   v_summary:=null;
 end if;
 insert into public.client_portal_inspection_publications(
   inspection_id,company_id,location_id,published,customer_summary,actor_user_id
 ) values(i.id,i.company_id,i.location_id,p_publish,v_summary,auth.uid())
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.set_client_portal_inspection_publication(uuid,boolean,text)
 from public,anon,authenticated;
grant execute on function public.set_client_portal_inspection_publication(uuid,boolean,text)
 to authenticated;

create or replace function public.get_client_portal_inspection_publication_for_manager(
 p_inspection_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 i public.inspections%rowtype;
 x record;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into i from public.inspections where id=p_inspection_id;
 if i.id is null or not exists (
  select 1 from public.company_members m where m.company_id=i.company_id
   and m.user_id=auth.uid() and m.role in ('owner','admin')
 ) then raise exception 'Quality publication management is not authorized'; end if;
 select published,customer_summary,created_at into x
 from public.client_portal_inspection_publications
 where inspection_id=i.id and company_id=i.company_id and location_id=i.location_id
 order by created_at desc,id desc limit 1;
 return jsonb_build_object(
  'published',coalesce(x.published,false),
  'customer_summary',x.customer_summary,
  'updated_at',x.created_at
 );
end $$;
revoke all on function public.get_client_portal_inspection_publication_for_manager(uuid)
 from public,anon,authenticated;
grant execute on function public.get_client_portal_inspection_publication_for_manager(uuid)
 to authenticated;

-- Public link reads now require explicit latest customer publication per inspection.
-- Temporary staffing records are visible only to the exact issuing portal-token
-- row, and internally written inspection notes and work descriptions never cross.
create or replace function public.get_portal_data(tok text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pt record;
  loc_name text;
  loc_address text;
begin
  select * into pt from public.portal_tokens where token = tok;
  if pt.id is null then
    return jsonb_build_object('ok', false, 'error', 'This link is not valid.');
  end if;
  if pt.expires_at is not null and pt.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'This link has expired.');
  end if;
  select name, address into loc_name, loc_address from public.locations where id = pt.location_id and company_id = pt.company_id;
  if loc_name is null then
    return jsonb_build_object('ok', false, 'error', 'This location is no longer available.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'client_name', pt.client_name,
    'location_name', loc_name,
    'location_address', loc_address,
    'temp_enabled', exists (
      select 1 from public.temp_agency_config
      where company_id = pt.company_id and enabled
    ),
    'temp_requests', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select id, service_type, cleaners_needed, hours_requested, hours_confirmed,
               job_date, status, site_address, created_at
        from public.temp_job_requests
        where company_id = pt.company_id
          and portal_token_id = pt.id
        order by created_at desc
        limit 20
      ) t
    ),
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
        select i.inspection_date, i.score, publication.customer_summary
        from public.inspections i
        join lateral (
          select pub.published,pub.customer_summary,pub.company_id,pub.location_id
          from public.client_portal_inspection_publications pub
          where pub.inspection_id = i.id
          order by pub.created_at desc,pub.id desc limit 1
        ) publication on publication.published = true
         and publication.company_id = i.company_id
         and publication.location_id = i.location_id
        where i.company_id = pt.company_id
          and i.location_id = pt.location_id
        order by inspection_date desc
        limit 5
      ) t
    ),
    'work_orders', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select title, null::text as description, status, priority, due_date
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
-- Grants survive CREATE OR REPLACE; re-assert for safety.
grant execute on function public.get_portal_data(text) to anon, authenticated;
