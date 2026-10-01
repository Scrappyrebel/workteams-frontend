-- ============================================================
-- WorkTeams 022: Stripe subscription fields
-- Run once in the Supabase SQL Editor.
-- ============================================================

-- Track Stripe billing state per company.
alter table public.companies
  add column if not exists stripe_customer_id text;
alter table public.companies
  add column if not exists stripe_subscription_id text;
alter table public.companies
  add column if not exists subscription_status text default 'none';

-- Link each tier to its Stripe Price so checkout always charges
-- the right amount. Price IDs below are the LIVE-mode prices
-- (Stripe account acct_1ULjy4PbewE99a3J). The original test-mode IDs
-- (price_1ULkJpPmKUszCOm4..., price_1ULkJrPmKUszCOm4...,
--  price_1ULkJsPmKUszCOm4...) must never be used with a live secret key:
-- going forward, price changes are made through /api/admin/tier-prices,
-- which creates the matching Stripe Price first and only then updates
-- both columns together.
alter table public.product_tiers
  add column if not exists stripe_price_id text;

update public.product_tiers set stripe_price_id = 'price_1ULllePbewE99a3JQWYz2wD1' where tier = 'starter';
update public.product_tiers set stripe_price_id = 'price_1ULllfPbewE99a3JOaVrHonX' where tier = 'plus';
update public.product_tiers set stripe_price_id = 'price_1ULllhPbewE99a3JsaFUmbNI' where tier = 'pro';
