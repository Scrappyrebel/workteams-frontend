-- Product tier prices, editable by the product owner (not hardcoded).
-- Run once in the WorkTeams Supabase project. Idempotent: safe to re-run.

create table if not exists public.product_tiers (
  tier text primary key,
  price numeric not null,
  updated_at timestamptz not null default now()
);

insert into public.product_tiers (tier, price) values
  ('starter', 30),
  ('plus', 150),
  ('pro', 225)
on conflict (tier) do update
  set price = excluded.price, updated_at = now();

-- Grants (required).
grant select on public.product_tiers to anon, authenticated;
grant update on public.product_tiers to authenticated;
grant all on public.product_tiers to service_role;

alter table public.product_tiers enable row level security;

-- Everyone (including the public landing page) can read prices.
drop policy if exists "anyone can read tier prices" on public.product_tiers;
create policy "anyone can read tier prices"
  on public.product_tiers for select
  using (true);

-- Only the product owner can change prices. Update the email if yours differs.
drop policy if exists "product owner can set tier prices" on public.product_tiers;
create policy "product owner can set tier prices"
  on public.product_tiers for update
  using (auth.jwt() ->> 'email' = 'lillybsjanitorial@gmail.com')
  with check (auth.jwt() ->> 'email' = 'lillybsjanitorial@gmail.com');
