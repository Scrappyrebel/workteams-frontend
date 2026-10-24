# Client Portal — coordinated three-app parity register (October 24, 2026)

**Owner directive:** Adapt customer portal improvements across Business HQ, Workforce Management and WorkTeams, preserving each app's own company accounts, permissions, storage and deployment. Control Hub is separate. An app-specific security limitation is not permission to silently expose more information.

| Capability | Business HQ | Workforce Management | WorkTeams |
| --- | --- | --- | --- |
| Customer identity | Password and verified-email customer account | Approved customer email and login | **Location-bound revocable link; not a login account** |
| Quick navigation, attention | Existing bilingual action center | Companion Workforce PR | **This PR:** visits, quality, work, contract, amendments, services, temp, contact |
| Reliable submissions | Duplicate/write guards and safe retries | Companion Workforce PR | **This PR:** messages, service, temporary staffing, confirmed hours, amendment signatures |
| Service and complaint contact | Support messages + requests | Customer Service request history | Location-linked contact with owner notification |
| Agreements | Contract changes and e-signatures | Amendment sign/decline | Location contract summary and link-limited amendment signatures |
| Quality | Manager-published customer-safe inspections | Not yet published to customers | Existing recent quality scores; future consented publication guard needed |
| Documents / invoices | Metadata, separate download and provider-hosted payment model | Approved agreement and external payment links | **Not present here:** public token must never expose private billing data or staff records |
| Access management | Email roles, locations, disable/revoke | Approved client email and company RLS | Create, rotate, expire or revoke individual location tokens |

**Important:** Full functional parity cannot mean blindly copying Business HQ account RPCs into WorkTeams' no-login token portal. Password/email verification, billing, complete document downloads, private inspections and historical customer messaging require a separate authenticated/permissioned architecture. Never expose internal inspection notes, wages, employee names, private media or bank information via `get_portal_data()`. Do not broaden the published token RPC without explicit tenant/location security tests.

**Next batches:** Verify the customer-facing inspection whitelist and manager publication semantics in each Supabase project; build safe customer-document retrieval and status history; test phone layouts and real customer access. All three apps must pass their own protected build, field validation and deployment checks. Each future customer portal change should be compared against this register; document safe variants or blocked capability separately.
