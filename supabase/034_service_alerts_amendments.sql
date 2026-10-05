-- 034: service alert categories on portal messages + contract amendments.

-- Service alerts: clients can flag a message as a service problem or callback request.
alter table public.portal_messages
  add column if not exists category text not null default 'general'
    check (category in ('general', 'service_problem', 'callback_request')),
  add column if not exists priority text not null default 'normal'
    check (priority in ('normal', 'high', 'urgent'));

-- Contract amendments: owner proposes a change (price, scope, dates, terms);
-- client reviews and signs in the portal. Signed amendments become part of the contract.
create table if not exists public.contract_amendments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  title text not null,
  description text not null,
  -- What changes (JSON: e.g. {price_per_visit: 95, visits_per_week: 3})
  changes jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'signed', 'declined')),
  sign_token text unique,
  signed_name text,
  signed_at timestamptz,
  signature_image text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.contract_amendments to authenticated;
grant all on public.contract_amendments to service_role;
alter table public.contract_amendments enable row level security;

-- Include amendments in the portal data function.
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
    'contract', (
      select jsonb_build_object(
        'id', c.id,
        'start_date', c.start_date,
        'end_date', c.end_date,
        'visits_per_week', c.visits_per_week,
        'price_per_visit', c.price_per_visit,
        'yearly_increase_pct', c.yearly_increase_pct,
        'extra_clean_price', c.extra_clean_price,
        'heavy_clean_price', c.heavy_clean_price,
        'scope_of_work', c.scope_of_work,
        'terms_text', c.terms_text,
        'status', c.status,
        'signed_name', c.signed_name,
        'signed_at', c.signed_at
      )
      from contracts c
      where c.company_id = pt.company_id
        and c.location_id = pt.location_id
        and c.status in ('sent', 'signed')
      order by c.created_at desc
      limit 1
    ),
    'amendments', (
      select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb)
      from (
        select am.id, am.title, am.description, am.changes, am.status,
               am.sign_token, am.signed_name, am.signed_at, am.created_at
        from contract_amendments am
        join contracts c on c.id = am.contract_id
        where c.company_id = pt.company_id
          and c.location_id = pt.location_id
          and am.status in ('sent', 'signed', 'declined')
        order by am.created_at desc
      ) a
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

grant execute on function public.get_portal_data(text) to anon, authenticated;
