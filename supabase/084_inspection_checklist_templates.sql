-- WorkTeams inspection checklist templates (084).
--
-- WorkTeams inspections have always run on ONE standard checklist:
-- the same 8 items hard-coded in the inspections pages serve every
-- company, every location and every kind of site, and the starter
-- plans only re-order or focus those 8 items. A medical office, a
-- bank and a warehouse are inspected against identical lines, while
-- professional inspection tools (and this product's own HQ sibling)
-- run checklists tailored to the site or the kind of site.
--
-- This migration adds the storage for company-owned checklist
-- templates, shaped to this app's own model:
--
--   * One row per template in public.inspection_checklist_templates:
--     the company that owns it, a name, an optional site-type label
--     in the company's own words (locations carry no site type in
--     this app, so the label lives on the template), an optional
--     single location the template is meant for, and the checklist
--     items as an ordered jsonb array of label strings — the same
--     label-string shape sections already store in
--     inspection_items.checklist and inspection_checklist_results.
--   * Templates change nothing that exists: no existing table,
--     column, policy or row is touched. An inspection only ever uses
--     a template when an inspector picks it while starting that
--     inspection; every other inspection keeps the standard
--     checklist exactly as today. Sections saved from a template
--     store the template's labels as their checklist, which the
--     detail page already renders verbatim.
--   * Client code reads and writes this table fail-soft (the
--     established pattern from 068/073/075/076): until this migration
--     runs, the calls error quietly, the inspections page shows an
--     honest "turns on with the latest update" note, and inspections
--     behave exactly as they do today.
--
-- Security mirrors migration 076 (the per-item results posture),
-- scoped directly by company_id: any company member may read the
-- company's templates; only inspectors (owner / admin / supervisor
-- — the roles that may run inspections) may create or update them;
-- only owner / admin may delete. Deleting a company cascades to its
-- templates; deleting a location clears the template's optional
-- location link and keeps the template.
--
-- Expansion only. Protected areas are untouched: no time clock,
-- shift video or Communication Book table, function or file appears
-- here, and inspection photo storage is unchanged.

BEGIN;

create table if not exists public.inspection_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  site_type text,
  location_id uuid references public.locations(id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.inspection_checklist_templates is
  'Company-owned inspection checklist templates (migration 084): a named, ordered list of checklist item labels, optionally labelled with a site type in the company''s own words and optionally linked to one location. An inspection uses a template only when an inspector picks it at start; the standard checklist is unchanged.';
comment on column public.inspection_checklist_templates.items is
  'Ordered jsonb array of checklist item label strings, in the same label shape sections store in inspection_items.checklist.';
comment on column public.inspection_checklist_templates.site_type is
  'Optional free-text site-type label in the company''s own words (e.g. Medical office). Locations carry no site type in this app, so the label lives on the template; the app makes no compliance claim from it.';

create index if not exists inspection_checklist_templates_company_idx
  on public.inspection_checklist_templates (company_id);

grant select, insert, update, delete on public.inspection_checklist_templates to authenticated;
grant all on public.inspection_checklist_templates to service_role;
alter table public.inspection_checklist_templates enable row level security;

drop policy if exists "inspection_checklist_templates select if member" on public.inspection_checklist_templates;
create policy "inspection_checklist_templates select if member"
  on public.inspection_checklist_templates for select
  using (
    exists (
      select 1 from company_members m
      where m.company_id = inspection_checklist_templates.company_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "inspection_checklist_templates insert if inspector" on public.inspection_checklist_templates;
create policy "inspection_checklist_templates insert if inspector"
  on public.inspection_checklist_templates for insert
  with check (
    exists (
      select 1 from company_members m
      where m.company_id = inspection_checklist_templates.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'supervisor')
    )
  );

drop policy if exists "inspection_checklist_templates update if inspector" on public.inspection_checklist_templates;
create policy "inspection_checklist_templates update if inspector"
  on public.inspection_checklist_templates for update
  using (
    exists (
      select 1 from company_members m
      where m.company_id = inspection_checklist_templates.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'supervisor')
    )
  );

drop policy if exists "inspection_checklist_templates delete if owner/admin" on public.inspection_checklist_templates;
create policy "inspection_checklist_templates delete if owner/admin"
  on public.inspection_checklist_templates for delete
  using (
    exists (
      select 1 from company_members m
      where m.company_id = inspection_checklist_templates.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

COMMIT;
