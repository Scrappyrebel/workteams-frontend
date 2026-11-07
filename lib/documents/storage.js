// Signed-URL access for library documents. The company-documents
// bucket is private (same posture as inspection-photos): the app
// stores the storage PATH on the document row and mints short-lived
// signed URLs only for a person who can already see the row.

import { DOCUMENTS_BUCKET, documentVisibleToRole } from "./library";

// Returns a 1-hour signed URL for viewing (download=false) or saving
// (download=true), or null when the file cannot be reached. Fails
// closed: a document the person's role cannot see never gets a URL.
export async function documentSignedUrl(sb, doc, role, { download = false } = {}) {
  if (!doc?.storage_key || !documentVisibleToRole(doc, role)) return null;
  try {
    const options = download ? { download: doc.file_name || "document" } : undefined;
    const { data, error } = await sb.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(doc.storage_key, 3600, options);
    if (error) throw error;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}
