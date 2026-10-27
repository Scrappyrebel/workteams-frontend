-- WorkTeams inspection per-item structured results (076).
--
-- WorkTeams inspections are sectioned forms: migration 035 gave each
-- inspection its sections (public.inspection_items — one row per room
-- or area, with its own 1–5 score and notes), and migration 036 added
-- the section's checklist column: a jsonb array holding the labels of
-- the standard checklist items the inspector ticked as passed. That
-- array is all the per-item record there has ever been — an item that
-- was not ticked leaves no trace at all, so "failed", "not applicable"
-- and "never looked at" are indistinguishable, and no item can carry
-- its own score or note.
--
-- Workforce's Dept 1 build (its PR #257 / migration 258) records
-- per-item pass/issue/N-A + a 0–5 score + a note as structured rows;
-- this is the WorkTeams parity piece (completion audit item A8),
-- shaped to this app's own model instead of copied from Workforce's:
--
--   * One row per checklist item per section, in the new table
--     public.inspection_checklist_results, tied to BOTH the inspection
--     and the section (inspection_items row) it belongs to.
--   * The section form keeps its existing ticked = passed checkboxes,
--     and the checklist jsonb keeps being written exactly as today —
--     the section score and the overall average do not move. The new
--     rows are additive detail recorded alongside: an item's outcome
--     ('pass' / 'issue' / 'na'), an optional 0–5 score, an optional
--     note. An item with nothing recorded gets no row.
--   * unique (inspection_item_id, item_label): one result per item
--     per section, structurally.
--   * Old inspections simply have no rows here; every surface renders
--     them exactly as before. Client code reads and writes this table
--     fail-soft (the established pattern from 068/073/075): until this
--     migration runs, the calls error quietly and inspections behave
--     exactly as they do today.
--
-- Security mirrors migration 036 (the sections table's own posture):
-- any company member may read; only inspectors (owner / admin /
-- supervisor — the roles that may add sections) may insert or update;
-- only owner / admin may delete. Company scoping joins through the
-- inspection, exactly as 036 scopes inspection_items. Deleting a
-- section or an inspection cascades to its results.
--
-- Expansion only: no existing table, policy, page wording or flow is
-- changed by this migration. Protected areas are untouched: no time
-- clock, shift video or Communication Book table, function or file
-- appears here.

BEGIN;

create table if not exists public.inspection_checklist_results (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  inspection_item_id uuid not null references public.inspection_items(id) on delete cascade,
  item_label text not null,
  outcome text check (outcome in ('pass', 'issue', 'na')),
  score int check (score >= 0 and score <= 5),
  note text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (inspection_item_id, item_label)
);

comment on table public.inspection_checklist_results is
  'Per-item structured results for inspection checklists (migration 076): one row per checklist item per inspection section, carrying the item outcome (pass/issue/na), an optional 0-5 score and an optional note, alongside the section''s existing ticked-passed checklist jsonb.';
comment on column public.inspection_checklist_results.inspection_item_id is
  'The inspection section (inspection_items row) this result belongs to; named for the sections table it references.';
comment on column public.inspection_checklist_results.outcome is
  'pass / issue / na, or null when the inspector recorded only a score or a note for the item.';

create index if not exists inspection_checklist_results_inspection_idx
  on public.inspection_checklist_results (inspection_id);
create index if not exists inspection_checklist_results_section_idx
  on public.inspection_checklist_results (inspection_item_id);

grant select, insert, update, delete on public.inspection_checklist_results to authenticated;
grant all on public.inspection_checklist_results to service_role;
alter table public.inspection_checklist_results enable row level security;

drop policy if exists "inspection_checklist_results select if member" on public.inspection_checklist_results;
create policy "inspection_checklist_results select if member"
  on public.inspection_checklist_results for select
  using (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_checklist_results.inspection_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "inspection_checklist_results insert if inspector" on public.inspection_checklist_results;
create policy "inspection_checklist_results insert if inspector"
  on public.inspection_checklist_results for insert
  with check (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_checklist_results.inspection_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'supervisor')
    )
  );

drop policy if exists "inspection_checklist_results update if inspector" on public.inspection_checklist_results;
create policy "inspection_checklist_results update if inspector"
  on public.inspection_checklist_results for update
  using (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_checklist_results.inspection_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'supervisor')
    )
  );

drop policy if exists "inspection_checklist_results delete if owner/admin" on public.inspection_checklist_results;
create policy "inspection_checklist_results delete if owner/admin"
  on public.inspection_checklist_results for delete
  using (
    exists (
      select 1 from inspections i
      join company_members m on m.company_id = i.company_id
      where i.id = inspection_checklist_results.inspection_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

COMMIT;
