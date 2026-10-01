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
-- the right amount. Price IDs are from the Stripe test-mode products.
alter table public.product_tiers
  add column if not exists stripe_price_id text;

update public.product_tiers set stripe_price_id = 'price_1ULkJpPmKUszCOm4TQn0nfo0' where tier = 'starter';
update public.product_tiers set stripe_price_id = 'price_1ULkJrPmKUszCOm4hQTD2aqI' where tier = 'plus';
update public.product_tiers set stripe_price_id = 'price_1ULkJsPmKUszCOm4oXspVNLa' where tier = 'pro';
