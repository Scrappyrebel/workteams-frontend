-- 047: Temp staffing Batch 2 — portal temp requests + client hours confirm.
--
-- * temp_job_requests.hours_confirmed: hours the client confirmed (null = not yet).
-- * temp_job_requests.customer_email now nullable: portal requests arrive via a
--   token link with no email on file (public booking still requires email).
-- * get_portal_data(): also returns temp_enabled (is temp staffing on for this
--   company?) and temp_requests (this client's requests, whitelisted fields only:
--   no temp names, no pay rates, no employee data, no GPS).

alter table public.temp_job_requests
  add column if not exists hours_confirmed numeric(10,2)
    check (hours_confirmed is null or hours_confirmed >= 0);

alter table public.temp_job_requests
  alter column customer_email drop not null;

create or replace function public.get_portal_data(tok text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pt record;
  loc_name text;
  loc_address text;
begin
  select * into pt from portal_tokens where token = tok;
  if pt.id is null then
    return jsonb_build_object('ok', false, 'error', 'This link is not valid.');
  end if;
  if pt.expires_at is not null and pt.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'This link has expired.');
  end if;
  select name, address into loc_name, loc_address from locations where id = pt.location_id;
  if loc_name is null then
    return jsonb_build_object('ok', false, 'error', 'This location is no longer available.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'client_name', pt.client_name,
    'location_name', loc_name,
    'location_address', loc_address,
    'temp_enabled', exists (
      select 1 from temp_agency_config
      where company_id = pt.company_id and enabled
    ),
    'temp_requests', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select id, service_type, cleaners_needed, hours_requested, hours_confirmed,
               job_date, status, site_address, created_at
        from temp_job_requests
        where company_id = pt.company_id
          and customer_name = pt.client_name
        order by created_at desc
        limit 20
      ) t
    ),
    'upcoming', (
      select coalesce(jsonb_agg(t order by t.shift_date, t.start_time), '[]'::jsonb)
      from (
        select shift_date, start_time, end_time
        from shifts
        where company_id = pt.company_id
          and location_id = pt.location_id
          and shift_date >= CURRENT_DATE
          and shift_date <= CURRENT_DATE + 14
        order by shift_date, start_time
        limit 20
      ) t
    ),
    'inspections', (
      select coalesce(jsonb_agg(t order by t.inspection_date desc), '[]'::jsonb)
      from (
        select inspection_date, score, notes
        from inspections
        where company_id = pt.company_id
          and location_id = pt.location_id
        order by inspection_date desc
        limit 5
      ) t
    ),
    'work_orders', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select title, description, status, priority, due_date
        from work_orders
        where company_id = pt.company_id
          and location_id = pt.location_id
          and status in ('open', 'in_progress')
        order by created_at desc
        limit 20
      ) t
    )
  );
end;
$$;
-- Grants survive CREATE OR REPLACE; re-assert for safety.
grant execute on function public.get_portal_data(text) to anon, authenticated;
