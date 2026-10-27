-- WorkTeams client portal customer reply notifications (071).
-- Migration 065 made the portal conversation two-way, but only in one
-- direction did anyone get told: customer replies raise a management alert,
-- while a management (business) reply reached the customer silently — no
-- email, and no marker in the customer's portal that anything new had
-- arrived (065's read_at flags run the other way, for management). This
-- migration closes that gap, mirroring the Workforce portal's reply
-- notification behaviour in WorkTeams' own patterns:
--
--   * public.portal_reply_notifications — one row per business reply,
--     queued by a trigger on portal_message_replies. The recipient is the
--     request's verified portal contact (client_portal_contacts) when the
--     request came through the authenticated portal; shared location-link
--     requests carry no email address anywhere in this schema, so their
--     rows are recorded honestly as 'no_recipient' and no email is ever
--     attempted for them — those customers see the in-portal flag instead.
--   * The email itself is sent by the app (POST /api/portal/reply-notify,
--     the Resend transport the invoice send already uses) and the outcome
--     is recorded back on the row. A row stays 'pending' — never falsely
--     'sent' — until Resend accepts the message; a missing RESEND_API_KEY
--     or a failed send leaves it pending with the reason in last_error.
--     The email NEVER contains the reply text (the standing privacy rule):
--     it only says a reply is waiting and links to the customer portal.
--   * portal_messages.customer_thread_seen_at — when the customer last
--     opened this conversation. The request history and conversation reads
--     gain an additive 'has_unseen_reply' field (a business thread reply,
--     or a newer saved customer response, arrived after that moment), and
--     two mark-seen RPCs set it when the customer opens the thread. The
--     051 privacy rule is unchanged: the shared-link reads still never
--     return the original message body, subject, sender name or priority.
--
-- The queue trigger can never break a reply: any failure inside it is
-- swallowed and the reply post proceeds exactly as before.

BEGIN;

-- ---------- seen marker for the in-portal "new reply" flag ----------
alter table public.portal_messages
  add column if not exists customer_thread_seen_at timestamptz;

-- Requests that already exist start "seen" up to their latest business
-- activity, so conversations from before this feature do not suddenly
-- flag as new. Requests created later start null, which the flag reads
-- treat as "never opened" — correct, because they have no replies yet.
update public.portal_messages m
   set customer_thread_seen_at = coalesce(
     (select max(r.created_at) from public.portal_message_replies r
       where r.portal_message_id = m.id and r.sender_role = 'business'),
     m.customer_responded_at,
     m.created_at)
 where m.customer_thread_seen_at is null;

-- ---------- one notification row per business reply ----------
create table if not exists public.portal_reply_notifications (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid not null unique references public.portal_message_replies(id) on delete cascade,
  portal_message_id uuid not null references public.portal_messages(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  recipient_email text,
  recipient_language text not null default 'en'
    check (recipient_language in ('en','es')),
  status text not null default 'pending'
    check (status in ('pending','sent','no_recipient')),
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portal_reply_notifications_company_idx
  on public.portal_reply_notifications(company_id, created_at desc);
create index if not exists portal_reply_notifications_pending_idx
  on public.portal_reply_notifications(portal_message_id) where status = 'pending';

alter table public.portal_reply_notifications enable row level security;
grant select, insert, update, delete on public.portal_reply_notifications to authenticated;
grant all on public.portal_reply_notifications to service_role;

-- Direct reads only for the same owner/admin managers who can read the
-- inbox. No direct insert/update/delete policies exist on purpose: rows
-- are created by the queue trigger below and updated only by the
-- service-role notify route after a verified manager request.
drop policy if exists "portal_reply_notifications read if owner/admin" on public.portal_reply_notifications;
create policy "portal_reply_notifications read if owner/admin"
  on public.portal_reply_notifications for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = portal_reply_notifications.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

-- ---------- queue a notification for every business reply ----------
create or replace function public.queue_portal_reply_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_contact uuid; v_email text; v_lang text;
begin
  if new.sender_role <> 'business' then return new; end if;
  begin
    select m.customer_contact_id into v_contact
      from public.portal_messages m where m.id = new.portal_message_id;
    v_email := null; v_lang := 'en';
    if v_contact is not null then
      select ct.email_normalized, ct.invite_language into v_email, v_lang
        from public.client_portal_contacts ct
       where ct.id = v_contact and ct.company_id = new.company_id
         and ct.status = 'active' and ct.revoked_at is null;
    end if;
    insert into public.portal_reply_notifications(
      reply_id, portal_message_id, company_id, location_id,
      recipient_email, recipient_language, status)
    values(new.id, new.portal_message_id, new.company_id, new.location_id,
      v_email, coalesce(v_lang, 'en'),
      case when v_email is null then 'no_recipient' else 'pending' end)
    on conflict (reply_id) do nothing;
  exception when others then
    -- A notification must never break the reply itself.
    null;
  end;
  return new;
end $$;
revoke all on function public.queue_portal_reply_notification()
  from public,anon,authenticated;
drop trigger if exists portal_reply_notification_queue on public.portal_message_replies;
create trigger portal_reply_notification_queue
  after insert on public.portal_message_replies for each row
  execute function public.queue_portal_reply_notification();

-- ---------- "new reply" flag on the request reads ----------
-- Shared-link history (051), re-issued with one additive field. Privacy
-- rule unchanged: no body, subject, sender name or priority is returned.
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
  'responded_at',r.customer_responded_at,
  'has_unseen_reply',r.has_unseen_reply
 ) order by r.created_at desc),'[]'::jsonb)
 into result
 from(
  select pm.id,pm.category,pm.customer_status,pm.created_at,
    pm.customer_response,pm.customer_responded_at,
    (exists(
       select 1 from public.portal_message_replies br
        where br.portal_message_id=pm.id and br.sender_role='business'
          and br.created_at>coalesce(pm.customer_thread_seen_at,'-infinity'::timestamptz)
     ) or (
       pm.customer_response is not null
       and coalesce(pm.customer_responded_at,pm.created_at)
           >coalesce(pm.customer_thread_seen_at,'-infinity'::timestamptz)
     )) as has_unseen_reply
  from public.portal_messages pm
  where pm.company_id=pt.company_id and pm.location_id=pt.location_id
    and pm.portal_token_id=pt.id
  order by pm.created_at desc limit 30
 ) r;
 return jsonb_build_object('ok',true,'requests',result);
