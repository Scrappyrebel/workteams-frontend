-- 036: RLS policies for inspection_items (missing in 035 — blocked section creation)
-- + checklist column for per-section task checkoffs.

alter table public.inspection_items
  add column if not exists checklist jsonb not null default '[]'::jsonb;

create policy "inspection_items select if member"
  on inspection_items for select
  using (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_items.inspection_id and m.user_id = auth.uid()
    )
  );

create policy "inspection_items insert if inspector"
  on inspection_items for insert
  with check (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_items.inspection_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'supervisor')
    )
  );

create policy "inspection_items update if inspector"
  on inspection_items for update
  using (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_items.inspection_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'supervisor')
    )
  );

create policy "inspection_items delete if owner/admin"
  on inspection_items for delete
  using (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_items.inspection_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
