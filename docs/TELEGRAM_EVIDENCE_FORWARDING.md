# Private Telegram evidence forwarding — staged, NOT activated

Applies to this application's employee shift recordings and communication book
photos. This initial source-only integration adds the safe FREE Bot API transport,
offline policy tests and a no-preview-build development branch. It **does not
yet connect to the live clock-out flow** or send actual customer/employee media.

## Telegram costs and limitations
- Telegram's ordinary Bot API messages are free under rate limits.
- Never turn on Paid Broadcasts, paid media or Telegram Stars.
- The built-in Bot API accepts files up to 50 MB; this transport intentionally
  caps uploads at 49,000,000 bytes. Larger videos require an independently
  designed secure upload/compression path, not truncation or silent loss.
- Existing recorded videos may reach hundreds of megabytes. Do not falsely
  claim that a 50 MB Bot API upload covers ten-minute source recordings.
- Telegram is **not zero-cost infrastructure**: outbound transfer/compute from
  Vercel or a future B2 worker may be billable. No such worker is started here.

## Privacy and safe activation
- Default OFF: `TELEGRAM_EVIDENCE_ENABLED` must be `true` on a trusted server
  before messages can be attempted. Never put bot token, channel ID or provider
  credentials in NEXT_PUBLIC variables, source, GitHub comments, or chat.
- After the owner creates one PRIVATE Telegram group per company in this app and
  a separate bot for this app with necessary posting permissions, configure
  `TELEGRAM_EVIDENCE_BOT_TOKEN` and `TELEGRAM_EVIDENCE_COMPANY_GROUPS_JSON`
  in this app's server secrets only. The JSON maps verified persisted company IDs
  to unique negative private Telegram group chat IDs; there is NO global default.
- No browser ever receives the token, and no employee may choose the destination.
- Call the transport only AFTER server-side user/company/proof-ownership/RLS
  checks, proof record verification and authorized storage download. Never
  make arbitrary client-supplied URLs or paths fetchable by a privileged worker.
- Copy exact photo bytes as a Document so the evidence image is not silently
  recompressed. MP4 sends as video; WebM/MOV as original file documents.
- Telegram provider acceptance is not phone display, app proof save or human review.
  Store durable deduplication/idempotency and per-file failure status before rollout.

## Seven-day retention is not automatic on Telegram
- Telegram Bot API's deleteMessage normally only allows deleting messages less
  than 48 hours old. Therefore a seven-day app cleanup cannot depend on calling
  deleteMessage seven days later.
- A private channel/group may use Telegram's 7-day auto-delete, but this applies
  across messages, not a per-video owner `retain` exception.
- Maintain originals and selective `retain` rules in approved private B2
  storage. Confirm the new upload AND the app's ability to play it before
  retiring the old Supabase media copy. Telegram cannot by itself ensure secure
  company-specific source access or selective evidence retention.
- Telegram cloud chats with bots are not end-to-end encrypted secret chats.
  Keep channel membership restricted and do not send unnecessary personal data.

## Rollout gates (not done)
1. Owner-private channel/group and bot; trusted destination and permissions.
2. Reviewed Backblaze B2 credentials, signed upload/download path, worker costs.
3. Implement server-side authorization and duplicate-safe delivery linkage for
   communication book photos and **whole** videos across this app's real proof
   workflows. Save receipts and failures; do not block original clock-out.
4. Run offline security checks, real iPhone/Android and desktop tests with a
   clearly authorized private test file. Verify playback, delivery and retention.
5. Only with owner approval enable production and move media writes away from
   Supabase without breaking existing video/player/hold logic.

## Mandatory per-company, per-app Telegram isolation
- **WorkTeams** uses its own bot credentials; never reuse Control Hub/HetrixTools secrets or group.
- Every company inside **WorkTeams** gets a DIFFERENT private Telegram group, created/owned by the company administrator. There is NOT one shared "WorkTeams Evidence" group across all companies.
- Mapping format (example identifiers only): `TELEGRAM_EVIDENCE_COMPANY_GROUPS_JSON='{"company-a-uuid":"-1001111111111","company-b-uuid":"-1002222222222"}'`. Actual company IDs come from verified persisted company records, NOT caller requests.
- The server refuses to send for an unconfigured company, invalid JSON, duplicate destinations, public chat IDs, or disabled configuration. Never fall back to an app-wide group. If the Telegram receipt references a different group, treat delivery as failed.
- Adding a new company must NOT grant any other tenant access. Future owner-only company settings UI needs verified company membership, audit history, collision checks and a nonsecret display of group status.
- One bot per app may be added to its company groups, or separate bots can be approved for stronger isolation. Neither may be added to another app's groups.
- The operator must confirm every new company's PRIVATE group, posting rights, consent and account membership before enabling its forwarding; no group is created by this code.
- Media transport remains disabled and not connected to live recorder/book uploads. No tests involving real company evidence or paid services have been run.

## Owner-only group discovery prepared for these two existing companies

After the WorkTeams app is accessible again and its owner-approved release is deployed:

1. Sign in as the **company owner**; open company Settings.
2. Under **Private Telegram evidence group**, click **Get this company's setup command**.
3. In Telegram open **WorkTeams Message App** for Lilly B's Janitorial or
   **WorkTeams Temp Agency** for Lilly B's Temp Cleaning Staffing.
4. Paste the FULL company/day-specific `/wtverify_…@YourWorkTeamsBot` command.
   Privacy mode can remain enabled. Telegram holds unconfirmed updates only
   temporarily (usually up to 24 hours), so do not send a command days early.
5. Return to Settings and press **Verify this Telegram group**. It performs
   an on-demand, server-only Telegram `getMe` / `getUpdates` read without
   acknowledging/consuming any updates. Only an owner of the selected persisted
   company may see that company's matching private group.
6. Read the verified candidate negative numeric group ID. An invalid, wrong
   company, missing, multiple, or reused group does not become activated.
7. **No routing setting is saved by discovery.** A future authorized
   company-scoped configuration step must persist unique company-to-group
   mappings and validate bot group membership before evidence forwarding.

Do not run paid Vercel deploys or activate forwarding just to discover groups;
this screen is staged in a draft PR and is not presently live. The token already
saved in WorkTeams Vercel Production is not exposed to the client or GitHub.
Control Hub / HetrixTools and other apps do not share that token or destinations.

## Staged durable binding — NOT migrated or live
- A source-only migration `supabase/048_telegram_evidence_groups.sql` defines a
  one-to-one company/group mapping. Database uniqueness prevents a private group
  being used for two separate company IDs.
- Company owner verification **will** save the first verified group into this
  table after the migration is safely applied and feature code approved for
  production. Repeating verification of the same group is idempotent.
- The owner setup screen refuses to overwrite another assigned group; changes
  require a separate reviewed flow. No anonymous or authenticated direct
  writes to the binding table.
- `enabled` defaults to false and cannot be changed by this migration.
  The existing `TELEGRAM_EVIDENCE_ENABLED` is also absent/false. Nothing is
  posted to Telegram just because a company group is saved.
- Bot media forwarding does NOT yet read this database table; that is a
  later release requiring video and photo integrity, company access enforcement,
  verified receipts, per-file retention and full phone tests.

- **Additional private-group safeguard:** Discovery rejects Telegram groups with a public `@username`, even if someone posts a matching company verification command and the group title appears correct.
