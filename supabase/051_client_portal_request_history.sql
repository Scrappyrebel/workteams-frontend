-- WorkTeams client request history: anonymous bearer links see a deliberately
-- limited status feed for the exact non-expired location token only.
-- Original client messages, contact information, management notes,
-- unrelated location/client data and employee identities are not returned.

alter table public.portal_messages
 add column if not exists customer_status text not null default 'received'
   check(customer_status in ('received','in_progress','resolved')),
 add column if not exists customer_response text
   check(customer_response is null or char_length(customer_response) between 10 and 1200),
 add column if not exists customer_responded_at timestamptz;

create index if not exists portal_messages_token_history_idx
 on public.portal_messages(portal_token_id,created_at desc)
 where portal_token_id is not null;

-- Keep customers from manipulating messages directly; managers retain
-- existing company/role-restricted RLS update privileges.
revoke all on public.portal_messages from anon;
grant select,update on public.portal_messages to authenticated;

-- Append-only, owner-visible audit trail of response/status changes.
create table if not exists public.portal_message_response_events (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 message_id uuid not null references public.portal_messages(id) on delete cascade,
 changed_by uuid references auth.users(id) on delete set null,
 old_status text,
 new_status text not null,
 old_response text,
 new_response text,
 created_at timestamptz not null default now()
);
alter table public.portal_message_response_events enable row level security;
revoke all on public.portal_message_response_events from public,anon,authenticated;
create index if not exists portal_message_response_events_recent_idx
 on public.portal_message_response_events(company_id,message_id,created_at desc);

create or replace function public.audit_portal_message_response()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.customer_status,new.customer_response,new.customer_responded_at)
   is distinct from (old.customer_status,old.customer_response,old.customer_responded_at) then
  insert into public.portal_message_response_events(
   company_id,message_id,changed_by,old_status,new_status,old_response,new_response
  ) values(
   new.company_id,new.id,auth.uid(),old.customer_status,new.customer_status,
   old.customer_response,new.customer_response
  );
 end if;
 return new;
end $$;
revoke all on function public.audit_portal_message_response() from public,anon,authenticated;
drop trigger if exists portal_message_response_audit on public.portal_messages;
create trigger portal_message_response_audit
 after update of customer_status,customer_response,customer_responded_at
 on public.portal_messages for each row
 execute function public.audit_portal_message_response();

-- Deliberately do NOT expose sender_name, subject, original body or priority:
-- location links may be forwarded to someone other than the original sender.
create or replace function public.get_client_portal_request_history(tok text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pt public.portal_tokens%rowtype; result jsonb;
begin
 if tok is null or char_length(tok)>128 then
  return jsonb_build_object('ok',false,'error','This link is not valid.');
 end if;
 select * into pt from public.portal_tokens
 where token=tok and (expires_at is null or expires_at>now());
 if pt.id is null or not exists (
  select 1 from public.locations l where l.id=pt.location_id
   and l.company_id=pt.company_id
 ) then
  return jsonb_build_object('ok',false,'error','This link is not valid.');
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'category',r.category,'status',r.customer_status,
  'created_at',r.created_at,'response',r.customer_response,
  'responded_at',r.customer_responded_at
 ) order by r.created_at desc),'[]'::jsonb)
 into result
 from(
  select id,category,customer_status,created_at,customer_response,customer_responded_at
  from public.portal_messages
  where company_id=pt.company_id and location_id=pt.location_id
    and portal_token_id=pt.id
  order by created_at desc limit 30
 ) r;
 return jsonb_build_object('ok',true,'requests',result);
end $$;
revoke all on function public.get_client_portal_request_history(text)
 from public,anon,authenticated;
grant execute on function public.get_client_portal_request_history(text)
 to anon,authenticated;
