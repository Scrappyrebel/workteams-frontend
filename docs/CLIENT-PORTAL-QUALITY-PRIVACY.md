# WorkTeams Client Portal quality publication — security release notes

This WorkTeams customer portal uses bearer links, not Business HQ's verified customer-login model. Do not transplant Business HQ's customer/account RPC or reveal internal records to the link.

## Before this release
The live `get_portal_data` function included free-text inspection notes, work-order descriptions, and temporary-staffing request lookup by customer name. Those fields are **not** automatically customer-approved. The new migration restricts the query and makes inspection publication explicitly opt-in.

## New owner/admin process
1. Finish an inspection and record an overall score.
2. Open the inspection detail screen (owner or admin only).
3. Write a customer-safe summary, 10–600 characters. Avoid internal staff names, access instructions, photos, incident notes and sensitive details.
4. Publish. The authorized location link then shows only the inspection date, score, and the approved summary. Publication is stored as an immutable event for a later audit.
5. Withdraw or update from the same screen. Latest publication event determines visibility. No old record becomes automatically published.

## Data controls
- New publication log has RLS and no direct anon/authenticated table grants. Authenticated manager actions verify active company membership and role.
- No report is visible by default; historical inspections remain private.
- Client-link temp requests are scoped by `portal_token_id`; same-name records no longer cross customer links. Revocation removes association. Historic unbound temp requests (if any) are not exposed retroactively.
- Existing signed contracts, upcoming visits, work-order status, link controls and external payment boundaries are not changed.
- An invalid/expired token receives the existing generic denial response.
- Migration must be installed in WorkTeams project **hkmkerzjzuxwyotgkoua** before publication controls are deployed; cross-app Supabase projects are not interchangeable.

## Test gates
Existing protected prebuild plus `check-client-portal-quality-privacy.mjs`, Vercel preview, Supabase schema/auth-grant and negative caller checks, then merged production READY and runtime checks. Real customer test with a valid currently-authorized token remains a separate gate.
