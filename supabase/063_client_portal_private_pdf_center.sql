-- WorkTeams 063: private, opt-in, manager-published customer PDF documents.
-- NO company enabled, NO historic document published, NO public Storage policy.
-- Customers MUST be verified accounts. Existing bearer location links unchanged.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('workteams-customer-documents','workteams-customer-documents',false,8388608,array['application/pdf'])
on conflict(id) do nothing;

create table if not exists public.workteams_customer_documents(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 location_id uuid not null,
 storage_key text not null unique,
 title text not null check(char_length(btrim(title)) between 3 and 120),
 file_name text not null check(char_length(file_name) between 5 and 140),
 mime_type text not null default 'application/pdf' check(mime_type='application/pdf'),
 uploaded_by uuid not null references auth.users(id) on delete restrict,
 published boolean not null default false,
 published_by uuid references auth.users(id) on delete set null,
 published_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,location_id)
  references public.locations(company_id,id) on delete cascade,
 constraint workteams_customer_docs_storage_prefix check(
  storage_key like company_id::text || '/' || location_id::text || '/%.pdf'),
 constraint workteams_customer_docs_publication_consistency check(
  not published or (published_by is not null and published_at is not null))
);
create index if not exists workteams_customer_documents_company_location_idx
 on public.workteams_customer_documents(company_id,location_id,created_at desc);
alter table public.workteams_customer_documents enable row level security;
revoke all on public.workteams_customer_documents from public,anon,authenticated;
grant all on public.workteams_customer_documents to service_role;

alter table public.client_portal_identity_management_events
 drop constraint if exists client_portal_identity_management_events_event_type_check;
alter table public.client_portal_identity_management_events
 add constraint client_portal_identity_management_events_event_type_check
 check(event_type in (
  'pilot_requested','pilot_cancelled','contact_approved','contact_revoked',
  'location_granted','login_activated','login_disabled',
  'quality_access_granted','quality_access_revoked',
  'work_order_access_granted','work_order_access_revoked',
  'document_access_granted','document_access_revoked',
  'document_published','document_withdrawn'
 ));

