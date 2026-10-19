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
- After the owner creates and approves a private Telegram channel/group and a
  bot with only necessary posting permissions, configure `TELEGRAM_EVIDENCE_BOT_TOKEN`
  and fixed numeric `TELEGRAM_EVIDENCE_CHAT_ID` as server secrets in each app.
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

## App-specific Telegram isolation
- This codebase belongs to **WorkTeams** only. Proposed private group: **WorkTeams Evidence** (owner creates it in Telegram).
- Use a separate, app-owned BotFather bot and token for this destination. Never share or copy the HetrixTools Control Hub emergency-alert bot credentials or destination.
- Configure this project's Telegram environment variables only after group ownership and bot posting rights are verified. Never reuse another app's numeric Telegram chat ID.
- No automatic posting, Telegram group creation, live delivery or production deployment has taken place.
