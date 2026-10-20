-- Security: authenticated-only RPCs must not accept anonymous calls.
-- These three functions require auth.uid() inside their existing bodies:
-- claim_invite links the signed-in user's membership by JWT email;
-- exam functions require enrollment/attempt ownership via auth.uid().
-- No definitions, users, training progress or RLS policies are modified.
DO $preflight$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
      AND (p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)) IN
      (('claim_invite',''),
       ('start_training_exam','p_enrollment_id uuid, p_kind text'),
       ('submit_training_exam','p_attempt_id uuid, p_answers jsonb'))
     ) <> 3 THEN
    RAISE EXCEPTION 'WorkTeams authenticated-only RPC preflight failed';
  END IF;
END
$preflight$;

REVOKE EXECUTE ON FUNCTION public.claim_invite() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_training_exam(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_training_exam(uuid, jsonb) FROM PUBLIC, anon;

DO $verify$
BEGIN
  IF has_function_privilege('anon','public.claim_invite()','EXECUTE')
     OR has_function_privilege('anon','public.start_training_exam(uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.submit_training_exam(uuid,jsonb)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.claim_invite()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.start_training_exam(uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.submit_training_exam(uuid,jsonb)','EXECUTE')
  THEN
    RAISE EXCEPTION 'WorkTeams authenticated-only RPC grant verification failed';
  END IF;
END
$verify$;
