-- 097_company_documents.sql
-- WorkTeams Documents & Forms (D-WT-58, decided by Wendy 2026-11-06):
-- the company document library. Rows live here; files live in the
-- private "company-documents" storage bucket (created below).
-- Access: a company's own members may read its rows; only company
-- managers/owners may insert, update or delete (public.is_company_manager,
-- the migration-043 pattern). The per-document role floor (min_role) is
-- applied in the app on top of this company boundary.
-- Run once, as a single transaction, in the WorkTeams project.

begin;

create table if not exists public.company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  category text not null default 'general',
  storage_key text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  min_role text not null default 'employee'
    check (min_role in ('employee','supervisor','manager','owner')),
  uploaded_by uuid references public.company_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists company_documents_company_idx
  on public.company_documents (company_id, created_at desc);

alter table public.company_documents enable row level security;

drop policy if exists company_documents_member_read on public.company_documents;
create policy company_documents_member_read on public.company_documents
  for select to authenticated
  using (exists (
    select 1 from public.company_members cm
    where cm.company_id = company_documents.company_id
      and cm.user_id = auth.uid()
  ));

drop policy if exists company_documents_manager_write on public.company_documents;
create policy company_documents_manager_write on public.company_documents
  for all to authenticated
  using (public.is_company_manager(company_id))
  with check (public.is_company_manager(company_id));

grant select, insert, update, delete on public.company_documents to authenticated;
grant all on public.company_documents to service_role;

-- Private storage bucket for the library files (never the shift-video buckets).
insert into storage.buckets (id, name, public)
values ('company-documents', 'company-documents', false)
on conflict (id) do nothing;

-- Storage: members of the company named in the first path segment may
-- read its files; managers/owners of that company may write and delete.
drop policy if exists company_documents_storage_read on storage.objects;
create policy company_documents_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-documents'
    and exists (
      select 1 from public.company_members cm
      where cm.company_id::text = (storage.foldername(name))[1]
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists company_documents_storage_write on storage.objects;
create policy company_documents_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-documents'
    and public.is_company_manager(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists company_documents_storage_delete on storage.objects;
create policy company_documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-documents'
    and public.is_company_manager(((storage.foldername(name))[1])::uuid)
  );

commit;
