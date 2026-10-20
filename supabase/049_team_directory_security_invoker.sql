-- WorkTeams: replace the implicit SECURITY DEFINER roster view with an
-- authenticated invoker view backed by a narrowly scoped private helper.
--
-- Do not broaden SELECT on public.company_members: it contains personal data
-- not meant for ordinary employees. Do not change its existing RLS policies.
--
-- Public API clients may select only the four roster fields from team_directory.
-- The helper is in a NON-EXPOSED schema and must verify tenant membership
-- against auth.uid() regardless of caller-supplied filters.
CREATE SCHEMA IF NOT EXISTS workteams_security;
REVOKE ALL ON SCHEMA workteams_security FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA workteams_security TO authenticated;

CREATE OR REPLACE FUNCTION workteams_security.allowed_team_directory()
RETURNS TABLE (
  id uuid,
  company_id uuid,
  display_name text,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT m.id, m.company_id, m.display_name, m.role
  FROM public.company_members AS m
  WHERE auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.company_members AS me
      WHERE me.company_id = m.company_id
        AND me.user_id = auth.uid()
    )
$function$;

-- PostgreSQL normally grants EXECUTE on new functions to PUBLIC.
-- The private helper is callable by authenticated role only, is not
-- exposed as a public RPC, and returns no email, phone, or pay data.
REVOKE ALL ON FUNCTION workteams_security.allowed_team_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION workteams_security.allowed_team_directory() TO authenticated;

CREATE OR REPLACE VIEW public.team_directory
WITH (security_invoker = true, security_barrier = true)
AS
  SELECT d.id, d.company_id, d.display_name, d.role
  FROM workteams_security.allowed_team_directory() AS d;

REVOKE ALL ON TABLE public.team_directory FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.team_directory TO authenticated;

-- View columns, names, and client query shapes remain unchanged.
-- Runtime isolation/regression checks are performed separately against
-- the active database, not merely inferred from the migration text.
