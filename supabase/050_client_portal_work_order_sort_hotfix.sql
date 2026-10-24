-- WorkTeams customer portal valid-token production hotfix.
-- The get_portal_data implementation orders work orders by t.created_at,
-- so its inner projection MUST include created_at.
-- Preserve all privacy restrictions and authorized publications from 049.
create or replace function public.get_portal_data(tok text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pt record;
  loc_name text;
  loc_address text;
begin
  select * into pt from public.portal_tokens where token = tok;
  if pt.id is null then
    return jsonb_build_object('ok', false, 'error', 'This link is not valid.');
  end if;
  if pt.expires_at is not null and pt.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'This link has expired.');
  end if;
  select name, address into loc_name, loc_address from public.locations where id = pt.location_id and company_id = pt.company_id;
  if loc_name is null then
    return jsonb_build_object('ok', false, 'error', 'This location is no longer available.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'client_name', pt.client_name,
    'location_name', loc_name,
    'location_address', loc_address,
    'temp_enabled', exists (
      select 1 from public.temp_agency_config
      where company_id = pt.company_id and enabled
    ),
    'temp_requests', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select id, service_type, cleaners_needed, hours_requested, hours_confirmed,
               job_date, status, site_address, created_at
        from public.temp_job_requests
        where company_id = pt.company_id
          and portal_token_id = pt.id
        order by created_at desc
        limit 20
      ) t
    ),
    'upcoming', (
      select coalesce(jsonb_agg(t order by t.shift_date, t.start_time), '[]'::jsonb)
      from (
        select shift_date, start_time, end_time
        from public.shifts
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
        select i.inspection_date, i.score, publication.customer_summary
        from public.inspections i
        join lateral (
          select pub.published,pub.customer_summary,pub.company_id,pub.location_id
          from public.client_portal_inspection_publications pub
          where pub.inspection_id = i.id
          order by pub.created_at desc,pub.id desc limit 1
        ) publication on publication.published = true
         and publication.company_id = i.company_id
         and publication.location_id = i.location_id
        where i.company_id = pt.company_id
          and i.location_id = pt.location_id
        order by inspection_date desc
        limit 5
      ) t
    ),
    'work_orders', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select title, null::text as description, status, priority, due_date, created_at
        from public.work_orders
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
