-- WorkTeams customer identity onboarding: approved contact/location only.
-- All customer account data remains feature-disabled for every company until
-- a separately authorized production activation and acceptance release.
-- Existing public /portal/[token] is deliberately untouched.

alter table public.client_portal_identity_management_events
 drop constraint if exists client_portal_identity_management_events_event_type_check;
alter table public.client_portal_identity_management_events
 add constraint client_portal_identity_management_events_event_type_check
 check(event_type in ('pilot_requested','pilot_cancelled',
                      'contact_approved','contact_revoked','location_granted'));

-- Prevent two independent Supabase accounts from claiming the same customer
-- contact in a single tenant. A manager must explicitly revoke an old login.
create unique index if not exists client_portal_one_identity_per_contact
 on public.client_portal_identity_links(company_id,contact_id);

create or replace function public.list_workteams_customer_identity_contacts(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;
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
 into v_rows
 from public.client_portal_contacts ct where ct.company_id=p_company_id;
 return jsonb_build_object('ok',true,'contacts',v_rows,
  'customer_login_enabled',false);
end $$;
revoke all on function public.list_workteams_customer_identity_contacts(uuid)
 from public,anon,authenticated;
grant execute on function public.list_workteams_customer_identity_contacts(uuid)
 to authenticated;

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
  company_id,contact_id,location_id,can_view_requests,approved_by,revoked_at)
 values(p_company_id,v_id,p_location_id,true,auth.uid(),null)
 on conflict(company_id,contact_id,location_id) do update set
  can_view_requests=true,revoked_at=null,approved_by=excluded.approved_by,
  updated_at=now();
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),'contact_approved');
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),'location_granted');
 return jsonb_build_object('ok',true,'contact_id',v_id,
  'customer_login_enabled',false);
end $$;
revoke all on function public.approve_workteams_customer_identity_contact(
 uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.approve_workteams_customer_identity_contact(
 uuid,text,text,text,uuid) to authenticated;

create or replace function public.revoke_workteams_customer_identity_contact(
 p_company_id uuid,p_contact_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if p_company_id is null or p_contact_id is null or
   not public.workteams_client_portal_pilot_manager(p_company_id)
 then raise exception 'Not authorized.' using errcode='42501'; end if;
 update public.client_portal_contacts
 set status='disabled',revoked_at=now(),updated_at=now()
 where company_id=p_company_id and id=p_contact_id and status<>'disabled';
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Active contact was not found.' using errcode='22023'; end if;
 update public.client_portal_identity_links
 set status='disabled',revoked_at=now(),updated_at=now()
 where company_id=p_company_id and contact_id=p_contact_id;
 update public.client_portal_location_grants
 set revoked_at=now(),updated_at=now()
 where company_id=p_company_id and contact_id=p_contact_id;
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),'contact_revoked');
 return jsonb_build_object('ok',true,'customer_login_enabled',false);
end $$;
revoke all on function public.revoke_workteams_customer_identity_contact(
 uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_workteams_customer_identity_contact(
 uuid,uuid) to authenticated;

-- Verify email with the trusted Auth users table, not editable user_metadata.
create or replace function public.workteams_customer_verified_email()
returns text language sql stable security definer set search_path='' as $$
 select lower(btrim(u.email))
 from auth.users u where u.id=auth.uid()
 and u.email_confirmed_at is not null
 and lower(btrim(u.email))=lower(btrim(coalesce(auth.jwt()->>'email','')))
 and coalesce(u.email,'')<>''
 limit 1
$$;
revoke all on function public.workteams_customer_verified_email()
 from public,anon,authenticated;

create or replace function public.claim_workteams_customer_identity()
returns integer language plpgsql security definer set search_path='' as $$
declare v_email text;v_rows integer:=0;
begin
 v_email:=public.workteams_customer_verified_email();
 if v_email is null then return 0; end if;
 -- No customer identity grant may be claimed before separately activating
 -- that specific company's feature flag.
 insert into public.client_portal_identity_links(
   company_id,contact_id,auth_user_id,email_normalized,status,verified_at,
   revoked_at,updated_at)
 select ct.company_id,ct.id,auth.uid(),v_email,'active',now(),null,now()
 from public.client_portal_contacts ct
 join public.client_portal_identity_settings s
  on s.company_id=ct.company_id and s.enabled=true and s.pilot_requested=true
 where ct.email_normalized=v_email and ct.status='active' and ct.revoked_at is null
 and exists(
  select 1 from public.client_portal_location_grants g
  join public.locations l on l.id=g.location_id and l.company_id=g.company_id
  where g.company_id=ct.company_id and g.contact_id=ct.id
   and g.revoked_at is null and g.can_view_requests=true
   and (g.starts_at is null or g.starts_at<=now())
   and (g.expires_at is null or g.expires_at>now())
 )
 on conflict(company_id,contact_id) do update set
  updated_at=now()
 where public.client_portal_identity_links.auth_user_id=auth.uid()
   and public.client_portal_identity_links.status='active'
   and public.client_portal_identity_links.revoked_at is null
   and public.client_portal_identity_links.email_normalized=v_email;
 get diagnostics v_rows=row_count;
 return v_rows;
end $$;
revoke all on function public.claim_workteams_customer_identity()
 from public,anon,authenticated;
grant execute on function public.claim_workteams_customer_identity()
 to authenticated;

create or replace function public.get_my_workteams_customer_identity()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_email text;v_rows jsonb;
begin
 v_email:=public.workteams_customer_verified_email();
 if v_email is null or auth.uid() is null then
  return jsonb_build_object('ok',false,'error','Verify your account email to continue.');
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'company_id',ct.company_id,'company_name',co.name,
  'contact_name',ct.display_name,'language',ct.invite_language,
  'location_id',l.id,'location_name',l.name
 ) order by co.name,l.name),'[]'::jsonb)
 into v_rows
 from public.client_portal_identity_links il
 join public.client_portal_contacts ct on ct.id=il.contact_id
    and ct.company_id=il.company_id and ct.email_normalized=v_email
    and ct.status='active' and ct.revoked_at is null
 join public.client_portal_identity_settings s on s.company_id=ct.company_id
    and s.enabled=true and s.pilot_requested=true
 join public.client_portal_location_grants g on g.contact_id=ct.id
    and g.company_id=ct.company_id and g.can_view_requests=true
    and g.revoked_at is null
    and (g.starts_at is null or g.starts_at<=now())
    and (g.expires_at is null or g.expires_at>now())
 join public.locations l on l.id=g.location_id and l.company_id=g.company_id
 join public.companies co on co.id=ct.company_id
 where il.auth_user_id=auth.uid()
   and il.email_normalized=v_email and il.status='active'
   and il.verified_at is not null and il.revoked_at is null;
 return jsonb_build_object('ok',true,'locations',v_rows);
end $$;
revoke all on function public.get_my_workteams_customer_identity()
 from public,anon,authenticated;
grant execute on function public.get_my_workteams_customer_identity()
 to authenticated;
