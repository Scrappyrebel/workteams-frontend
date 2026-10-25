-- WorkTeams client portal two-way conversations (065).
-- Until now a customer request was a single portal_messages row and management
-- could save exactly ONE customer-visible response (customer_response), which
-- the next save overwrote. The customer could never reply back. This migration
-- adds an append-only conversation thread per request, mirroring the two-way
-- Customer Service conversation in the Workforce portal:
--
--   * public.portal_message_replies — one row per reply, never overwritten.
--   * Business replies are posted only through a manager-scoped RPC and are
--     mirrored into the legacy customer_response fields, so the original
--     request-history feeds keep showing the newest business response and
--     pre-existing requests behave exactly as before.
--   * Customers reply through scoped SECURITY DEFINER RPCs — the exact-token
--     RPC for the shared location link and an authorized-contact RPC for the
--     authenticated portal — the same authorization style as the existing
--     history/submit RPCs. There are no direct customer table writes.
--   * Every new request (either path) and every customer reply raises a
--     management alert in the existing emergency_alerts log (category
--     'customer_portal'). The alert dedupe_key carries the request id so the
--     alert UI can deep-link straight to that request's conversation:
--       customer_portal_request:<message_id>
--       customer_portal_reply:<message_id>:<reply_id>
--
-- Privacy rules from 051 are unchanged: the shared-link history and
-- conversation RPCs still never return the original message body, subject,
-- sender name or priority. Thread replies are new content written inside the
-- conversation UI itself.

-- ---------- append-only replies ----------
create table if not exists public.portal_message_replies (
  id uuid primary key default gen_random_uuid(),
  portal_message_id uuid not null references public.portal_messages(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  sender_role text not null check (sender_role in ('customer','business')),
  sender_member_id uuid references public.company_members(id) on delete set null,
  sender_name text,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists portal_message_replies_thread_idx
  on public.portal_message_replies(portal_message_id, created_at);
create index if not exists portal_message_replies_company_idx
  on public.portal_message_replies(company_id, created_at desc);

alter table public.portal_message_replies enable row level security;
grant select, insert, update, delete on public.portal_message_replies to authenticated;
grant all on public.portal_message_replies to service_role;

-- Direct reads only for the same owner/admin managers who can read the inbox.
-- No direct insert/update/delete policies exist on purpose: every write goes
-- through the SECURITY DEFINER RPCs below (same hardening as portal_messages).
drop policy if exists "portal_message_replies read if owner/admin" on public.portal_message_replies;
create policy "portal_message_replies read if owner/admin"
  on public.portal_message_replies for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = portal_message_replies.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

-- ---------- internal helpers (never exposed to clients) ----------
-- One management alert row in the existing alert log. emergency_alerts
-- requires a sender member, so the alert is attributed to the company's
-- owner member; the message text states that a customer wrote. The dedupe
-- key doubles as the deep-link carrier (see header).
create or replace function public.portal_message_management_alert(
  p_company_id uuid, p_message_id uuid, p_reply_id uuid, p_text text)
returns void language plpgsql security definer set search_path='' as $$
declare v_owner uuid; v_location text; v_key text;
begin
  select id into v_owner from public.company_members
   where company_id=p_company_id and role='owner'
   order by created_at limit 1;
  if v_owner is null then return; end if;
  select l.name into v_location from public.locations l
   join public.portal_messages m on m.location_id=l.id
   where m.id=p_message_id;
  v_key := case when p_reply_id is null
    then 'customer_portal_request:'||p_message_id::text
    else 'customer_portal_reply:'||p_message_id::text||':'||p_reply_id::text end;
  insert into public.emergency_alerts(
    company_id,sender_member_id,audience,category,message,location_name,dedupe_key)
  values(p_company_id, v_owner, 'leaders', 'customer_portal',
    left(p_text,500), v_location, v_key)
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
end $$;
revoke all on function public.portal_message_management_alert(uuid,uuid,uuid,text)
  from public,anon,authenticated;

-- Thread rows for one request as JSON (both roles, chronological).
create or replace function public.portal_message_thread(p_message_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'sender_role',r.sender_role,'sender_name',r.sender_name,
    'body',r.body,'created_at',r.created_at
  ) order by r.created_at asc, r.id asc),'[]'::jsonb)
  from public.portal_message_replies r
  where r.portal_message_id=p_message_id;
$$;
revoke all on function public.portal_message_thread(uuid)
  from public,anon,authenticated;

