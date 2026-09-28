-- ============================================================
-- WorkTeams Pass 3: Walkthroughs (room-by-room bid walkthroughs)
-- Run each section separately in the Supabase SQL Editor.
-- Walkthroughs contain bid strategy: owner/admin only.
-- ============================================================

-- ---------- Section 1: tables ----------

create table if not exists walkthroughs (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  bid_id uuid references bids(id) on delete set null,
  name text not null,
  notes text,
  created_at timestamptz default now()
);

create table if not exists walkthrough_areas (
  id uuid default gen_random_uuid() primary key,
  walkthrough_id uuid references walkthroughs(id) on delete cascade,
  area_name text not null,
  square_footage numeric not null default 0,
  tasks jsonb not null default '[]'::jsonb,
  notes text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ---------- Section 2: enable RLS ----------

alter table walkthroughs enable row level security;
alter table walkthrough_areas enable row level security;

-- ---------- Section 3: walkthroughs policies ----------
-- Owner/admin only: walkthroughs contain bid strategy and pricing data.

create policy "walkthroughs owner/admin only"
  on walkthroughs for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = walkthroughs.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "walkthroughs insert if owner/admin"
  on walkthroughs for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = walkthroughs.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "walkthroughs update if owner/admin"
  on walkthroughs for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = walkthroughs.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "walkthroughs delete if owner/admin"
  on walkthroughs for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = walkthroughs.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ---------- Section 4: walkthrough_areas policies ----------

create policy "walkthrough_areas owner/admin only"
  on walkthrough_areas for select
  using (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_areas.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "walkthrough_areas insert if owner/admin"
  on walkthrough_areas for insert
  with check (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_areas.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "walkthrough_areas update if owner/admin"
  on walkthrough_areas for update
  using (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_areas.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "walkthrough_areas delete if owner/admin"
  on walkthrough_areas for delete
  using (
    exists (
      select 1 from walkthroughs w
      join company_members m on m.company_id = w.company_id
      where w.id = walkthrough_areas.walkthrough_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
