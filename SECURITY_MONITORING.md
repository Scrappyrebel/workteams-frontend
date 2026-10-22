# WorkTeams: recurring security monitoring

## Automated monitoring

- Daily: GitHub Actions runs a production dependency vulnerability audit and an HTTPS homepage reachability check. This is not an authenticated penetration test.
- Weekly (Mondays): a deeper audit includes development dependencies and moderate-severity advisories.
- On PRs changing dependencies or this workflow: a read-only high/critical runtime dependency audit runs before merge.
- Monthly: Dependabot checks for updated packages and opens limited, review-required pull requests. Never auto-merge breaking or security fixes without validation.
- Check GitHub Actions run results and Security/Dependabot alerts. A workflow cannot send an owner notification unless GitHub notification settings are enabled.

## Monthly owner/security operator review

1. Confirm daily/weekly scans actually ran and investigate any failures, missed schedules, and outstanding high/critical vulnerabilities.
2. Review GitHub repository and Vercel access, owner/employee accounts, multifactor authentication, and least-privilege service identities.
3. Review Supabase Auth, tenant isolation/RLS policies, privileged API routes, database backups, and evidence of access attempts.
4. Review Backblaze B2 bucket permissions and retention/restore tests, plus document handling of customer photos/videos and access logs.
5. Review TLS and response security headers, session management, audit logs, incident escalation, and security patches affecting Node.js/Next.js.
6. Document findings, severity, remediation owner, completion date, and evidence. Fix critical exposed vulnerabilities immediately; do not wait for the monthly review.

## Incident response

- Suspected compromise: protect accounts, revoke or rotate exposed credentials **at the provider**, preserve logs and evidence, investigate affected tenant data, and engage qualified security/legal assistance to assess notification duties.
- Never commit secrets or incident customer data to GitHub, issues, workflow logs, or support chat.
- These checks reduce risk but do not prevent every attack or guarantee protection from lawsuits. Independently verify production protection and account for third-party services.
- For this repository: automated scans are limited to application manifests and public homepage checks. They do not validate database policy correctness, secret stores, backup restorability, or authenticated attacks.

## Dependency reproducibility note

Package-lock.json should be committed and match the deployed version to enable exact dependency auditing. A temporary lockfile resolves the latest allowed ranges and is **not proof** that deployed dependencies are safe.
