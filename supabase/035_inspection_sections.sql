-- 035: room-by-room inspection sections.
-- One inspection per location visit; each inspection has multiple sections
-- (rooms/areas), each with its own score, notes, and photos.

create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  section_name text not null,
  score int check (score >= 1 and score <= 5),
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.inspection_items to authenticated;
grant all on public.inspection_items to service_role;
alter table public.inspection_items enable row level security;

-- Photos can now belong to a specific section (item) or the inspection overall.
alter table public.inspection_photos
  add column if not exists inspection_item_id uuid references public.inspection_items(id) on delete cascade;
