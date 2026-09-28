-- ============================================================
-- WorkTeams Pass 3: Pro tier (bids, work orders, supplies,
-- client portal, profitability)
-- Run each section separately in the Supabase SQL Editor.
-- ============================================================

-- ---------- Section 1: tables ----------

create table if not exists bids (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  client_name text not null,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),
  valid_until date,
  created_at timestamptz default now()
);

create table if not exists bid_items (
  id uuid default gen_random_uuid() primary key,
  bid_id uuid references bids(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists work_orders (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  assigned_to uuid references company_members(id) on delete set null,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists supplies (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  category text,
  quantity_on_hand numeric not null default 0,
  unit text default 'units',
  reorder_level numeric not null default 0,
  cost_per_unit numeric,
  notes text,
  created_at timestamptz default now()
);

create table if not exists portal_tokens (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  token text not null unique,
  client_name text,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists revenue_entries (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  amount numeric not null,
  description text,
  entry_date date not null default CURRENT_DATE,
  created_at timestamptz default now()
);

create table if not exists expense_entries (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  amount numeric not null,
  description text,
  entry_date date not null default CURRENT_DATE,
  created_at timestamptz default now()
);

-- Per-member hourly rate used for labor-cost estimates on the
-- profitability page. Informational only — WorkTeams never runs payroll.
alter table company_members add column if not exists hourly_rate numeric;

-- ---------- Section 2: enable RLS ----------

alter table bids enable row level security;
alter table bid_items enable row level security;
alter table work_orders enable row level security;
alter table supplies enable row level security;
alter table portal_tokens enable row level security;
alter table revenue_entries enable row level security;
alter table expense_entries enable row level security;

-- ---------- Section 3: bids + bid_items policies ----------
-- Bids contain pricing: owner/admin only. Employees never see them.

create policy "bids owner/admin only"
  on bids for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = bids.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "bids insert if owner/admin"
  on bids for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = bids.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "bids update if owner/admin"
  on bids for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = bids.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "bids delete if owner/admin"
  on bids for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = bids.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "bid_items select if owner/admin"
  on bid_items for select
  using (
    exists (
      select 1 from bids b
      join company_members m on m.company_id = b.company_id
      where b.id = bid_items.bid_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "bid_items insert if owner/admin"
  on bid_items for insert
  with check (
    exists (
      select 1 from bids b
      join company_members m on m.company_id = b.company_id
      where b.id = bid_items.bid_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "bid_items update if owner/admin"
  on bid_items for update
  using (
    exists (
      select 1 from bids b
      join company_members m on m.company_id = b.company_id
      where b.id = bid_items.bid_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "bid_items delete if owner/admin"
  on bid_items for delete
  using (
    exists (
      select 1 from bids b
      join company_members m on m.company_id = b.company_id
      where b.id = bid_items.bid_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ---------- Section 4: work_orders policies ----------
-- Owner/admin see everything. Members see only work orders assigned to them.
-- Assigned members may update (the app only exposes status controls to them).

create policy "work_orders select if member"
  on work_orders for select
  using (
    public.is_company_member(work_orders.company_id)
    and (
      public.is_company_owner_admin(work_orders.company_id)
      or exists (
        select 1 from company_members m
        where m.id = work_orders.assigned_to
          and m.user_id = auth.uid()
      )
    )
  );

create policy "work_orders insert if owner/admin"
  on work_orders for insert
  with check (public.is_company_owner_admin(work_orders.company_id));

create policy "work_orders update if owner/admin or assignee"
  on work_orders for update
  using (
    public.is_company_owner_admin(work_orders.company_id)
    or exists (
      select 1 from company_members m
      where m.id = work_orders.assigned_to
        and m.user_id = auth.uid()
    )
  );

create policy "work_orders delete if owner/admin"
  on work_orders for delete
  using (public.is_company_owner_admin(work_orders.company_id));

-- ---------- Section 5: supplies policies ----------
-- The supplies page is manager-only in the app, so cost_per_unit is never
-- shown to employees. (Row-level: members can read stock rows.)

create policy "supplies select if member"
  on supplies for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = supplies.company_id and m.user_id = auth.uid()
    )
  );

create policy "supplies insert if owner/admin"
  on supplies for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = supplies.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "supplies update if owner/admin"
  on supplies for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = supplies.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "supplies delete if owner/admin"
  on supplies for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = supplies.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ---------- Section 6: portal_tokens policies + public portal function ----------
-- Tokens are managed by owner/admin. Public (no-login) portal reads go
-- through get_portal_data(), which returns only whitelisted fields.

create policy "portal_tokens select if owner/admin"
  on portal_tokens for select
  using (public.is_company_owner_admin(portal_tokens.company_id));

create policy "portal_tokens insert if owner/admin"
  on portal_tokens for insert
  with check (public.is_company_owner_admin(portal_tokens.company_id));

create policy "portal_tokens delete if owner/admin"
  on portal_tokens for delete
  using (public.is_company_owner_admin(portal_tokens.company_id));

create or replace function public.get_portal_data(tok text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pt record;
  loc_name text;
  loc_address text;
begin
  select * into pt from portal_tokens where token = tok;
  if pt.id is null then
    return jsonb_build_object('ok', false, 'error', 'This link is not valid.');
  end if;
  if pt.expires_at is not null and pt.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'This link has expired.');
  end if;
  select name, address into loc_name, loc_address from locations where id = pt.location_id;
  if loc_name is null then
    return jsonb_build_object('ok', false, 'error', 'This location is no longer available.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'client_name', pt.client_name,
    'location_name', loc_name,
    'location_address', loc_address,
    'upcoming', (
      select coalesce(jsonb_agg(t order by t.shift_date, t.start_time), '[]'::jsonb)
      from (
        select shift_date, start_time, end_time
        from shifts
        where company_id = pt.company_id
          and location_id = pt.location_id
          and shift_date >= CURRENT_DATE
          and shift_date <= CURRENT_DATE + 14
        order by shift_date, start_time
        limit 20
      ) t
    ),
    'inspections', (
      select coalesce(jsonb_agg(t order by t.inspection_date desc), '[]'::jsonb)
      from (
        select inspection_date, score, notes
        from inspections
        where company_id = pt.company_id
          and location_id = pt.location_id
        order by inspection_date desc
        limit 5
      ) t
    ),
    'work_orders', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select title, description, status, priority, due_date
        from work_orders
        where company_id = pt.company_id
          and location_id = pt.location_id
          and status in ('open', 'in_progress')
        order by created_at desc
        limit 20
      ) t
    )
  );
end;
$$;

grant execute on function public.get_portal_data(text) to anon, authenticated;

-- ---------- Section 7: revenue + expense policies ----------
-- Financial entries: owner/admin only. Employees never see them.

create policy "revenue_entries owner/admin only"
  on revenue_entries for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = revenue_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "revenue_entries insert if owner/admin"
  on revenue_entries for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = revenue_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "revenue_entries update if owner/admin"
  on revenue_entries for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = revenue_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "revenue_entries delete if owner/admin"
  on revenue_entries for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = revenue_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "expense_entries owner/admin only"
  on expense_entries for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = expense_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "expense_entries insert if owner/admin"
  on expense_entries for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = expense_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "expense_entries update if owner/admin"
  on expense_entries for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = expense_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "expense_entries delete if owner/admin"
  on expense_entries for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = expense_entries.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
