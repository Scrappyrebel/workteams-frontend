-- New permission must never revive when owner reapproves revoked email.
-- Preserve existing manager-only validation and reset ALL separately approved
-- private grants. Return actual company enabled flag, not a hard-coded value.
create or replace function public.approve_workteams_customer_identity_contact(
 p_company_id uuid,p_email text,p_name text,p_language text,p_location_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text;v_id uuid;v_changed boolean;
begin
 if p_company_id is null or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized.' using errcode='42501'; end if;
 if not exists(select 1 from public.client_portal_identity_settings s
               where s.company_id=p_company_id and s.pilot_requested=true)
 then raise exception 'Request the company pilot first.' using errcode='42501'; end if;
 v_email:=lower(btrim(coalesce(p_email,'')));
 if char_length(v_email)>254 or char_length(v_email)<5 or
    v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or
    char_length(btrim(coalesce(p_name,'')))<2 or
    char_length(btrim(coalesce(p_name,'')))>120 or
    p_language not in ('en','es') or
    p_location_id is null or
    not exists(select 1 from public.locations l
       where l.id=p_location_id and l.company_id=p_company_id)
 then raise exception 'Valid approved email, name, language and company location are required.' using errcode='22023'; end if;

 insert into public.client_portal_contacts(
  company_id,email_normalized,display_name,status,invite_language,
  approved_by,approved_at,revoked_at,updated_at)
 values(p_company_id,v_email,btrim(p_name),'active',p_language,
        auth.uid(),now(),null,now())
 on conflict(company_id,email_normalized) do update set
   display_name=excluded.display_name,status='active',
   invite_language=excluded.invite_language,
   approved_by=excluded.approved_by,approved_at=now(),
   revoked_at=null,updated_at=now()
 returning id into v_id;

 -- Grant only basic location membership/summary (no documents, contracts,
 -- signing, quality publications, invoices, employee or payment records).
 insert into public.client_portal_location_grants(
  company_id,contact_id,location_id,can_view_requests,can_view_contracts,
  can_view_quality,can_view_documents,can_request_services,can_sign,
  can_view_work_orders,
  approved_by,revoked_at)
 values(p_company_id,v_id,p_location_id,true,false,false,false,false,false,
        false,auth.uid(),null)
 on conflict(company_id,contact_id,location_id) do update set
  can_view_requests=true,
  can_view_contracts=false,can_view_quality=false,
  can_view_documents=false,can_request_services=false,can_sign=false,
  can_view_work_orders=false,
  revoked_at=null,approved_by=excluded.approved_by,updated_at=now();
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),'contact_approved');
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),'location_granted');
 return jsonb_build_object('ok',true,'contact_id',v_id,
  'customer_login_enabled',(
    select s.enabled from public.client_portal_identity_settings s
    where s.company_id=p_company_id));
end $$;
revoke all on function public.approve_workteams_customer_identity_contact(uuid,text,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.approve_workteams_customer_identity_contact(uuid,text,text,text,uuid)
 to authenticated;