-- What the customer sees: the append-only thread, preceded by the legacy
-- single response when one exists and no business reply has superseded it.
create or replace function public.portal_message_visible_thread(p_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_msg public.portal_messages%rowtype; v_thread jsonb;
begin
  select * into v_msg from public.portal_messages where id=p_message_id;
  if v_msg.id is null then return '[]'::jsonb; end if;
  v_thread := public.portal_message_thread(p_message_id);
  if v_msg.customer_response is not null and not exists (
    select 1 from public.portal_message_replies r
    where r.portal_message_id=p_message_id and r.sender_role='business'
  ) then
    v_thread := jsonb_build_array(jsonb_build_object(
      'id',null,'sender_role','business','sender_name',null,
      'body',v_msg.customer_response,
      'created_at',coalesce(v_msg.customer_responded_at, v_msg.created_at),
      'legacy',true
    )) || v_thread;
  end if;
  return v_thread;
end $$;
revoke all on function public.portal_message_visible_thread(uuid)
  from public,anon,authenticated;

-- ---------- no silent submissions: alert management on every new request ----------
-- Fires for the bearer-token API route (service role insert) and for the
-- authenticated submit RPC alike, so neither path can arrive unnoticed.
create or replace function public.notify_new_portal_message()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.portal_message_management_alert(
    new.company_id, new.id, null,
    'New customer request from portal: '||
      coalesce(nullif(new.sender_name,''),'Customer')||' — '||new.body);
  return new;
end $$;
revoke all on function public.notify_new_portal_message()
  from public,anon,authenticated;
drop trigger if exists portal_message_notify_management on public.portal_messages;
create trigger portal_message_notify_management
  after insert on public.portal_messages for each row
  execute function public.notify_new_portal_message();

-- ---------- business reply (management inbox) ----------
create or replace function public.post_portal_message_business_reply(
  p_message_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_msg public.portal_messages%rowtype;
        v_member public.company_members%rowtype;
        v_body text; v_id uuid;
begin
  v_body:=btrim(coalesce(p_body,''));
  if char_length(v_body) not between 10 and 1200 then
    raise exception 'Write a customer-safe response of 10 to 1200 characters.'
      using errcode='22023';
  end if;
  select * into v_msg from public.portal_messages where id=p_message_id;
  if v_msg.id is null then
    raise exception 'Request not found.' using errcode='P0002';
  end if;
  select * into v_member from public.company_members
   where company_id=v_msg.company_id and user_id=auth.uid()
     and role in ('owner','admin')
   limit 1;
  if v_member.id is null then
    raise exception 'Management access is required.' using errcode='42501';
  end if;
  -- Same document safety rail the inbox applies to the legacy response:
  -- never send a contract copy, link or file reference through the portal.
  if v_msg.category='document_copy' and (
       v_body ilike '%://%' or v_body ilike '%www.%'
       or v_body ~* '\.(pdf|docx?|zip)') then
    raise exception 'Do not paste document links, file paths or attachments into a customer-visible reply.'
      using errcode='22023';
  end if;
  insert into public.portal_message_replies(
    portal_message_id,company_id,location_id,sender_role,sender_member_id,sender_name,body)
  values(v_msg.id,v_msg.company_id,v_msg.location_id,'business',v_member.id,
    left(coalesce(nullif(v_member.display_name,''),v_member.email,'Management'),120), v_body)
  returning id into v_id;
  -- Mirror into the legacy single-response fields: the original history feeds
  -- keep showing the newest business response, and the 051 audit trigger
  -- records the change exactly like a saved inbox response.
  update public.portal_messages
     set customer_response=v_body,
         customer_responded_at=now(),
         read_at=coalesce(read_at,now())
   where id=v_msg.id;
  return jsonb_build_object('ok',true,'reply_id',v_id);
end $$;
revoke all on function public.post_portal_message_business_reply(uuid,text)
  from public,anon,authenticated;
grant execute on function public.post_portal_message_business_reply(uuid,text)
  to authenticated;

-- ---------- customer reply: shared location link (bearer token) ----------
create or replace function public.reply_to_portal_message_with_token(
  tok text, p_message_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pt public.portal_tokens%rowtype;
        v_msg public.portal_messages%rowtype;
        v_body text; v_id uuid; v_count integer;
begin
  if tok is null or char_length(tok)>128 then
    return jsonb_build_object('ok',false,'error','This link is not valid.');
  end if;
  v_body:=btrim(coalesce(p_body,''));
  if char_length(v_body) not between 1 and 1600 then
    return jsonb_build_object('ok',false,
      'error','Write a reply of 1 to 1600 characters.');
  end if;
  select * into pt from public.portal_tokens
   where token=<redacted> and (expires_at is null or expires_at>now());
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
  select count(*) into v_count from public.portal_message_replies
   where portal_message_id=v_msg.id and sender_role='customer'
     and created_at>now()-interval '1 hour';
  if v_count>=10 then
    return jsonb_build_object('ok',false,
      'error','Too many replies. Try again later.');
  end if;
  insert into public.portal_message_replies(
    portal_message_id,company_id,location_id,sender_role,sender_name,body)
  values(v_msg.id,v_msg.company_id,v_msg.location_id,'customer',
    left(coalesce(nullif(v_msg.sender_name,''),'Customer'),120), v_body)
  returning id into v_id;
  -- A follow-up on a resolved request reopens it and re-flags it unread so
  -- it returns to the management attention queue.
  update public.portal_messages
     set customer_status=case when customer_status='resolved'
                              then 'in_progress' else customer_status end,
         read_at=null
   where id=v_msg.id;
  perform public.portal_message_management_alert(
    v_msg.company_id, v_msg.id, v_id,
    'Customer replied: '||coalesce(nullif(v_msg.sender_name,''),'Customer')||
      ' — '||v_body);
  return jsonb_build_object('ok',true,'reply_id',v_id);
end $$;
revoke all on function public.reply_to_portal_message_with_token(text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.reply_to_portal_message_with_token(text,uuid,text)
  to anon,authenticated;

-- ---------- customer reply: authenticated portal ----------
create or replace function public.reply_workteams_authenticated_customer_request(
  p_company_id uuid, p_location_id uuid, p_message_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_contact uuid; v_contact_name text;
        v_msg public.portal_messages%rowtype;
        v_body text; v_id uuid; v_count integer;
begin
  v_body:=btrim(coalesce(p_body,''));
  if char_length(v_body) not between 1 and 1600 then
    raise exception 'Write a reply of 1 to 1600 characters.'
      using errcode='22023';
  end if;
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
  select count(*) into v_count from public.portal_message_replies
   where portal_message_id=v_msg.id and sender_role='customer'
     and created_at>now()-interval '1 hour';
  if v_count>=10 then
    raise exception 'Too many replies. Try again later.'
      using errcode='22023';
  end if;
  select ct.display_name into v_contact_name
   from public.client_portal_contacts ct where ct.id=v_contact;
  insert into public.portal_message_replies(
    portal_message_id,company_id,location_id,sender_role,sender_name,body)
  values(v_msg.id,v_msg.company_id,v_msg.location_id,'customer',
    left(coalesce(nullif(v_contact_name,''),'Customer'),120), v_body)
  returning id into v_id;
  update public.portal_messages
     set customer_status=case when customer_status='resolved'
                              then 'in_progress' else customer_status end,
         read_at=null
   where id=v_msg.id;
  perform public.portal_message_management_alert(
    v_msg.company_id, v_msg.id, v_id,
    'Customer replied: '||coalesce(nullif(v_contact_name,''),'Customer')||
      ' — '||v_body);
  return jsonb_build_object('ok',true,'reply_id',v_id);
end $$;
revoke all on function public.reply_workteams_authenticated_customer_request(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.reply_workteams_authenticated_customer_request(uuid,uuid,uuid,text)
  to authenticated;

-- ---------- conversation reads ----------
-- Shared link: status + thread only. The original message body, subject,
-- sender name and priority stay hidden on the shared link (051 rule).
create or replace function public.get_portal_message_conversation(
  tok text, p_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pt public.portal_tokens%rowtype; v_msg public.portal_messages%rowtype;
begin
  if tok is null or char_length(tok)>128 then
    return jsonb_build_object('ok',false,'error','This link is not valid.');
  end if;
  select * into pt from public.portal_tokens
   where token=<redacted> and (expires_at is null or expires_at>now());
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
      'created_at',v_msg.created_at),
    'replies',public.portal_message_visible_thread(v_msg.id));
end $$;
revoke all on function public.get_portal_message_conversation(text,uuid)
  from public,anon,authenticated;
grant execute on function public.get_portal_message_conversation(text,uuid)
  to anon,authenticated;

-- Authenticated: the verified contact also sees their own original message.
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
      'submitted_at',v_msg.created_at,'message',v_msg.body),
    'replies',public.portal_message_visible_thread(v_msg.id));
end $$;
revoke all on function public.get_workteams_authenticated_customer_conversation(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.get_workteams_authenticated_customer_conversation(uuid,uuid,uuid)
  to authenticated;
