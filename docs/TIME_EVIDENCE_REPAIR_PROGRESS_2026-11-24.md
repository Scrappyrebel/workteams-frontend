# Time and evidence repair progress — November 24, 2026

Status: DRAFT, issue #236. Production main unchanged. No production acceptance claimed.

Implemented:
- Local active shift projects durable, employee/company-scoped punches over server snapshots, so offline clock-in exposes clock-out and pending clock-out cannot be resurrected by reconnect reads.
- Original capture timestamps travel to the real clock APIs. A clock-in punch UUID becomes the time-entry UUID; exact retries work even after the shift closes, without requiring an optional migration.
- Clock-in authorization still checks the assigned schedule, role/pay and required geofence. The schedule checks evaluate the original capture time rather than reconnect time. Invalid/future times stay rejected for review.
- Clock-out uses a scoped conditional update and returns an already-closed row without replacing its time. Missing coordinates stay null.
- Both time controls save before GPS. A local elapsed counter stops as soon as finishing time is stored.
- Pending/closed proof remains separate. Evidence context can recover from pending clock-out records or confirmed rows with upload_pending.
- Worker updates still check automatically but no longer force page reloads.
- Queue failure/retry/corruption fixes, and durable media writes before uploads. Media storage failure is reported honestly; it never silently succeeds in memory.
- Next.js patched 16.4.2 -> 16.4.6 after the build/security diagnostic; fake-indexeddb is a test-only dependency.

Executed:
- npm ci: PASS.
- npm run build: PASS after the security patch, including all existing prebuild checks and the new tests; Next compilation and 75 static pages completed.
- Build output: 241 node:test passes in 42 groups plus other scenario/contract scripts. These include static checks; they are NOT 241 real-device tests.
- scripts/check-punch-recovery.mjs: six behavioral cases PASS.
- scripts/check-offline-shift-repair.mjs: eight cases PASS using real route bodies/fake database, complete offline shift/reopen/order/two-hour total, isolation, invalid times, required geofence and automatic worker updates without reload.
- scripts/check-media-vault.mjs: five checks PASS, including IndexedDB operations and no false durable success.
- npm audit --omit=dev after patch: zero vulnerabilities.

Still required before release:
- Authenticated preview/database/RLS acceptance and actual iPhone/Android, restart, interruption and all requirement-switch combinations.
- Cross-tab/device concurrency; legacy queued-punch compatibility after the deterministic-ID change; lost-response/cold-start combinations beyond the automated fixtures.
- Cleaning-only Communication Book eligibility is not yet implemented correctly across WorkTeams: company schema/context lacks a verified industry discriminator. Per-site independent video/book policy, server completion policy and settings/navigation need coordinated repair. Do not infer a business type from a name or waive proof globally.
- Full in-progress recording recovery, real frozen/incomplete picture testing, exact server attachment/playback/notification/retention checks, payroll exports and manager audit/queue visibility.
- Production environment and deployment SHA not independently verified. No launch/payroll readiness signoff.

Conflict review: PR #198 also modifies package.json/package-lock.json; do not merge its older dependency state over this patch. PR #23 touches shared package/settings/Telegram code; routing preserved. Other open feature PRs were inventoried and none merged.
Database migrations run: NONE. Production writes: NONE. Deployments: NONE.
Backup, rollback, signed-in/device acceptance and owner approval are required before protected production merge/deployment. Connecteam stays official payroll.


## Additional repair verification and launch authorization

The owner authorized launching the verified repairs in this thread. This does not turn incomplete verification into a pass. Production migrations and deployment are tracked separately below.

Full build passed after company/industry/site policy, durable confirmation receipts, offline identity recovery and proof-finalization repairs. Added real IndexedDB recovery tests, exact migration on PostgreSQL, and eight actual route-handler completion cases. Fixed clock-screen hook initialization order and ensured newer manager corrections/closure override stale confirmation receipts. Photo retries use content hashes and verify object size, scoped row and attachment receipt before removing the original. Production migration is not yet applied; the earlier service confirmation expired without schema changes.

Authenticated production browser and actual physical Android/iPhone/restart tests have not been completed. No production deployment or payroll cutover is claimed. Connecteam remains the official payroll record. Earlier unresolved cross-device, damaged-track and full offline recovery acceptance items still require verification before calling the whole application launch-ready.
