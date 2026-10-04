alter table public.emergency_alerts
  add column if not exists category text not null default 'emergency',
  add column if not exists dedupe_key text;

create unique index if not exists emergency_alerts_company_dedupe_idx
  on public.emergency_alerts(company_id, dedupe_key)
  where dedupe_key is not null;
