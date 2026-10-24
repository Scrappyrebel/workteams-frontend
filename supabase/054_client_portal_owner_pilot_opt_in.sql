-- WorkTeams authenticated-customer pilot enrollment only.
-- Actual customer login remains OFF. This is not a feature activation.
alter table public.client_portal_identity_settings
 add column if not exists pilot_requested boolean not null default false,
 add column if not exists pilot_requested_at timestamptz,
 add column if not exists pilot_requested_by uuid references auth.users(id) on delete set null;

create table if not exists public.client_portal_identity_management_events(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 actor_user_id uuid references auth.users(id) on delete set null,
 event_type text not null check(event_type in ('pilot_requested','pilot_cancelled')),
 created_at timestamptz not null default now()
);
alter table public.client_portal_identity_management_events enable row level security;
revoke all on public.client_portal_identity_management_events from public,anon,authenticated;
grant all on public.client_portal_identity_management_events to service_role;

-- No direct table access needed. Verify live JWT and exact owner/admin membership.
create or replace function public.workteams_client_portal_pilot_manager(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and
  nullif(lower(trim(coalesce(auth.jwt()->>'email',''))),'') is not null and
  exists(
   select 1 from public.company_members m
   where m.company_id=p_company_id and m.user_id=auth.uid()
    and m.role in ('owner','admin')
    and lower(trim(m.email))=lower(trim(coalesce(auth.jwt()->>'email','')))
  )
$$;
revoke all on function public.workteams_client_portal_pilot_manager(uuid)
 from public,anon,authenticated;

create or replace function public.get_workteams_client_portal_pilot_status(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_requested boolean;
begin
 if p_company_id is null or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized to manage this company customer portal.' using errcode='42501'; end if;
 select s.pilot_requested into v_requested
 from public.client_portal_identity_settings s where s.company_id=p_company_id;
 return jsonb_build_object('ok',true,'pilot_requested',coalesce(v_requested,false),
   'customer_login_enabled',false);
end $$;
revoke all on function public.get_workteams_client_portal_pilot_status(uuid)
 from public,anon,authenticated;
grant execute on function public.get_workteams_client_portal_pilot_status(uuid)
 to authenticated;

create or replace function public.set_workteams_client_portal_pilot_request(
 p_company_id uuid,p_requested boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_requested boolean;
begin
 if p_company_id is null or p_requested is null or
   not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized to manage this company customer portal.' using errcode='42501'; end if;
 if not exists(select 1 from public.companies where id=p_company_id) then
  raise exception 'Company not available.' using errcode='42501'; end if;
 insert into public.client_portal_identity_settings(
  company_id,enabled,pilot_requested,pilot_requested_at,pilot_requested_by,updated_at)
 values(p_company_id,false,p_requested,
   case when p_requested then now() else null end,
   case when p_requested then auth.uid() else null end,now())
 on conflict(company_id) do update set
  pilot_requested=excluded.pilot_requested,
  pilot_requested_at=excluded.pilot_requested_at,
  pilot_requested_by=excluded.pilot_requested_by,
  updated_at=now()
 returning pilot_requested into v_requested;
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),case when v_requested then 'pilot_requested' else 'pilot_cancelled' end);
 return jsonb_build_object('ok',true,'pilot_requested',v_requested,
  'customer_login_enabled',false);
end $$;
revoke all on function public.set_workteams_client_portal_pilot_request(uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.set_workteams_client_portal_pilot_request(uuid,boolean)
 to authenticated;
