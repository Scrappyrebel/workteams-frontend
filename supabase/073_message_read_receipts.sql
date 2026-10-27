-- WorkTeams crew-chat read receipts (073).
--
-- Announcements in WorkTeams happen in the crew chat (the messages table,
-- migration 002) — there is no separate announcements feature. Until now
-- nobody could tell who had actually seen a message: the chat carried no
-- read state of any kind. Workforce's Dept 9 build gave its announcements
-- read receipts (its migration 266); this is the WorkTeams parity piece,
-- shaped to this app's own model.
--
-- Design — a per-member "seen through" watermark, not a row per message:
--
--   * The crew chat is ONE continuous company-wide stream. The chat page
--     loads the stream whole (newest 200, chronological) and re-polls it,
--     so "member X has seen message Y" is exactly "the newest message
--     timestamp X has loaded is at or after Y's timestamp". One row per
--     member records that watermark:
--     public.message_read_receipts(company_id, member_id, seen_through_at).
--   * The poster of a message (and managers — owner/admin, the roles this
--     app calls Manager) see, under that message in the chat, who has seen
--     it and who has not, by name: the roster is the existing
--     team_directory view, and a member counts as seen when their
--     watermark is at or after the message's created_at. The poster is
--     never listed as not-seen on their own message.
--   * Recording is best-effort and fail-soft, like the push notify that
--     already rides this page: the chat page upserts its own watermark
--     after a successful load, inside a try/catch, never awaited in a way
--     that can block reading or posting. Until this migration runs the
--     table simply is not there; the page's receipt reads/writes fail
--     quietly and the chat behaves exactly as today.
--
-- Security:
--
--   * RLS is company-scoped and mirrors migration 068's own-row pin: a
--     member can insert or update ONLY the row whose member_id is their
--     own company_members row in that company, so nobody can forge a
--     receipt for another member. Any member of the company can read the
--     company's rows (that is what the seen-by list is); nobody outside
--     the company can read any.
--   * Policies carry the same Plus tier gate as the messages table
--     itself (migration 024): below Plus the chat is locked, and so are
--     its receipts.
--   * No delete policy and no delete grant: a receipt is only ever
--     advanced, never erased (same reasoning as 068's preferences).
--
-- Expansion only: no existing table, policy, page wording or flow is
-- changed by this migration.

BEGIN;

create table if not exists public.message_read_receipts (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  seen_through_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (company_id, member_id)
);

comment on table public.message_read_receipts is
  'Crew-chat read receipts: one row per member, seen_through_at is the created_at of the newest crew-chat message that member has loaded. A member has seen a message when their watermark is at or after the message''s created_at.';
comment on column public.message_read_receipts.seen_through_at is
  'Watermark: created_at of the newest messages-table row this member had loaded in the crew chat. Only ever advances.';

create index if not exists message_read_receipts_company_idx
  on public.message_read_receipts(company_id);

alter table public.message_read_receipts enable row level security;

grant select, insert, update on public.message_read_receipts to authenticated;
grant all on public.message_read_receipts to service_role;
-- No delete: a receipt is only ever advanced, never erased.

drop policy if exists "message read receipts select if member" on public.message_read_receipts;
create policy "message read receipts select if member"
  on public.message_read_receipts for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = message_read_receipts.company_id
        and m.user_id = auth.uid()
    )
    and public.company_tier_meets(message_read_receipts.company_id, 'plus')
  );

drop policy if exists "message read receipts insert own" on public.message_read_receipts;
create policy "message read receipts insert own"
  on public.message_read_receipts for insert
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = message_read_receipts.company_id
        and m.user_id = auth.uid()
        and m.id = message_read_receipts.member_id
    )
    and public.company_tier_meets(message_read_receipts.company_id, 'plus')
  );

drop policy if exists "message read receipts update own" on public.message_read_receipts;
create policy "message read receipts update own"
  on public.message_read_receipts for update
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = message_read_receipts.company_id
        and m.user_id = auth.uid()
        and m.id = message_read_receipts.member_id
    )
    and public.company_tier_meets(message_read_receipts.company_id, 'plus')
  )
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = message_read_receipts.company_id
        and m.user_id = auth.uid()
        and m.id = message_read_receipts.member_id
    )
    and public.company_tier_meets(message_read_receipts.company_id, 'plus')
  );

COMMIT;
