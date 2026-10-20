-- Security hardening: PostgreSQL trigger-only guard functions must not
-- be directly executable by anonymous or signed-in API roles.
-- Verified 2026-10-20 against the WorkTeams production catalog:
-- all six are SECURITY DEFINER, return pg_catalog.trigger and are already
-- attached to enabled triggers. No function bodies, policies or triggers
-- are changed by this migration.
DO $validate$
DECLARE number_found integer;
BEGIN
  SELECT count(*) INTO number_found
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = ANY(ARRAY[
    'companies_billing_guard',
    'company_members_guard',
    'same_company_guard',
    'training_approval_company_guard',
    'training_enrollment_guard',
    'training_step_progress_guard'
     ])
     AND p.prorettype = 'pg_catalog.trigger'::regtype
     AND p.prosecdef = true;
  IF number_found <> 6 THEN
    RAISE EXCEPTION 'WorkTeams trigger-helper guard mismatch: expected 6, found %', number_found;
  END IF;
END
$validate$;

REVOKE EXECUTE ON FUNCTION public.companies_billing_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.company_members_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.same_company_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.training_approval_company_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.training_enrollment_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.training_step_progress_guard() FROM PUBLIC, anon, authenticated;

-- Verify intended grants were removed. Do not revoke EXECUTE from
-- service_role or the function owner: background operations and
-- existing triggers must retain their expected permissions.
DO $verify$
DECLARE match_count integer;
BEGIN
  SELECT count(*) INTO match_count
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = ANY(ARRAY[
    'companies_billing_guard',
    'company_members_guard',
    'same_company_guard',
    'training_approval_company_guard',
    'training_enrollment_guard',
    'training_step_progress_guard'
     ])
     AND (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'));
  IF match_count <> 0 THEN
    RAISE EXCEPTION 'WorkTeams trigger-helper permissions verification failed';
  END IF;
END
$verify$;
