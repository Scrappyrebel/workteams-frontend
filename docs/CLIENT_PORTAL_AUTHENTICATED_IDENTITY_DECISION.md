# WorkTeams opt-in authenticated Customer Portal — implementation contract

Status: **Phase A approved architecture; Phase B guarded database foundation** (October 24, 2026).
This does not claim a customer login exists, that private files may be downloaded, or that real mobile acceptance has passed.

## Non-negotiable compatibility

WorkTeams currently grants **one-location, revocable bearer URLs** at `/portal/[token]`, with carefully limited quality, signed-contract summary, requests and upcoming-service data. Such links may be forwarded and do **not** identify a real person. They must never be upgraded to expose company-wide customer records, invoices, staff, internal notes, videos, passwords or private documents. Existing location links remain functional and unchanged.

New customer identity is **opt-in** per company, separate from `company_members` and payroll/employee auth. Business HQ and Workforce keep their own projects and approval models: no cross-project login or data sync. All customer content defaults unpublished. No background import of historical contracts/quality/documents.

## Architecture decision

Build a **separate authenticated route group**, `/customer-login` and `/customer-portal`, backed by this WorkTeams project's own Supabase verified-email Auth. The existing `/login`, `/app` and `/portal/[token]` routes retain their current authorization.

Actors: owner/admin (can approve contact and location), approved verified-email customer (may only read specifically granted published data and submit authorized customer requests), and existing location-link visitor (unchanged safe whitelisted token data). Never identify a customer using an employee membership, a forwarded bearer URL, user-editable auth metadata or email-only lookup.

## Minimal data model and security invariants

1. `client_portal_identity_settings`: per-company, **disabled by default**. No authenticated customer route can return data until explicitly switched on by an owner/admin in a future protected workflow.
2. `client_portal_contacts`: company-bound approved external contact, normalized approved email, preferred invitation language en/es, pending/active/disabled status, approving manager, timestamps. Not a company employee.
3. `client_portal_identity_links`: company/contact/auth.uid binding with an explicitly active grant and verified-email state; a disabled link cannot self-reactivate after sign-in or password recovery.
4. `client_portal_location_grants`: company/contact/location binding, start/end/revoked times, **all per-action permissions false by default** (contract, quality, requests, documents, services, signing). Database must reject company A contacts paired with company B locations.
5. `client_portal_publications` (later migration): explicit manager-release records per company/customer/location and document or report. Sensitive/unfinished items must remain private.
6. `client_portal_audit_events` (later migration): append-only manager changes and customer actions without tokens, passwords, signed URLs or PII in log metadata.

Enable RLS and deny all direct public/anon/authenticated table access in the foundation migration. Never grant privileged table access simply because a row exists. Future functions must be `SECURITY DEFINER SET search_path=''`, validate `auth.uid()` and trusted **verified** JWT email, require current approved contact + identity link + company feature flag + not-revoked exact location grant + the specific requested permission + explicit publication. Hide existence of forbidden companies/locations. Reject current-session errors fail closed. Reject missing or expired records on *every read and write*, not merely on initial page load.

## Verified invitation, login, and revocation lifecycle

1. Management enables opt-in for its company, then approves the specific contact and allowed company-owned locations. No blanket approval by company email domain or sign-up date.
2. Manager sends a bilingual invitation with a **noncredential URL** (no email/token/company ID embedded in query params); customer creates their own password and verifies the mailbox with Supabase Auth.
3. After verified sign-in, an idempotent claim function can link `auth.uid()` only to the active approved contact with the exact matching current verified email, inside the intended company. Do not automatically reactivate disabled identities.
4. Every dashboard/action/file request checks the fresh enabled flag, identity, contact, permitted location and publication. A customer can have multiple separately approved company/location grants; selecting one never broadens another.
5. Revoke a contact/location or turn feature OFF: immediately deny all further reads/writes, including old sessions and recovery logins; clear cached customer data on denial, logout and account switch. Historical customer audit remains internal.
6. Signed agreements and actual downloadable private files come **later**, after a reviewed private bucket, explicit publication, server-side byte proxy, file confidentiality/size checks, and phone/cross-tenant tests. The link-only portal never receives these.

## Phased rollout and test gates

- **A — Design:** document approval, route separation, threat model, per-company grant model, rollback path. No new end-user privileges.
- **B — Off-by-default schema:** create isolated, RLS-enabled, no-direct-grants foundation tables with location-company integrity and zero existing-user migration. Verify zero enabled companies, RLS, execute grants, database constraints, existing location-link data/count unchanged.
- **C — Owner/admin opt-in management:** explicit contact approval, select allowed locations, rotate/revoke and audit with protected manager APIs. Negative checks for unaffiliated employees and other companies.
- **D — Real customer identity:** separate bilingual sign-up/login/reset; verified email claim, account/location picker, no cross-account leakage, role-overlap denial, real recovery and revocation.
- **E — One published capability at a time:** scoped support and safe quality, then signed contracts, then private documents, and only after separate billing security review, invoices.
- **F — Nationwide acceptance:** real consenting customer/manager tests on Android/iPhone, two active tenant identities, unauthorized cross-company reads and writes, revocation mid-session, real delivery, accessible error/keyboard UX, service alerts.

Rollback Phase B without loss: leave flag OFF and tables inaccessible until Phase C, rather than destructive DROP statements. If later rollout fails, disable feature and revert new API/UI while keeping existing bearer portal functioning.

**Progress accounting:** This closes the original three-app roadmap item *design opt-in authenticated identity upgrade for WorkTeams*, not full customer-account delivery and not the separate 36-gate nationwide/customer-device acceptance metric. Never raise that broader percentage from design alone.
