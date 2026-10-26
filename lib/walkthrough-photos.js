// Helpers for walkthrough photos. Mirrors lib/inspection-photos.js: the
// walkthrough-photos bucket is private; the app stores the storage PATH
// in walkthrough_photos.photo_url and mints short-lived signed URLs for
// display. Walkthrough photos document a sales walkthrough only — they
// are separate from shift proof photos and the Communication Book.

const BUCKET = "walkthrough-photos";
const MARKER = "/walkthrough-photos/";

export function storagePathFromUrl(url) {
  const u = url || "";
  const idx = u.indexOf(MARKER);
  return idx >= 0 ? u.slice(idx + MARKER.length) : u;
}

// 10 MB max, images only.
export function validatePhotoFile(file) {
  if (!file) return "No file selected.";
  if (!file.type || !file.type.startsWith("image/")) {
    return "Only image files can be uploaded.";
  }
  if (file.size > 10 * 1024 * 1024) {
    return "Photos must be 10 MB or smaller.";
  }
  return null;
}

// Attach a 1-hour signed URL to each photo row (mutates copies, not the DB).
export async function withSignedUrls(sb, photos) {
  return Promise.all(
    (photos || []).map(async (p) => {
      try {
        const { data, error } = await sb.storage
          .from(BUCKET)
          .createSignedUrl(storagePathFromUrl(p.photo_url), 3600);
        if (error) throw error;
        return { ...p, signed_url: data.signedUrl };
      } catch {
        return { ...p, signed_url: null };
      }
    })
  );
}
