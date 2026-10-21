import { createHash, createHmac, randomUUID } from "node:crypto";

// Server-only infrastructure. No WorkTeams B2 keys or public bucket are
// configured yet. All existing video/photo workflows remain on Supabase.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TYPES = { shift_video: "video", communication_book_photo: "book" };
const BYTES_MAX = { shift_video: 500 * 1024 * 1024, communication_book_photo: 20 * 1024 * 1024 };
const MIME = {
  shift_video: new Set(["video/mp4", "video/webm", "video/quicktime"]),
  communication_book_photo: new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]),
};
const requireString = (value, name) => {
  if (typeof value !== "string" || !value.trim()) throw Error(name + " is not configured.");
  return value.trim();
};
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c =>
  "%" + c.charCodeAt(0).toString(16).toUpperCase());
const hmac = (key, text) => createHmac("sha256", key).update(text).digest();

export function isWorkTeamsB2MediaAllowed({
  fullEnabled = false, pilotEnabled = false, role, companyId, pilotCompanyId,
}) {
  // WorkTeams is multi-tenant. A pilot can NEVER leak into another company.
  if (!UUID.test(companyId || "")) return false;
  if (fullEnabled === true) return true;
  return pilotEnabled === true && companyId === pilotCompanyId && role === "owner";
}

export function validateWorkTeamsB2Upload({ companyId, entryId, kind, mimeType, bytes }) {
  if (!UUID.test(companyId || "") || !UUID.test(entryId || "") ||
      !Object.hasOwn(TYPES, kind) || !MIME[kind]?.has(mimeType) ||
      !Number.isSafeInteger(bytes) || bytes < 1 || bytes > BYTES_MAX[kind]) {
    throw Error("Invalid tenant-scoped private evidence request.");
  }
  return { companyId, entryId, kind, mimeType, bytes };
}

// Call with forTest=true only in the separate owner test route. A missing
// switch returns null even if credentials are configured.
export function readWorkTeamsB2Config(env = process.env, { forTest = false } = {}) {
  const enabled = forTest ? env.WORKTEAMS_B2_TEST_ENABLED : env.WORKTEAMS_B2_PRIVATE_MEDIA_ENABLED;
  if (enabled !== "true") return null;
  const region = requireString(env.WORKTEAMS_B2_MEDIA_REGION, "WorkTeams B2 region");
  const bucket = requireString(env.WORKTEAMS_B2_MEDIA_BUCKET, "WorkTeams B2 media bucket");
  const keyId = requireString(env.WORKTEAMS_B2_MEDIA_KEY_ID, "WorkTeams B2 key ID");
  const appKey = requireString(env.WORKTEAMS_B2_MEDIA_APPLICATION_KEY, "WorkTeams B2 application key");
  if (!/^[a-z]{2}-[a-z]+-\d{3}$/.test(region)) throw Error("Invalid B2 region.");
  if (!/^workteams-[a-z0-9-]{5,48}$/.test(bucket) ||
      bucket === "lillybs-workforce-media-2026" ||
      bucket.startsWith("hq-")) throw Error("A distinct private WorkTeams bucket is required.");
  return { region, bucket, keyId, appKey };
}

export function createWorkTeamsB2Key({ companyId, entryId, kind }) {
  if (!UUID.test(companyId || "") || !UUID.test(entryId || "") ||
      !Object.hasOwn(TYPES, kind)) throw Error("Invalid private object scope.");
  return ["workteams", companyId, entryId, TYPES[kind], randomUUID()].join("/");
}

export function signWorkTeamsB2Object({
  config, method, objectKey, contentType, versionId = null,
  expiresSeconds = 120, at = new Date(),
}) {
  if (!config || !["PUT", "GET", "HEAD", "DELETE"].includes(method)) throw Error("Invalid private B2 request.");
  if (typeof objectKey !== "string" ||
      !/^workteams\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(video|book)\/[0-9a-f-]{36}$/i.test(objectKey) ||
      objectKey.includes("..")) throw Error("Invalid private object path.");
  if (!Number.isInteger(expiresSeconds) || expiresSeconds < 30 || expiresSeconds > 300)
    throw Error("Private links must expire in 30–300 seconds.");
  if (!(at instanceof Date) || !Number.isFinite(at.valueOf())) throw Error("Invalid signing date.");
  if (versionId !== null && (method !== "DELETE" ||
      typeof versionId !== "string" || !/^[A-Za-z0-9_~.=-]{1,512}$/.test(versionId)))
    throw Error("Invalid exact version deletion.");
  if (method === "PUT" && ![...MIME.shift_video, ...MIME.communication_book_photo].includes(contentType))
    throw Error("Disallowed private media type.");

  const { region, bucket, keyId, appKey } = config;
  const host = "s3." + region + ".backblazeb2.com";
  const uri = "/" + [bucket, ...objectKey.split("/")].map(encode).join("/");
  const day = at.toISOString().slice(0, 10).replace(/-/g, "");
  const timestamp = day + "T" + at.toISOString().slice(11, 19).replace(/:/g, "") + "Z";
  const scope = day + "/" + region + "/s3/aws4_request";
  const headers = method === "PUT" ? { "content-type": contentType, host } : { host };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": keyId + "/" + scope,
    "X-Amz-Date": timestamp,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const query = Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => encode(k) + "=" + encode(v)).join("&");
  const canonicalHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => k + ":" + v.trim() + "\n").join("");
  const request = [method, uri, query, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const requestHash = createHash("sha256").update(request).digest("hex");
  const text = ["AWS4-HMAC-SHA256", timestamp, scope, requestHash].join("\n");
  const signature = hmac(hmac(hmac(hmac("AWS4" + appKey, day), region), "s3"), "aws4_request");
  const signedUrl = "https://" + host + uri + "?" + query + "&X-Amz-Signature=" +
    createHmac("sha256", signature).update(text).digest("hex");
  // No secret value or long-lived URL is returned.
  return { signedUrl, headers: method === "PUT" ? { "Content-Type": contentType } : {}, expiresSeconds };
}
