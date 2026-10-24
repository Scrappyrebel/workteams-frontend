-- WorkTeams 060: verified customer onboarding readiness readback.
-- NO customer activation, enrollment, invitation sending, or policy expansion.
-- Manager-only RPC; account state is a boolean, never a password/token/user ID.
-- Retains the exact location-grant and quality flags used by the existing UI.

create or replace function public.list_workteams_customer_identity_contacts(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;v_enabled boolean;
begin
 if p_company_id is null or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',ct.id,'email',ct.email_normalized,'name',ct.display_name,
  'status',ct.status,'language',ct.invite_language,
  -- Verified customer has actually claimed this approved contact in Auth.
  -- No identity identifiers, password details or tokens in the JSON result.
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
    select jsonb_agg(jsonb_build_object('id',g.location_id,'name',l.name,
     'revoked',g.revoked_at is not null,
     'basic_portal',g.can_view_requests,
     'quality_access',g.can_view_quality,
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
