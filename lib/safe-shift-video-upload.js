"use client";

import * as tus from "tus-js-client";

// File-pickers and secondary upload screens must use the SAME 50 MiB-safe
// storage protocol as the live recorder. Supabase Free restricts each object,
// not the whole walkthrough. Never discard the original File after failure.
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const PART_BYTES = 40 * 1024 * 1024;

export async function uploadShiftVideoSafely({
  sb, file, session, companyId, memberId, onProgress, onUpload,
}) {
  if (!file?.size || file.size > MAX_VIDEO_BYTES) {
    throw new Error("The video is empty or exceeds the 500 MB device safety limit. Keep the file and ask management for help.");
  }
  const mime = String(file.type || "video/mp4");
  const isMp4 = mime.includes("mp4") || mime.includes("quicktime");
  const ext = isMp4 ? "mp4" : "webm";
  const contentType = isMp4 ? "video/mp4" : "video/webm";
  const base = `${companyId}/${memberId}/walkthrough-${file.lastModified}-${file.size}.${ext}`;
  const multi = file.size > PART_BYTES;
  const destination = multi ? `${base}.parts.json` : base;
  const partCount = multi ? Math.ceil(file.size / PART_BYTES) : 1;
  const paths = [];

  async function uploadPart(chunk, objectPath, offset) {
    const { data: existing } = await sb.storage.from("shift-videos").info(objectPath);
    if (Number(existing?.size) === chunk.size) {
      onProgress?.((offset + chunk.size) / file.size);
      return;
    }
    await new Promise(async (resolve, reject) => {
      const upload = new tus.Upload(chunk, {
        endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
        metadata: {
          bucketName: "shift-videos", objectName: objectPath,
          contentType: multi ? "application/octet-stream" : contentType,
        },
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        },
        onError: reject,
        onProgress: (bytes, total) => onProgress?.((offset + (total ? chunk.size * bytes / total : 0)) / file.size),
        onSuccess: () => resolve(),
      });
      onUpload?.(upload);
      try {
        const previous = await upload.findPreviousUploads();
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      } catch { /* retry fresh when resume metadata is unavailable */ }
      upload.start();
    });
    const { data: verified, error: verifyError } = await sb.storage.from("shift-videos").info(objectPath);
    if (verifyError || Number(verified?.size) !== chunk.size) {
      throw new Error("A video part failed storage verification. Tap Retry; do not delete the file.");
    }
  }

  for (let i = 0; i < partCount; i++) {
    const begin = i * PART_BYTES;
    const end = Math.min(file.size, begin + PART_BYTES);
    const objectPath = multi ? `${base}.part-${String(i).padStart(3, "0")}.bin` : base;
    await uploadPart(multi ? file.slice(begin, end, "application/octet-stream") : file, objectPath, begin);
    paths.push(objectPath);
  }
  if (multi) {
    const manifest = JSON.stringify({
      kind: "workteams-walkthrough-parts", version: 1,
      mimeType: contentType, bytes: file.size, parts: paths,
    });
    const { data: old } = await sb.storage.from("shift-videos").info(destination);
    if (!old) {
      const { error } = await sb.storage.from("shift-videos").upload(
        destination, new Blob([manifest], { type: "application/json" }),
        { contentType: "application/json", upsert: false }
      );
      if (error) {
        const { data: recovered } = await sb.storage.from("shift-videos").info(destination);
        if (!recovered) throw new Error("The video pieces saved but the index failed. Tap Retry to finish.");
      }
    }
    const { data: saved, error } = await sb.storage.from("shift-videos").download(destination);
    if (error || !saved) throw new Error("The multipart video index is not accessible. Tap Retry.");
    const confirmed = JSON.parse(await saved.text());
    if (confirmed.kind !== "workteams-walkthrough-parts" || confirmed.bytes !== file.size ||
        JSON.stringify(confirmed.parts) !== JSON.stringify(paths)) {
      throw new Error("Saved video parts do not match this file. Contact management; keep the original.");
    }
  }
  onProgress?.(1);
  return destination;
}
