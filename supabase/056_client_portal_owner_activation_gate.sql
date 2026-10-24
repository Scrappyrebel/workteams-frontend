-- WorkTeams controlled owner-only authenticated customer login activation.
-- No company is activated by this migration. Feature starts OFF everywhere.
-- Activation enables only the existing company/location name picker, NOT
-- private contract, billing, payment, employee, document or signing access.

alter table public.client_portal_identity_management_events
 drop constraint if exists client_portal_identity_management_events_event_type_check;
alter table public.client_portal_identity_management_events
 add constraint client_portal_identity_management_events_event_type_check
 check(event_type in (
  'pilot_requested','pilot_cancelled','contact_approved',
  'contact_revoked','location_granted','login_activated','login_disabled'
 ));

create or replace function public.workteams_client_portal_pilot_owner(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.workteams_client_portal_pilot_manager(p_company_id) and exists (
  select 1 from public.company_members m
  join auth.users u on u.id=m.user_id
  where m.company_id=p_company_id and m.user_id=auth.uid()
   and m.role='owner' and u.email_confirmed_at is not null
   and lower(btrim(m.email))=lower(btrim(u.email))
   and lower(btrim(u.email))=lower(btrim(coalesce(auth.jwt()->>'email','')))
 )
$$;
revoke all on function public.workteams_client_portal_pilot_owner(uuid)
 from public,anon,authenticated;

create or replace function public.get_workteams_client_portal_pilot_status(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_requested boolean;v_enabled boolean;
begin
 if p_company_id is null or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized to manage this customer portal.' using errcode='42501'; end if;
 select s.pilot_requested,s.enabled into v_requested,v_enabled
 from public.client_portal_identity_settings s where s.company_id=p_company_id;
 return jsonb_build_object('ok',true,'pilot_requested',coalesce(v_requested,false),
  'customer_login_enabled',coalesce(v_enabled,false),
  'can_activate',public.workteams_client_portal_pilot_owner(p_company_id));
end $$;
revoke all on function public.get_workteams_client_portal_pilot_status(uuid)
 from public,anon,authenticated;
grant execute on function public.get_workteams_client_portal_pilot_status(uuid)
 to authenticated;

create or replace function public.list_workteams_customer_identity_contacts(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;v_enabled boolean;
begin
 if p_company_id is null or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',ct.id,'email',ct.email_normalized,'name',ct.display_name,
  'status',ct.status,'language',ct.invite_language,
  'locations',coalesce((
    select jsonb_agg(jsonb_build_object('id',g.location_id,'name',l.name,
     'revoked',g.revoked_at is not null,'basic_portal',g.can_view_requests))
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

create or replace function public.set_workteams_client_portal_pilot_request(
 p_company_id uuid,p_requested boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_requested boolean;v_enabled boolean;
begin
 if p_company_id is null or p_requested is null or
  not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized.' using errcode='42501'; end if;
 if not exists(select 1 from public.companies where id=p_company_id)
 then raise exception 'Company unavailable.' using errcode='42501'; end if;
 if p_requested=false and exists(
   select 1 from public.client_portal_identity_settings s
   where s.company_id=p_company_id and s.enabled=true)
 then raise exception 'Disable customer logins before withdrawing the pilot.' using errcode='22023'; end if;
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
 returning pilot_requested,enabled into v_requested,v_enabled;
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),case when v_requested then 'pilot_requested' else 'pilot_cancelled' end);
 return jsonb_build_object('ok',true,'pilot_requested',v_requested,
  'customer_login_enabled',v_enabled);
end $$;
revoke all on function public.set_workteams_client_portal_pilot_request(uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.set_workteams_client_portal_pilot_request(uuid,boolean)
 to authenticated;

create or replace function public.set_workteams_customer_login_activation(
 p_company_id uuid,p_enabled boolean,p_confirmation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_settings public.client_portal_identity_settings%rowtype;
begin
 if p_company_id is null or p_enabled is null or
  not public.workteams_client_portal_pilot_owner(p_company_id)
 then raise exception 'Only the verified company owner may change customer login activation.' using errcode='42501'; end if;
 if (p_enabled and p_confirmation<>'ACTIVATE') or
    (not p_enabled and p_confirmation<>'DISABLE')
 then raise exception 'Exact activation confirmation required.' using errcode='22023'; end if;
 select * into v_settings from public.client_portal_identity_settings
 where company_id=p_company_id for update;
 if v_settings.company_id is null or not v_settings.pilot_requested
 then raise exception 'Request the pilot for this company first.' using errcode='22023'; end if;
 if p_enabled and not exists(
  select 1 from public.client_portal_contacts ct
  join public.client_portal_location_grants g
    on g.company_id=ct.company_id and g.contact_id=ct.id
  join public.locations l on l.id=g.location_id and l.company_id=g.company_id
  where ct.company_id=p_company_id and ct.status='active' and ct.revoked_at is null
   and g.can_view_requests=true and g.revoked_at is null
   and (g.starts_at is null or g.starts_at<=now())
   and (g.expires_at is null or g.expires_at>now())
 ) then raise exception 'Approve a specific customer and location before activation.' using errcode='22023'; end if;
 if v_settings.enabled=p_enabled then
  return jsonb_build_object('ok',true,'customer_login_enabled',p_enabled,'unchanged',true);
 end if;
 update public.client_portal_identity_settings
 set enabled=p_enabled,enabled_by=case when p_enabled then auth.uid() else enabled_by end,
 enabled_at=case when p_enabled then now() else enabled_at end,updated_at=now()
 where company_id=p_company_id;
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),case when p_enabled then 'login_activated' else 'login_disabled' end);
 return jsonb_build_object('ok',true,'customer_login_enabled',p_enabled);
end $$;
revoke all on function public.set_workteams_customer_login_activation(uuid,boolean,text)
 from public,anon,authenticated;
grant execute on function public.set_workteams_customer_login_activation(uuid,boolean,text)
 to authenticated;
