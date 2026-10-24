-- WorkTeams 059: safe, explicitly consented quality summaries for verified accounts.
-- No inspection notes, photos, checklist details, inspector identities or attachments.
-- Unpublished historical inspections remain invisible. Existing bearer links unchanged.
-- No company, contact or private-data permission is auto-enabled.

alter table public.client_portal_identity_management_events
 drop constraint if exists client_portal_identity_management_events_event_type_check;
alter table public.client_portal_identity_management_events
 add constraint client_portal_identity_management_events_event_type_check
 check(event_type in (
 'pilot_requested','pilot_cancelled','contact_approved','contact_revoked',
 'location_granted','login_activated','login_disabled',
 'quality_access_granted','quality_access_revoked'
 ));

-- Only an existing, active, same-company contact/location can receive this
-- additional permission. Manager cannot grant private files or other powers.
create or replace function public.set_workteams_customer_quality_access(
 p_company_id uuid,p_contact_id uuid,p_location_id uuid,p_allow boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if p_company_id is null or p_contact_id is null or p_location_id is null or
    p_allow is null or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized to change customer quality access.' using errcode='42501'; end if;
 if not exists(
  select 1 from public.client_portal_identity_settings s
  where s.company_id=p_company_id and s.pilot_requested=true
 ) then raise exception 'Company customer pilot is not requested.' using errcode='42501'; end if;
 update public.client_portal_location_grants g
 set can_view_quality=p_allow,updated_at=now()
 where g.company_id=p_company_id and g.contact_id=p_contact_id
  and g.location_id=p_location_id and g.revoked_at is null
  and g.can_view_requests=true
  and exists(select 1 from public.client_portal_contacts ct
     where ct.company_id=g.company_id and ct.id=g.contact_id
       and ct.status='active' and ct.revoked_at is null)
  and exists(select 1 from public.locations l
     where l.company_id=g.company_id and l.id=g.location_id);
 get diagnostics v_count=row_count;
 if v_count<>1 then
  raise exception 'An approved active contact and exact company location are required.' using errcode='42501'; end if;
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),
  case when p_allow then 'quality_access_granted' else 'quality_access_revoked' end);
 return jsonb_build_object('ok',true,'quality_access',p_allow);
end $$;
revoke all on function public.set_workteams_customer_quality_access(uuid,uuid,uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.set_workteams_customer_quality_access(uuid,uuid,uuid,boolean)
 to authenticated;

-- Extend only the protected owner/admin contact workboard readback with
-- exact-location quality permission. No direct table access is granted.
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
     'revoked',g.revoked_at is not null,'basic_portal',g.can_view_requests,
     'quality_access',g.can_view_quality) order by l.name)
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

create or replace function public.get_workteams_authenticated_quality_reports(
 p_company_id uuid,p_location_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_contact uuid;v_reports jsonb;
begin
 v_contact:=public.workteams_customer_authorized_location(p_company_id,p_location_id);
 if v_contact is null or not exists(
  select 1 from public.client_portal_location_grants g
  where g.company_id=p_company_id and g.contact_id=v_contact
   and g.location_id=p_location_id and g.can_view_quality=true
   and g.revoked_at is null
   and (g.starts_at is null or g.starts_at<=now())
   and (g.expires_at is null or g.expires_at>now())
 ) then raise exception 'Customer quality access is not authorized.' using errcode='42501'; end if;

 -- Snapshot contains ONLY fields previously cleared for publication on the
 -- existing bearer portal. The LATEST publication event must be published:
 -- withdrawing a report immediately hides even its earlier published versions.
 select coalesce(jsonb_agg(jsonb_build_object(
  'inspection_date',r.inspection_date,'score',r.score,
  'customer_summary',r.customer_summary
 ) order by r.inspection_date desc,r.id desc),'[]'::jsonb)
 into v_reports from (
   select i.id,i.inspection_date,i.score,pub.customer_summary
   from public.inspections i
   join lateral (
     select x.published,x.customer_summary,x.company_id,x.location_id
     from public.client_portal_inspection_publications x
     where x.inspection_id=i.id
     order by x.created_at desc,x.id desc limit 1
   ) pub on pub.published=true
     and pub.company_id=i.company_id and pub.location_id=i.location_id
   where i.company_id=p_company_id and i.location_id=p_location_id
     and i.score is not null and pub.customer_summary is not null
   order by i.inspection_date desc,i.id desc limit 10
 ) r;
 return jsonb_build_object('ok',true,'reports',v_reports);
end $$;
revoke all on function public.get_workteams_authenticated_quality_reports(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.get_workteams_authenticated_quality_reports(uuid,uuid)
 to authenticated;