end $$;
revoke all on function public.get_client_portal_request_history(text)
 from public,anon,authenticated;
grant execute on function public.get_client_portal_request_history(text)
 to anon,authenticated;

-- Authenticated history (057), re-issued with the same additive field.
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
   'responded_at',m.customer_responded_at,
   'has_unseen_reply',m.has_unseen_reply
 ) order by m.created_at desc),'[]'::jsonb)
 into v_requests from (
  select m.id,m.category,m.customer_status,m.created_at,m.body,
         m.customer_response,m.customer_responded_at,
         (exists(
            select 1 from public.portal_message_replies br
             where br.portal_message_id=m.id and br.sender_role='business'
               and br.created_at>coalesce(m.customer_thread_seen_at,'-infinity'::timestamptz)
          ) or (
            m.customer_response is not null
            and coalesce(m.customer_responded_at,m.created_at)
                >coalesce(m.customer_thread_seen_at,'-infinity'::timestamptz)
          )) as has_unseen_reply
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

-- Shared-link conversation read (065), re-issued with the flag on the
-- request object. Still no original body/subject/sender (051 rule).
create or replace function public.get_portal_message_conversation(
  tok text, p_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pt public.portal_tokens%rowtype; v_msg public.portal_messages%rowtype;
begin
  if tok is null or char_length(tok)>128 then
    return jsonb_build_object('ok',false,'error','This link is not valid.');
  end if;
  select * into pt from public.portal_tokens
   where token=tok and (expires_at is null or expires_at>now());
  if pt.id is null then
    return jsonb_build_object('ok',false,'error','This link is not valid.');
  end if;
  select * into v_msg from public.portal_messages
   where id=p_message_id and company_id=pt.company_id
     and location_id=pt.location_id and portal_token_id=pt.id;
  if v_msg.id is null then
    return jsonb_build_object('ok',false,
      'error','This request is not available on this link.');
  end if;
  return jsonb_build_object(
    'ok',true,
    'request',jsonb_build_object(
      'id',v_msg.id,'category',v_msg.category,'status',v_msg.customer_status,
      'created_at',v_msg.created_at,
      'has_unseen_reply',(
        exists(
          select 1 from public.portal_message_replies br
           where br.portal_message_id=v_msg.id and br.sender_role='business'
             and br.created_at>coalesce(v_msg.customer_thread_seen_at,'-infinity'::timestamptz)
        ) or (
          v_msg.customer_response is not null
          and coalesce(v_msg.customer_responded_at,v_msg.created_at)
              >coalesce(v_msg.customer_thread_seen_at,'-infinity'::timestamptz)
        ))),
    'replies',public.portal_message_visible_thread(v_msg.id));
end $$;
revoke all on function public.get_portal_message_conversation(text,uuid)
  from public,anon,authenticated;
grant execute on function public.get_portal_message_conversation(text,uuid)
  to anon,authenticated;

-- Authenticated conversation read (065), same additive field.
create or replace function public.get_workteams_authenticated_customer_conversation(
  p_company_id uuid, p_location_id uuid, p_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_contact uuid; v_msg public.portal_messages%rowtype;
begin
  v_contact:=public.workteams_customer_authorized_location(p_company_id,p_location_id);
  if v_contact is null then
    raise exception 'Customer location access is not authorized.'
      using errcode='42501';
  end if;
  select * into v_msg from public.portal_messages
   where id=p_message_id and company_id=p_company_id
     and location_id=p_location_id and customer_contact_id=v_contact
     and portal_token_id is null;
  if v_msg.id is null then
    raise exception 'Request not found.' using errcode='P0002';
  end if;
  return jsonb_build_object(
    'ok',true,
    'request',jsonb_build_object(
      'id',v_msg.id,'category',v_msg.category,'status',v_msg.customer_status,
      'submitted_at',v_msg.created_at,'message',v_msg.body,
      'has_unseen_reply',(
        exists(
          select 1 from public.portal_message_replies br
           where br.portal_message_id=v_msg.id and br.sender_role='business'
             and br.created_at>coalesce(v_msg.customer_thread_seen_at,'-infinity'::timestamptz)
        ) or (
          v_msg.customer_response is not null
          and coalesce(v_msg.customer_responded_at,v_msg.created_at)
              >coalesce(v_msg.customer_thread_seen_at,'-infinity'::timestamptz)
        ))),
    'replies',public.portal_message_visible_thread(v_msg.id));
end $$;
revoke all on function public.get_workteams_authenticated_customer_conversation(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.get_workteams_authenticated_customer_conversation(uuid,uuid,uuid)
  to authenticated;

-- ---------- mark seen: opening the conversation clears the flag ----------
create or replace function public.mark_portal_conversation_seen_with_token(
  tok text, p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pt public.portal_tokens%rowtype; v_msg public.portal_messages%rowtype;
begin
  if tok is null or char_length(tok)>128 then
    return jsonb_build_object('ok',false,'error','This link is not valid.');
  end if;
  select * into pt from public.portal_tokens
   where token=tok and (expires_at is null or expires_at>now());
  if pt.id is null then
    return jsonb_build_object('ok',false,'error','This link is not valid.');
  end if;
  select * into v_msg from public.portal_messages
   where id=p_message_id and company_id=pt.company_id
     and location_id=pt.location_id and portal_token_id=pt.id;
  if v_msg.id is null then
    return jsonb_build_object('ok',false,
      'error','This request is not available on this link.');
  end if;
  update public.portal_messages
     set customer_thread_seen_at=now()
   where id=v_msg.id
     and (customer_thread_seen_at is null or customer_thread_seen_at<now());
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.mark_portal_conversation_seen_with_token(text,uuid)
  from public,anon,authenticated;
grant execute on function public.mark_portal_conversation_seen_with_token(text,uuid)
  to anon,authenticated;

create or replace function public.mark_workteams_authenticated_customer_conversation_seen(
  p_company_id uuid, p_location_id uuid, p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_contact uuid; v_msg public.portal_messages%rowtype;
begin
  v_contact:=public.workteams_customer_authorized_location(p_company_id,p_location_id);
  if v_contact is null then
    raise exception 'Customer location access is not authorized.'
      using errcode='42501';
  end if;
  select * into v_msg from public.portal_messages
   where id=p_message_id and company_id=p_company_id
     and location_id=p_location_id and customer_contact_id=v_contact
     and portal_token_id is null;
  if v_msg.id is null then
    raise exception 'Request not found.' using errcode='P0002';
  end if;
  update public.portal_messages
     set customer_thread_seen_at=now()
   where id=v_msg.id
     and (customer_thread_seen_at is null or customer_thread_seen_at<now());
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.mark_workteams_authenticated_customer_conversation_seen(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.mark_workteams_authenticated_customer_conversation_seen(uuid,uuid,uuid)
  to authenticated;

COMMIT;
