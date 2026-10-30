import { createHash, createHmac, randomUUID } from "node:crypto";

/**
 * Private Backblaze B2 S3-compatible presigning foundation.
 * This is disabled by default and cannot be connected until a NEW private media
 * bucket, scoped key, tenant checks and end-to-end testing are in place.
 * Never run this module in a browser or put credentials in NEXT_PUBLIC_ vars.
 */
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PRODUCT = /^workteams$/;
const MEDIA = { shift_video: "video", communication_book_photo: "book" };

function encode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, ch =>
    "%" + ch.charCodeAt(0).toString(16).toUpperCase());
}
function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}
function requireText(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(label + " is not configured.");
  return value;
}

/** Disabled by default; does not reveal secrets or enable media transfers. */
export function readPrivateB2MediaConfig(env = process.env) {
  if (env.WORKTEAMS_B2_PRIVATE_MEDIA_ENABLED !== "true") return null;
  const region = requireText(env.WORKTEAMS_B2_MEDIA_REGION, "B2 media region");
  const bucket = requireText(env.WORKTEAMS_B2_MEDIA_BUCKET, "B2 media bucket");
  const keyId = requireText(env.WORKTEAMS_B2_MEDIA_KEY_ID, "B2 media key ID");
  const appKey = requireText(env.WORKTEAMS_B2_MEDIA_APPLICATION_KEY, "B2 media application key");
  if (!/^[a-z]{2}-[a-z]+-\d{3}$/.test(region))
    throw new Error("Invalid B2 media region.");
  if (!/^[a-z0-9][a-z0-9.-]{4,61}[a-z0-9]$/.test(bucket))
    throw new Error("Invalid B2 media bucket.");
  if (bucket.startsWith("hq-recovery-") || bucket.startsWith("hq-video-recovery-") || bucket==="lillybs-workforce-media-2026")
    throw new Error("Recovery buckets cannot store routine media.");
  return { region, bucket, keyId, appKey };
}

/** Call ONLY after verifying employee owns the shift in the exact company. */
export function createPrivateMediaObjectKey({ productId, companyId, entryId, kind }) {
  if (!PRODUCT.test(productId) || !UUID.test(companyId) ||
      !UUID.test(entryId) || !Object.hasOwn(MEDIA, kind))
    throw new Error("Invalid tenant-scoped media identifiers.");
  return [productId, companyId, entryId, MEDIA[kind], randomUUID()].join("/");
}

/**
 * Standard SigV4 short-lived presigning for B2's S3-compatible API.
 * Caller MUST enforce authorization, expiring retention and proof ownership.
 * A presigned URL is a bearer capability; do not include it in Telegram.
 */
export function presignPrivateB2Object({
  config, method, objectKey, contentType, versionId = null, expiresSeconds = 120, at = new Date(),
}) {
  if (!config || !["PUT", "GET", "HEAD", "DELETE"].includes(method))
    throw new Error("Invalid media signing request.");
  if (typeof objectKey !== "string" ||
      !/^(business-hq|workforce|workteams)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(video|book)\/[0-9a-f-]{36}$/i.test(objectKey) ||
      objectKey.includes(".."))
    throw new Error("Invalid private media object path.");
  if (!Number.isInteger(expiresSeconds) || expiresSeconds < 30 || expiresSeconds > 300)
    throw new Error("Media links must expire in 30–300 seconds.");
  if (!(at instanceof Date) || Number.isNaN(at.getTime()))
    throw new Error("Invalid signing date.");

  if (versionId !== null && (method !== "DELETE" ||
      typeof versionId !== "string" || !/^[A-Za-z0-9_~.=-]{1,512}$/.test(versionId)))
    throw new Error("Invalid versioned deletion request.");

  const { region, bucket, keyId, appKey } = config;
  const host = "s3." + region + ".backblazeb2.com";
  const uri = "/" + [bucket, ...objectKey.split("/")].map(encode).join("/");
  const day = at.toISOString().slice(0, 10).replace(/-/g, "");
  const timestamp = day + "T" + at.toISOString().slice(11, 19).replace(/:/g, "") + "Z";
  const scope = day + "/" + region + "/s3/aws4_request";
  const headers = method === "PUT"
    ? { "content-type": requireText(contentType, "Media content type"), host }
    : { host };
  if (method === "PUT" && !/^(video\/(mp4|webm|quicktime)|image\/(jpeg|png|webp|heic))$/.test(contentType))
    throw new Error("Media type not permitted.");
  const signedHeaders = Object.keys(headers).sort().join(";");
  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": keyId + "/" + scope,
    "X-Amz-Date": timestamp,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const query = Object.entries(params).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key,value]) => encode(key) + "=" + encode(value)).join("&");
  const canonicalHeaders = Object.entries(headers).sort(([a],[b]) => a.localeCompare(b))
    .map(([key,value]) => key + ":" + value.trim() + "\n").join("");
  const canonicalRequest = [method, uri, query, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const requestHash = createHash("sha256").update(canonicalRequest).digest("hex");
  const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, requestHash].join("\n");
  const kDate = hmac("AWS4" + appKey, day);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");
  const signedUrl = "https://" + host + uri + "?" + query + "&X-Amz-Signature=" + signature;
  return {
    signedUrl,
    headers: method === "PUT" ? { "Content-Type": contentType } : {},
    expiresSeconds,
  };
}
