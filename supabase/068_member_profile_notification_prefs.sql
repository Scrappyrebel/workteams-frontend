-- WorkTeams member self-profile + notification preferences (068).
-- Two employee self-service gaps from the forms inventory:
--
--   * G3 — employees could not view or edit ANY of their own details; every
--     change went through a manager on the Team page. This migration adds
--     the contact fields the team model was missing (phone, emergency
--     contact) and a narrow SECURITY DEFINER RPC, update_my_profile(), that
--     lets a member update ONLY their own display name and contact fields.
--     Pay (member_pay), role and departments stay manager-only: the RPC
--     touches four named columns on the caller's own row and nothing else —
--     the same discipline as claim_invite() (009), and the reason there is
--     deliberately no new client-side UPDATE policy on company_members
--     (session.js documents why: a direct UPDATE would let a member rewrite
--     role/pay/company on their own row; the company_members_guard trigger
--     in 024 backstops role changes, but departments/email are not guarded,
--     so the RPC is the only write path).
--
--   * I4 — notification settings were a single device push on/off. This
--     migration adds per-member, per-category phone-notification choices
--     (schedule changes, messages/announcements, customer replies, pay).
--     Rows are absent by default = every category ON, exactly the behavior
--     before preferences existed. Send paths read this table through a
--     tolerant server helper (lib/notification-prefs.js): until this
--     migration runs, every send behaves as all-on.
--
-- Client code probes for the new columns/function/table and falls back
-- gracefully, so the app keeps working unchanged until this is run.

-- ---------- member contact fields ----------

alter table public.company_members
  add column if not exists phone text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

-- companies carries column-level SELECT grants (024), so new member contact
-- columns get their SELECT grant stated explicitly as well: managers read
-- them on the Team page through the existing member policies.
grant select (phone, emergency_contact_name, emergency_contact_phone)
  on public.company_members to authenticated;

-- ---------- self-profile RPC (the only self-service write path) ----------

create or replace function public.update_my_profile(
  p_company_id uuid,
  p_display_name text,
  p_phone text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members%rowtype;
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_ec_name text := nullif(btrim(coalesce(p_emergency_contact_name, '')), '');
  v_ec_phone text := nullif(btrim(coalesce(p_emergency_contact_phone, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Your name must be between 1 and 80 characters.';
  end if;
  if v_phone is not null and char_length(v_phone) > 40 then
    raise exception 'That phone number is too long.';
  end if;
  if v_ec_name is not null and char_length(v_ec_name) > 80 then
    raise exception 'That emergency contact name is too long.';
  end if;
  if v_ec_phone is not null and char_length(v_ec_phone) > 40 then
    raise exception 'That emergency contact phone is too long.';
  end if;

  select * into v_member
  from public.company_members
  where company_id = p_company_id and user_id = auth.uid();
  if v_member.id is null then
    raise exception 'You are not on this company''s team.';
  end if;

  update public.company_members
  set display_name = v_name,
      phone = v_phone,
      emergency_contact_name = v_ec_name,
      emergency_contact_phone = v_ec_phone
  where id = v_member.id
  returning * into v_member;

  return jsonb_build_object(
    'id', v_member.id,
    'display_name', v_member.display_name,
    'phone', v_member.phone,
    'emergency_contact_name', v_member.emergency_contact_name,
    'emergency_contact_phone', v_member.emergency_contact_phone
  );
end;
$$;

revoke all on function public.update_my_profile(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_my_profile(uuid, text, text, text, text) to authenticated;

-- ---------- per-category notification preferences ----------

create table if not exists public.member_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  schedule_changes boolean not null default true,
  messages boolean not null default true,
  customer_replies boolean not null default true,
  pay boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (company_id, member_id)
);
create index if not exists member_notification_preferences_member_idx
  on public.member_notification_preferences(member_id);

alter table public.member_notification_preferences enable row level security;
grant select, insert, update on public.member_notification_preferences to authenticated;
grant all on public.member_notification_preferences to service_role;
-- No delete: turning a category back on is an update; absence of a row
-- already means "all on".

drop policy if exists "notification prefs select own or manager" on public.member_notification_preferences;
create policy "notification prefs select own or manager"
  on public.member_notification_preferences for select
  using (
    public.is_company_owner_admin(member_notification_preferences.company_id)
    or exists (
      select 1 from public.company_members m
      where m.company_id = member_notification_preferences.company_id
        and m.user_id = auth.uid()
        and m.id = member_notification_preferences.member_id
    )
  );

drop policy if exists "notification prefs insert own" on public.member_notification_preferences;
create policy "notification prefs insert own"
  on public.member_notification_preferences for insert
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = member_notification_preferences.company_id
        and m.user_id = auth.uid()
        and m.id = member_notification_preferences.member_id
    )
  );

drop policy if exists "notification prefs update own" on public.member_notification_preferences;
create policy "notification prefs update own"
  on public.member_notification_preferences for update
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = member_notification_preferences.company_id
        and m.user_id = auth.uid()
        and m.id = member_notification_preferences.member_id
    )
  )
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = member_notification_preferences.company_id
        and m.user_id = auth.uid()
        and m.id = member_notification_preferences.member_id
    )
  );
