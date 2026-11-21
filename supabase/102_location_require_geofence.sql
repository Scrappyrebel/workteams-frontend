-- 102_location_require_geofence.sql
-- Per-location "require geofence" tick box (Wendy, 2026-11-18 offline
-- fix requirements): a location with no signal gets the tick REMOVED,
-- and the clock-in route then skips the server-side geofence check
-- for that location. Default TRUE = today's behavior everywhere —
-- nothing changes until a manager unticks a location.
-- Additive and safe to run once; the app reads/writes the column
-- fail-soft until this has run.

alter table public.locations
  add column if not exists require_geofence boolean not null default true;
