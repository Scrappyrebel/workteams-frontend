-- 20261111: OPTIONAL hardening — client punch ID on time_entries
--
-- STATUS: NOT required for the clock-punch delivery guarantee
-- (branch fix/clock-punch-guarantee) and DO NOT RUN as part of that fix.
-- The guarantee already holds without this column:
--   * clock-out is intrinsically idempotent — it targets one specific
--     entry, and the API answers an already-closed entry with its
--     recorded state, so a retried delivery is a safe no-op;
--   * clock-in cannot create a second open entry (the route refuses
--     while one is open), and the client reconciles retries by read-back.
--
-- What this column would add, if Wendy chooses to run it later: the
-- client-generated punch ID (already minted on the phone and already
-- sent with every clock-in / clock-out request) could be STORED on the
-- entry, making server-side dedupe exact instead of inferential, and
-- giving support a permanent ID tying a phone-side punch record to the
-- server row. Wiring the routes to write/check the column is a small
-- follow-up change that only makes sense AFTER this runs.
--
-- Safe to re-run (idempotent). No data is changed; the column is
-- nullable and the unique index only covers rows that carry an ID.

alter table public.time_entries
  add column if not exists client_punch_id uuid;

create unique index if not exists time_entries_client_punch_id_key
  on public.time_entries (client_punch_id)
  where client_punch_id is not null;
