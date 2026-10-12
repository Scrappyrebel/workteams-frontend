-- 044: per-service-type bill rates for the temp agency.
-- Lets the owner price each job type differently (commercial vs residential
-- vs construction vs warehouse) instead of one flat base rate.

alter table public.temp_agency_config
  add column if not exists service_rates jsonb not null default '{
    "commercial": 25,
    "residential": 25,
    "move_in_out": 25,
    "construction_cleanup": 30,
    "day_janitorial": 26,
    "other": 26
  }'::jsonb;
