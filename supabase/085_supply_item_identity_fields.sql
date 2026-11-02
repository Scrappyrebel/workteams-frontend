-- WorkTeams supply item identity fields (085).
--
-- The supplies item record (003, extended by 078) carries name, category,
-- quantity, unit, reorder level, cost, notes and condition — but nothing
-- that says WHO an item is bought from, WHAT code it is reordered under,
-- or WHERE the stock is kept. Real inventory practice records all three
-- on the item itself: a vendor/supplier, an SKU / item code used for
-- reordering and counting, and the place the stock lives.
--
-- This migration adds exactly those three fields to the EXISTING
-- supplies table — additive, nullable, no defaults that change any
-- existing row's meaning:
--
--   * vendor      — the supplier the item is bought from, in the
--                   company's own words (free text, like category).
--   * sku         — the item code used to reorder / count it (free text;
--                   no uniqueness is imposed — two pack sizes of one
--                   product can share a shelf name, and a code typed
--                   wrong must never block a save).
--   * location_id — the ONE place this item's stock is kept, pointing at
--                   the company's own locations record (001), set null
--                   if that location is ever deleted (the same pattern
--                   bids and work_orders use in 003).
--
-- What this migration deliberately does NOT do: per-location stock
-- LEVELS. supplies.quantity_on_hand stays the item's single on-hand
-- count, exactly as today — splitting one item's quantity across
-- several sites would change the movement / check-out / restock model
-- in 078 and is a separate product decision, not an additive field.
--
-- Security posture: no new table, no new policy, no grant change. The
-- three columns ride the supplies table's existing RLS and grants
-- (003/024). Vendor and SKU carry no money, so cost visibility is
-- untouched: costs stay exactly as visible as they are today
-- (managers see cost_per_unit in the UI; the member view never loads
-- or renders it). Nothing about quantity, movements, check-outs,
-- condition or restock requests changes.
--
-- Fail-soft: until this migration runs, the columns do not exist; the
-- supplies page probes and writes tolerantly, so the page (and every
-- existing supply row) behaves exactly as today. Vendor / SKU /
-- stocked-at simply turn on when the update lands.
--
-- Run in the Supabase SQL editor (project: WorkTeams). Paste the WHOLE
-- file into ONE query and run it ONCE — it is a single BEGIN..COMMIT.
-- Safe to re-run (idempotent). Expansion only.

BEGIN;

alter table public.supplies
  add column if not exists vendor text,
  add column if not exists sku text,
  add column if not exists location_id uuid references public.locations(id) on delete set null;

comment on column public.supplies.vendor is
  'Supply item vendor / supplier (migration 085): who the item is bought from, in the company''s own words. Optional; carries no cost information.';
comment on column public.supplies.sku is
  'Supply item SKU / item code (migration 085): the code used to reorder and count the item. Optional; no uniqueness is imposed.';
comment on column public.supplies.location_id is
  'Where this item''s stock is kept (migration 085): the single locations record the stock lives at. This is an association only — quantity_on_hand remains the item''s one on-hand count (no per-location stock levels). Set null if the location is deleted.';

COMMIT;
