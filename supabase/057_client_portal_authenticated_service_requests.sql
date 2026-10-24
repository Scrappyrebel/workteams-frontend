-- WorkTeams authenticated customer service requests and history.
-- Existing bearer location links remain untouched: these records have a
-- NULL portal_token_id and are never returned by the bearer-token history RPC.
-- No company has customer login enabled by this migration.

alter table public.portal_messages
 add column if not exists customer_contact_id uuid,
 add column if not exists customer_request_key uuid;

alter table public.portal_messages
 add constraint portal_messages_customer_contact_company_fkey
 foreign key(company_id,customer_contact_id)
 references public.client_portal_contacts(company_id,id)
 on delete set null (customer_contact_id);

create unique index if not exists portal_messages_customer_request_dedupe
 on public.portal_messages(customer_contact_id,customer_request_key)
 where customer_contact_id is not null and customer_request_key is not null;

create unique index if not exists portal_messages_one_pending_auth_document_copy
 on public.portal_messages(company_id,location_id,customer_contact_id)
 where customer_contact_id is not null and category='document_copy'
   and customer_status<>'resolved';

create index if not exists portal_messages_authenticated_customer_history
 on public.portal_messages(company_id,location_id,customer_contact_id,created_at desc)
 where customer_contact_id is not null;

-- Historic table privileges included INSERT for all authenticated actors;
-- no INSERT RLS policy existed, but remove the grant as defense in depth.
-- Existing public bearer submissions still use protected server-side service
-- credentials; managers retain their separately scoped SELECT/UPDATE policy.
revoke insert on public.portal_messages from authenticated;
revoke insert on public.portal_messages from anon;

-- Do not grant customers direct SELECT/INSERT on portal_messages. Only the
-- exact-contact and live-location SECURITY DEFINER RPCs below are exposed.
create or replace function public.workteams_customer_authorized_location(
 p_company_id uuid,p_location_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select ct.id
 from public.client_portal_identity_links il
 join public.client_portal_contacts ct on ct.id=il.contact_id
  and ct.company_id=il.company_id and ct.status='active'
  and ct.revoked_at is null
 join public.client_portal_identity_settings s on s.company_id=ct.company_id
  and s.enabled=true and s.pilot_requested=true
 join public.client_portal_location_grants g on g.contact_id=ct.id
  and g.company_id=ct.company_id and g.location_id=p_location_id
  and g.can_view_requests=true and g.revoked_at is null
  and (g.starts_at is null or g.starts_at<=now())
  and (g.expires_at is null or g.expires_at>now())
 join public.locations l on l.id=g.location_id and l.company_id=g.company_id
 where auth.uid() is not null
  and ct.company_id=p_company_id
  and il.auth_user_id=auth.uid()
  and il.status='active' and il.revoked_at is null and il.verified_at is not null
  and il.email_normalized=public.workteams_customer_verified_email()
  and ct.email_normalized=il.email_normalized
 limit 1
$$;
revoke all on function public.workteams_customer_authorized_location(uuid,uuid)
 from public,anon,authenticated;

create or replace function public.get_workteams_authenticated_customer_requests(
 p_company_id uuid,p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_contact uuid; v_requests jsonb;
begin
 v_contact:=public.workteams_customer_authorized_location(p_company_id,p_location_id);
 if v_contact is null then
  raise exception 'Customer location access is not authorized.'
    using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',m.id,'category',m.category,'status',m.customer_status,
   'submitted_at',m.created_at,
   'message',m.body,
   'response',m.customer_response,
   'responded_at',m.customer_responded_at
 ) order by m.created_at desc),'[]'::jsonb)
 into v_requests from (
  select m.id,m.category,m.customer_status,m.created_at,m.body,
         m.customer_response,m.customer_responded_at
  from public.portal_messages m
  where m.company_id=p_company_id and m.location_id=p_location_id
   and m.customer_contact_id=v_contact and m.portal_token_id is null
  order by m.created_at desc limit 30
 ) m;
 return jsonb_build_object('ok',true,'requests',v_requests);
end $$;
revoke all on function public.get_workteams_authenticated_customer_requests(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.get_workteams_authenticated_customer_requests(uuid,uuid)
 to authenticated;

create or replace function public.submit_workteams_authenticated_customer_request(
 p_company_id uuid,p_location_id uuid,p_category text,
 p_message text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_contact uuid;v_contact_name text;v_existing uuid;v_id uuid;
        v_count integer;v_subject text;
begin
 if p_company_id is null or p_location_id is null or p_request_key is null
    or p_category not in ('general','service_problem','callback_request','document_copy')
    or char_length(btrim(coalesce(p_message,''))) not between 10 and 1600
 then raise exception 'Choose a category and enter a message of 10 to 1600 characters.'
   using errcode='22023'; end if;
 v_contact:=public.workteams_customer_authorized_location(p_company_id,p_location_id);
 if v_contact is null then
  raise exception 'Customer location access is not authorized.'
   using errcode='42501'; end if;
 -- Serialize requests from this approved contact for strict rate limits and
 -- idempotency; a replay with the same key returns its existing receipt.
 select ct.display_name into v_contact_name
 from public.client_portal_contacts ct
 where ct.company_id=p_company_id and ct.id=v_contact and ct.status='active'
  and ct.revoked_at is null
 for update;
 if not found then
  raise exception 'Customer approval is no longer active.' using errcode='42501';
 end if;
 select m.id into v_existing from public.portal_messages m
 where m.customer_contact_id=v_contact and m.customer_request_key=p_request_key
  and m.company_id=p_company_id and m.location_id=p_location_id
  and m.portal_token_id is null;
 if v_existing is not null then
  return jsonb_build_object('ok',true,'request_id',v_existing,'duplicate',true);
 end if;
 if p_category='document_copy' and exists(
  select 1 from public.portal_messages m
  where m.company_id=p_company_id and m.location_id=p_location_id
   and m.customer_contact_id=v_contact and m.category='document_copy'
   and m.customer_status<>'resolved'
 ) then raise exception 'There is already an open document-copy request for this location.'
   using errcode='23505'; end if;
 select count(*) into v_count from public.portal_messages m
 where m.company_id=p_company_id and m.customer_contact_id=v_contact
  and m.created_at>now()-interval '1 hour';
 if v_count>=5 then raise exception 'Too many requests. Try again later.'
   using errcode='22023'; end if;
 v_subject:=case p_category
   when 'service_problem' then 'Customer service problem'
   when 'callback_request' then 'Customer callback requested'
   when 'document_copy' then 'Customer requests a contract copy'
   else 'Customer message' end;
 insert into public.portal_messages(
  company_id,location_id,portal_token_id,customer_contact_id,
  customer_request_key,sender_name,subject,body,category,priority)
 values(p_company_id,p_location_id,null,v_contact,p_request_key,
  left(coalesce(v_contact_name,'Customer'),120),v_subject,btrim(p_message),
  p_category,'normal')
 returning id into v_id;
 return jsonb_build_object('ok',true,'request_id',v_id,'duplicate',false);
end $$;
revoke all on function public.submit_workteams_authenticated_customer_request(
 uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.submit_workteams_authenticated_customer_request(
 uuid,uuid,text,text,uuid) to authenticated;
