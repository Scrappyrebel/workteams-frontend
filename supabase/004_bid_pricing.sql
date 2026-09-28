-- ============================================================
-- WorkTeams Pass 3 follow-up: hourly + square-footage bid pricing
-- Run this block in the Supabase SQL Editor.
-- Existing bids keep pricing_mode = 'line_items' (unchanged behavior).
-- ============================================================

alter table bids add column if not exists pricing_mode text not null default 'line_items' check (pricing_mode in ('line_items', 'hourly', 'sqft'));
alter table bids add column if not exists hours numeric;
alter table bids add column if not exists hourly_rate numeric;
alter table bids add column if not exists square_footage numeric;
alter table bids add column if not exists rate_per_sqft numeric;

-- ---------- Market rate areas ----------
-- Per-area going rates ($/sq ft and $/hr) so bids can be checked
-- against what an area typically pays. Owner/admin only.

create table if not exists rate_areas (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  rate_per_sqft numeric,
  rate_per_hour numeric,
  notes text,
  created_at timestamptz default now()
);

alter table locations add column if not exists rate_area_id uuid references rate_areas(id) on delete set null;

alter table rate_areas enable row level security;

create policy "rate_areas owner/admin only"
  on rate_areas for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = rate_areas.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "rate_areas insert if owner/admin"
  on rate_areas for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = rate_areas.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "rate_areas update if owner/admin"
  on rate_areas for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = rate_areas.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "rate_areas delete if owner/admin"
  on rate_areas for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = rate_areas.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
