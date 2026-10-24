-- WorkTeams Customer Portal direct-message write hardening.
-- Customer service requests are written exclusively through the guarded
-- SECURITY DEFINER RPC. Legacy bearer forms use private server credentials.
-- Owners/admins continue to manage status/replies via scoped SELECT/UPDATE.
revoke insert on public.portal_messages from anon,authenticated;
-- Ensure no accidental manager/member INSERT RLS policy was introduced.
-- RLS is already enabled and the protected public bearer service unchanged.
