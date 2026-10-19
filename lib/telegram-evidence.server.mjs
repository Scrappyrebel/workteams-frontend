// Private server-side transport only: never import this module into a client.
// Disabled by default; no paid Telegram broadcasts, user-supplied destinations,
// credentials in code, or direct browser-to-bot calls.
export const TELEGRAM_FREE_BOT_MAX_BYTES = 49_000_000;
const PHOTO_KINDS = new Set(["book_photo"]);
const VIDEO_KINDS = new Set(["shift_video"]);
const ALLOWED_PHOTOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_VIDEOS = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export function assessTelegramEvidence({ kind, media } = {}) {
  if (!media || typeof media.size !== "number" ||
      !Number.isSafeInteger(media.size) || media.size <= 0)
    return { eligible: false, reason: "missing_media" };
  if (media.size > TELEGRAM_FREE_BOT_MAX_BYTES)
    return { eligible: false, reason: "video_too_large_for_free_bot" };
  const type = String(media.type || "").toLowerCase().split(";")[0].trim();
  if (PHOTO_KINDS.has(kind) && ALLOWED_PHOTOS.has(type))
    return { eligible: true, method: "sendDocument", field: "document",
      filename: type === "image/png" ? "communication-book.png" :
        type === "image/webp" ? "communication-book.webp" : "communication-book.jpg",
      caption: "WorkTeams — communication book photo" };
  if (VIDEO_KINDS.has(kind) && ALLOWED_VIDEOS.has(type))
    return { eligible: true,
      method: type === "video/mp4" ? "sendVideo" : "sendDocument",
      field: type === "video/mp4" ? "video" : "document",
      filename: type === "video/mp4" ? "shift-video.mp4" :
        type === "video/webm" ? "shift-video.webm" : "shift-video.mov",
      caption: "WorkTeams — shift video" };
  return { eligible: false, reason: "unsupported_media_type" };
}

export function privateTelegramConfig(environment = {}) {
  if (environment.TELEGRAM_EVIDENCE_ENABLED !== "true") return null;
  const token = environment.TELEGRAM_EVIDENCE_BOT_TOKEN;
  const chatId = environment.TELEGRAM_EVIDENCE_CHAT_ID;
  // Only a fixed private channel or group numeric ID. Never accept a
  // chat destination, token, caption, media URL or user ID from app requests.
  if (typeof token !== "string" ||
      !/^\d{5,15}:[a-zA-Z0-9_-]{30,100}$/.test(token) ||
      typeof chatId !== "string" || !/^-\d{6,20}$/.test(chatId))
    return null;
  return { token, chatId };
}

/**
 * Deliver an already-authorized Blob to a private Telegram group/channel.
 * CALLER MUST verify the signed-in user, company scope, saved evidence row,
 * original storage path and retention authorization BEFORE fetching the Blob.
 * Do NOT pass arbitrary client-uploaded files or public URLs to this function.
 * Never delete the original on Telegram errors. The message ID is provider
 * acceptance only, not human display or retention confirmation.
 */
export async function sendEvidenceToPrivateTelegram({
  kind, media, environment = process.env, fetcher = fetch,
} = {}) {
  const config = privateTelegramConfig(environment);
  if (!config) return { ok: false, reason: "telegram_disabled_or_unconfigured" };
  const plan = assessTelegramEvidence({ kind, media });
  if (!plan.eligible) return { ok: false, reason: plan.reason };
  const form = new FormData();
  form.set("chat_id", config.chatId);
  form.set("caption", plan.caption);
  form.set("protect_content", "true");
  form.set("disable_notification", "false");
  // Explicitly refuse optional chargeable Telegram Stars/paid broadcasting.
  form.set("allow_paid_broadcast", "false");
  form.set(plan.field, media, plan.filename);
  let response;
  try {
    response = await fetcher(
      "https://api.telegram.org/bot" + config.token + "/" + plan.method,
      { method: "POST", body: form, cache: "no-store",
        redirect: "error", signal: AbortSignal.timeout(90_000) }
    );
  } catch {
    return { ok: false, reason: "telegram_transport_failed" };
  }
  if (!response.ok)
    return { ok: false, reason: response.status === 429 ?
      "telegram_rate_limited" : "telegram_provider_rejected" };
  try {
    const payload = await response.json();
    const mid = payload?.result?.message_id;
    const deliveredTo = payload?.result?.chat?.id;
    if (payload?.ok !== true || !Number.isSafeInteger(mid) || mid <= 0 ||
        String(deliveredTo) !== config.chatId)
      return { ok: false, reason: "telegram_receipt_unverified" };
    return { ok: true, messageId: mid, method: plan.method,
      // No file contents, bot secret or recipient ID in returned client UI.
      providerAccepted: true, humanReceiptVerified: false };
  } catch {
    return { ok: false, reason: "telegram_receipt_unverified" };
  }
}
