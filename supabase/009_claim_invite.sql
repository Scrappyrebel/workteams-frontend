-- Bulletproof invite claiming: lets a signed-in user attach their auth account
-- to any pending team invite (user_id null) matching their email, case-insensitive.
-- Security definer so it works regardless of RLS subtleties.
create or replace function public.claim_invite()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer := 0;
begin
  update public.company_members
  set user_id = auth.uid()
  where user_id is null
    and lower(email) = lower(auth.jwt() ->> 'email')
    and auth.uid() is not null;
  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

revoke all on function public.claim_invite() from public;
grant execute on function public.claim_invite() to authenticated;