-- This helper cannot be invoked over the Data API, only by reviewed functions.
create or replace function public.workteams_customer_document_manager(
 p_company_id uuid,p_location_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_company_id is not null and p_location_id is not null
 and public.workteams_client_portal_pilot_manager(p_company_id)
 and exists(select 1 from public.locations l
   where l.company_id=p_company_id and l.id=p_location_id)
 and exists(select 1 from public.client_portal_identity_settings s
   where s.company_id=p_company_id and s.pilot_requested=true)
$$;
revoke all on function public.workteams_customer_document_manager(uuid,uuid)
 from public,anon,authenticated;

-- Server upload endpoint calls this with the current verified user token.
-- It cannot be used as an authorization bypass by anonymous callers.
create or replace function public.authorize_workteams_customer_document_upload(
 p_company_id uuid,p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.workteams_customer_document_manager(p_company_id,p_location_id)
 then raise exception 'Only a company manager with an active pilot request may upload.' using errcode='42501'; end if;
 return jsonb_build_object('ok',true,'actor_user_id',auth.uid());
end $$;
revoke all on function public.authorize_workteams_customer_document_upload(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.authorize_workteams_customer_document_upload(uuid,uuid)
 to authenticated;

create or replace function public.list_workteams_customer_documents_manager(
 p_company_id uuid,p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_records jsonb;
begin
 if not public.workteams_customer_document_manager(p_company_id,p_location_id)
 then raise exception 'Not authorized.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,
  'file_name',d.file_name,'published',d.published,
  'expires_at',d.expires_at,'created_at',d.created_at)
 order by d.created_at desc),'[]'::jsonb)
 into v_records from (
  select * from public.workteams_customer_documents d
  where d.company_id=p_company_id and d.location_id=p_location_id
  order by d.created_at desc limit 40
 ) d;
 return jsonb_build_object('ok',true,'documents',v_records);
end $$;
revoke all on function public.list_workteams_customer_documents_manager(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.list_workteams_customer_documents_manager(uuid,uuid)
 to authenticated;

create or replace function public.set_workteams_customer_document_publication(
 p_company_id uuid,p_document_id uuid,p_publish boolean,p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_doc public.workteams_customer_documents%rowtype;
begin
 if p_company_id is null or p_document_id is null or p_publish is null
 then raise exception 'Invalid document publication.' using errcode='22023'; end if;
 select * into v_doc from public.workteams_customer_documents
 where company_id=p_company_id and id=p_document_id for update;
 if v_doc.id is null or
    not public.workteams_customer_document_manager(p_company_id,v_doc.location_id)
 then raise exception 'Not authorized.' using errcode='42501'; end if;
 if p_publish and p_expires_at is not null and p_expires_at<=now()
 then raise exception 'Expiry must be in the future.' using errcode='22023'; end if;
 update public.workteams_customer_documents set
  published=p_publish,published_by=case when p_publish then auth.uid() else null end,
  published_at=case when p_publish then now() else null end,
  expires_at=case when p_publish then p_expires_at else expires_at end,
  updated_at=now() where id=p_document_id;
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),
  case when p_publish then 'document_published' else 'document_withdrawn' end);
 return jsonb_build_object('ok',true,'published',p_publish);
end $$;
revoke all on function public.set_workteams_customer_document_publication(
 uuid,uuid,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.set_workteams_customer_document_publication(
 uuid,uuid,boolean,timestamptz) to authenticated;

-- Additional per-contact/location document access defaults FALSE; manager
-- must explicitly approve it independently of publishing any specific PDF.
create or replace function public.set_workteams_customer_document_access(
 p_company_id uuid,p_contact_id uuid,p_location_id uuid,p_allow boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows integer;
begin
 if p_company_id is null or p_contact_id is null or p_location_id is null
 or p_allow is null or not public.workteams_customer_document_manager(p_company_id,p_location_id)
 then raise exception 'Not authorized.' using errcode='42501'; end if;
 update public.client_portal_location_grants g
 set can_view_documents=p_allow,updated_at=now()
 where g.company_id=p_company_id and g.contact_id=p_contact_id
  and g.location_id=p_location_id and g.revoked_at is null
  and g.can_view_requests=true
  and exists(select 1 from public.client_portal_contacts ct
    where ct.company_id=g.company_id and ct.id=g.contact_id
     and ct.status='active' and ct.revoked_at is null);
 get diagnostics v_rows=row_count;
 if v_rows<>1 then raise exception 'Approved active contact/location required.' using errcode='42501'; end if;
 insert into public.client_portal_identity_management_events(
  company_id,actor_user_id,event_type)
 values(p_company_id,auth.uid(),
  case when p_allow then 'document_access_granted' else 'document_access_revoked' end);
 return jsonb_build_object('ok',true,'document_access',p_allow);
end $$;
revoke all on function public.set_workteams_customer_document_access(uuid,uuid,uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.set_workteams_customer_document_access(uuid,uuid,uuid,boolean)
 to authenticated;

-- Update manager contact readback to show exact location document permission.
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
    join auth.users au on au.id=il.auth_user_id
    where il.company_id=ct.company_id and il.contact_id=ct.id
      and il.status='active' and il.revoked_at is null and il.verified_at is not null
      and au.email_confirmed_at is not null and lower(btrim(au.email))=ct.email_normalized),
  'locations',coalesce((
    select jsonb_agg(jsonb_build_object(
     'id',g.location_id,'name',l.name,
     'revoked',g.revoked_at is not null,'basic_portal',g.can_view_requests,
     'quality_access',g.can_view_quality,
     'work_order_access',g.can_view_contracts,
     'document_access',g.can_view_documents,
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

-- Return no document metadata unless *every* live identity and tenant check
-- passes. The storage key is never exposed in the customer catalog.
create or replace function public.get_workteams_authenticated_customer_documents(
 p_company_id uuid,p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_contact uuid;v_docs jsonb;
begin
 v_contact:=public.workteams_customer_authorized_location(p_company_id,p_location_id);
 if v_contact is null or not exists(
  select 1 from public.client_portal_location_grants g
  where g.company_id=p_company_id and g.location_id=p_location_id
   and g.contact_id=v_contact and g.can_view_documents=true and g.revoked_at is null
   and (g.starts_at is null or g.starts_at<=now())
   and (g.expires_at is null or g.expires_at>now())
 ) then raise exception 'Customer document access is not authorized.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,
  'file_name',d.file_name,'created_at',d.created_at)
 order by d.created_at desc),'[]'::jsonb)
 into v_docs from (
  select id,title,file_name,created_at from public.workteams_customer_documents
  where company_id=p_company_id and location_id=p_location_id
   and published=true and (expires_at is null or expires_at>now())
  order by created_at desc limit 40
 ) d;
 return jsonb_build_object('ok',true,'documents',v_docs);
end $$;
revoke all on function public.get_workteams_authenticated_customer_documents(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.get_workteams_authenticated_customer_documents(uuid,uuid)
 to authenticated;

-- Used only by server download proxy, which re-authenticates JWT on EACH GET.
-- A customer cannot download based only on knowing a document UUID.
create or replace function public.authorize_workteams_customer_document_download(
 p_document_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.workteams_customer_documents%rowtype;v_contact uuid;
begin
 if p_document_id is null then raise exception 'Document not found.' using errcode='42501'; end if;
 select * into d from public.workteams_customer_documents
 where id=p_document_id and published=true
  and (expires_at is null or expires_at>now());
 if d.id is null then raise exception 'Document not available.' using errcode='42501'; end if;
 v_contact:=public.workteams_customer_authorized_location(d.company_id,d.location_id);
 if v_contact is null or not exists(
  select 1 from public.client_portal_location_grants g
  where g.company_id=d.company_id and g.location_id=d.location_id
    and g.contact_id=v_contact and g.can_view_documents=true
    and g.revoked_at is null
    and (g.starts_at is null or g.starts_at<=now())
    and (g.expires_at is null or g.expires_at>now())
 ) then raise exception 'Document not available.' using errcode='42501'; end if;
 return jsonb_build_object('ok',true,'id',d.id,
  'company_id',d.company_id,'location_id',d.location_id,
  'storage_key',d.storage_key,'file_name',d.file_name);
end $$;
revoke all on function public.authorize_workteams_customer_document_download(uuid)
 from public,anon,authenticated;
grant execute on function public.authorize_workteams_customer_document_download(uuid)
 to authenticated;
