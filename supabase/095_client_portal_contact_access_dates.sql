-- WorkTeams 095: manager-side Client Portal depth (D-WT-32).
-- ADDITIVE PAYLOAD ONLY. The manager-gated identity-contacts RPC already
-- decides who may read a company's approved customer contacts; the contact
-- approval date (client_portal_contacts.approved_at, written by the approve
-- RPC in 055) and the verified-account link date
-- (client_portal_identity_links.verified_at, written when a customer claims
-- their approved contact) are stored but were never returned, so managers
-- could see THAT a contact was approved / linked but never WHEN.
-- This replaces the function from 064 with the identical body plus those
-- two stored dates. No table changes, no new objects, no policy changes,
-- no identity identifiers, passwords or tokens are added to the payload:
-- the new fields are dates on rows the same manager gate already returns.
-- The manager page tolerates payloads without the new keys, so the app
-- works exactly as before until this runs, and shows the dates after.

create or replace function public.list_workteams_customer_identity_contacts(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;v_enabled boolean;
begin
 if p_company_id is null or not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',ct.id,'email',ct.email_normalized,'name',ct.display_name,
  'status',ct.status,'language',ct.invite_language,
  'approved_at',ct.approved_at,
  'account_linked',exists(
    select 1 from public.client_portal_identity_links il
    join auth.users au on au.id=il.auth_user_id
    where il.company_id=ct.company_id and il.contact_id=ct.id
      and il.email_normalized=ct.email_normalized
      and il.status='active' and il.revoked_at is null and il.verified_at is not null
      and au.email_confirmed_at is not null and lower(btrim(au.email))=ct.email_normalized),
  'account_linked_at',(
    select max(il.verified_at) from public.client_portal_identity_links il
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
