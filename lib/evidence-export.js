// Save or share a PRIVATE shift-evidence file. Export requires an already
// authenticated owner/admin screen. Never generate an unauthenticated URL.
// The caller passes a scoped storage path loaded from its company records.
export async function readEvidenceBlob(sb, bucket, path) {
  if (!path || typeof path !== "string" || path.includes("..") || path.startsWith("/")) {
    throw new Error("Invalid saved evidence path.");
  }
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error || !data) throw new Error("Evidence could not be downloaded: " + (error?.message || "File missing"));

  if (!path.endsWith(".parts.json")) return data;
  // Resumable recordings are stored as byte-for-byte parts below the storage
  // per-object limit. Export the ORIGINAL playable file, not its JSON manifest.
  const manifest = JSON.parse(await data.text());
  if (manifest?.kind === "workteams-b2-parts") {
    if (bucket !== "shift-videos") throw new Error("This private video is not stored in the selected bucket.");
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Sign in again to export this recording.");
    const companyId = path.split("/")[0];
    const response = await fetch(
      "/api/shift-media/b2-access?companyId=" + encodeURIComponent(companyId) +
      "&storagePath=" + encodeURIComponent(path), {
        headers: { Authorization: "Bearer " + session.access_token },
        cache: "no-store",
      }
    );
    if (!response.ok) throw new Error("Private recording is unavailable for export.");
    const receipt = await response.json();
    if (!Array.isArray(receipt.parts) || receipt.parts.length < 1 ||
        receipt.parts.length > 25 || !Number.isSafeInteger(receipt.totalBytes) ||
        !["video/mp4", "video/webm", "video/quicktime"].includes(receipt.mimeType)) {
      throw new Error("Invalid private recording receipt.");
    }
    const clips = [];
    let bytes = 0;
    for (const part of receipt.parts) {
      if (typeof part?.url !== "string" || !part.url.startsWith("https://s3.") ||
          !Number.isSafeInteger(part.bytes) || part.bytes < 1 ||
          part.bytes > 20 * 1024 * 1024)
        throw new Error("Invalid private video part.");
      const result = await fetch(part.url, { cache: "no-store", redirect: "error" });
      if (!result.ok) throw new Error("Private recording segment is not available.");
      const clip = await result.blob();
      if (clip.size !== part.bytes) throw new Error("Private recording segment was incomplete.");
      clips.push(clip);
      bytes += clip.size;
    }
    if (bytes !== receipt.totalBytes) throw new Error("Private recording bytes did not match.");
    return new Blob(clips, { type: receipt.mimeType });
  }
  const base = path.slice(0, -".parts.json".length);
  if (
    manifest?.kind !== "workteams-walkthrough-parts" ||
    manifest.version !== 1 ||
    !Number.isSafeInteger(manifest.bytes) ||
    manifest.bytes <= 0 || manifest.bytes > 500 * 1024 * 1024 ||
    !Array.isArray(manifest.parts) || manifest.parts.length < 2 ||
    manifest.parts.length > 20 ||
    !["video/mp4", "video/webm"].includes(manifest.mimeType)
  ) throw new Error("The saved recording's part list is invalid.");
  const chunks = [];
  let bytes = 0;
  for (let i = 0; i < manifest.parts.length; i++) {
    const piece = manifest.parts[i];
    if (piece !== `${base}.part-${String(i).padStart(3, "0")}.bin`) {
      throw new Error("Invalid recording part reference.");
    }
    const { data: part, error: partError } = await sb.storage.from(bucket).download(piece);
    if (partError || !part || part.size < 1 || part.size > 40 * 1024 * 1024) {
      throw new Error(`Recording part ${i+1} could not be retrieved.`);
    }
    chunks.push(part);
    bytes += part.size;
  }
  if (bytes !== manifest.bytes) throw new Error("The saved recording is incomplete.");
  return new Blob(chunks, { type: manifest.mimeType });
}

export function evidenceFilename(kind, path, label = "Shift", mimeType = "") {
  const safe = label.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "Shift";
  const suffix = path.endsWith(".parts.json") ? path.slice(0, -".parts.json".length) : path;
  const ext = mimeType === "video/webm" ? "webm" :
    mimeType === "video/quicktime" ? "mov" :
    suffix.match(/\.(mp4|webm|mov|jpg|jpeg|png|webp)$/i)?.[1]?.toLowerCase() ||
    (kind === "video" ? "mp4" : "jpg");
  return `${safe}-${kind}-${new Date().toISOString().slice(0,10)}.${ext}`;
}

export async function exportEvidence(blob, filename, share) {
  if (!blob?.size) throw new Error("The saved evidence file is empty.");
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeByExt = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const type = blob.type && blob.type !== "application/octet-stream"
    ? blob.type : (mimeByExt[ext] || "application/octet-stream");
  const file = new File([blob], filename, { type });
  if (share && typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ files: [file], title: "Shift evidence" });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
      // If native share fails, safely save the original file instead.
    }
  }
  const localUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = localUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(localUrl), 60_000);
  return "downloaded";
}
