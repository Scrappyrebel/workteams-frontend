-- ============ 029: emergency alerts + push subscriptions ============

create table if not exists public.emergency_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sender_member_id uuid not null references public.company_members(id) on delete cascade,
  audience text not null check (audience in ('owner', 'leaders')),
  message text not null,
  location_name text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.company_members(id) on delete set null
);

grant select, insert, update, delete on public.emergency_alerts to authenticated;
grant all on public.emergency_alerts to service_role;

alter table public.emergency_alerts enable row level security;

-- Any member can raise an alert; anyone can read their company's alerts;
-- only managers+ can acknowledge.
drop policy if exists "emergency insert if member" on public.emergency_alerts;
create policy "emergency insert if member"
  on public.emergency_alerts for insert
  with check (public.is_company_member(emergency_alerts.company_id));

drop policy if exists "emergency select if member" on public.emergency_alerts;
create policy "emergency select if member"
  on public.emergency_alerts for select
  using (public.is_company_member(emergency_alerts.company_id));

drop policy if exists "emergency ack if supervisor+" on public.emergency_alerts;
create policy "emergency ack if supervisor+"
  on public.emergency_alerts for update
  using (
    public.is_company_member(emergency_alerts.company_id)
    and exists (
      select 1 from public.company_members m
      where m.company_id = emergency_alerts.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'supervisor')
    )
  )
  with check (
    public.is_company_member(emergency_alerts.company_id)
    and exists (
      select 1 from public.company_members m
      where m.company_id = emergency_alerts.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'supervisor')
    )
  );

-- Web-push subscriptions, one row per device.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (member_id, endpoint)
);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

alter table public.push_subscriptions enable row level security;

-- Members manage only their own subscriptions; writes also go via the API.
drop policy if exists "push_subs own only" on public.push_subscriptions;
create policy "push_subs own only"
  on public.push_subscriptions for all
  using (
    exists (
      select 1 from public.company_members m
      where m.id = push_subscriptions.member_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.company_members m
      where m.id = push_subscriptions.member_id
        and m.user_id = auth.uid()
    )
  );
