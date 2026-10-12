-- 041: per-company timezone so "today," schedule day boundaries, alert
-- windows, and bid expiry are computed in the company's local time instead
-- of hardcoded America/Chicago. Defaults to Chicago (existing behavior).
alter table public.companies
  add column if not exists timezone text not null default 'America/Chicago';

comment on column public.companies.timezone is
  'IANA timezone for company-local date boundaries (schedule, alerts, bid expiry).';
