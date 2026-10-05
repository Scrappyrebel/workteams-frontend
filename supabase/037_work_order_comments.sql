-- Work order comments/updates
create table if not exists public.work_order_comments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  author_id uuid references public.company_members(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.work_order_comments to authenticated;
grant all on public.work_order_comments to service_role;

alter table public.work_order_comments enable row level security;

drop policy if exists "work_order_comments select if member" on public.work_order_comments;
create policy "work_order_comments select if member"
  on public.work_order_comments for select
  using (
    public.is_company_member(work_order_comments.company_id)
    and (
      public.is_company_owner_admin(work_order_comments.company_id)
      or exists (
        select 1 from public.work_orders wo
        where wo.id = work_order_comments.work_order_id
          and wo.assigned_to in (
            select m.id from public.company_members m where m.user_id = auth.uid()
          )
      )
    )
  );

drop policy if exists "work_order_comments insert if member" on public.work_order_comments;
create policy "work_order_comments insert if member"
  on public.work_order_comments for insert
  with check (
    public.is_company_member(work_order_comments.company_id)
    and (
      public.is_company_owner_admin(work_order_comments.company_id)
      or exists (
        select 1 from public.work_orders wo
        where wo.id = work_order_comments.work_order_id
          and wo.assigned_to in (
            select m.id from public.company_members m where m.user_id = auth.uid()
          )
      )
    )
  );

drop policy if exists "work_order_comments delete if owner/admin" on public.work_order_comments;
create policy "work_order_comments delete if owner/admin"
  on public.work_order_comments for delete
  using (public.is_company_owner_admin(work_order_comments.company_id));
