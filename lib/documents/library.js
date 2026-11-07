// Documents & Forms library — shared model (D-WT-58, decided 2026-11-06).
//
// WorkTeams' document library: every form and document the app's work
// needs lives here, and managers can upload documents and forms into it.
// Documents are scoped to ONE company and filed under a department
// category. Access follows the app's existing per-person role model
// (lib/roles): every document carries a minimum role ("who can see
// this"), and a person only sees documents at or below their own rank.
// Nothing here is visible company-wide beyond the role floor the
// uploader picked — the floor defaults to the whole team only when the
// uploader chooses "Everyone on the team".
//
// STORAGE / DATABASE (flagged need — no SQL ships with this code):
// rows live in a future public.company_documents table and files in a
// future private "company-documents" storage bucket. Until Wendy runs
// that migration, the library page detects the missing table and shows
// an honest "not set up yet" state; the built-in starter forms below
// work with no database at all. The migration must enforce the same
// rules server-side (RLS): company members may read rows of their own
// company whose min_role rank is <= their role rank; only managers and
// owners of the company may insert, update or delete; storage objects
// are scoped by the leading company_id path segment the same way.

import { roleRank } from "../roles";

export const DOCUMENTS_BUCKET = "company-documents";
export const DOCUMENTS_TABLE = "company_documents";

// Department categories, keyed to the departments WorkTeams already has.
export const DOCUMENT_CATEGORIES = [
  { key: "general", label: "General" },
  { key: "operations", label: "Operations" },
  { key: "inspections", label: "Inspections & Quality" },
  { key: "safety", label: "Safety & Incidents" },
  { key: "human_resources", label: "Human Resources" },
  { key: "customers", label: "Customers & Contracts" },
  { key: "finance", label: "Finance" },
  { key: "training", label: "Training" },
  { key: "temp_staffing", label: "Temp Staffing" },
];

export function categoryLabel(key) {
  return DOCUMENT_CATEGORIES.find((c) => c.key === key)?.label || "General";
}

// Who can see a document: the minimum role floor, in the app's own role
// vocabulary. Stored as the database role value ("admin" = Manager).
export const DOCUMENT_AUDIENCES = [
  { key: "employee", label: "Everyone on the team" },
  { key: "supervisor", label: "Supervisors and up" },
  { key: "admin", label: "Managers and owners" },
  { key: "owner", label: "Owners only" },
];

export function audienceLabel(key) {
  return DOCUMENT_AUDIENCES.find((a) => a.key === key)?.label || "Everyone on the team";
}

// A document is visible when the person's rank reaches the document's
// floor. Unknown floors fail closed to managers-and-owners visibility
// rather than opening the document to everyone.
export function documentVisibleToRole(doc, role) {
  const floor = roleRank(doc?.min_role);
  const known = DOCUMENT_AUDIENCES.some((a) => a.key === doc?.min_role);
  return roleRank(role) >= (known ? floor : roleRank("admin"));
}

export function visibleDocuments(docs, role) {
  return (docs || []).filter((d) => documentVisibleToRole(d, role));
}

// Plural-tolerant search, matching the app's menu search behavior:
// "inspections" finds "Inspection", "forms" finds "Form".
function searchTokens(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

export function documentMatchesSearch(doc, query) {
  const q = searchTokens(query);
  if (q.length === 0) return true;
  const hay = searchTokens(
    [doc?.title, doc?.description, doc?.file_name, categoryLabel(doc?.category)].join(" ")
  );
  return q.every((token) => hay.some((h) => h.startsWith(token) || token.startsWith(h)));
}

export function filterDocuments(docs, { role, category, query } = {}) {
  return visibleDocuments(docs, role).filter(
    (d) =>
      (!category || category === "all" || d.category === category) &&
      documentMatchesSearch(d, query)
  );
}

// Uploads: documents and forms, not media. The shift-video buckets are
// protected storage and are never used here.
export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf",
  "png", "jpg", "jpeg", "webp",
];

export function validateDocumentFile(file) {
  if (!file) return "No file selected.";
  if (!file.size || file.size < 1) return "That file is empty.";
  if (file.size > DOCUMENT_MAX_BYTES) return "Documents must be 15 MB or smaller.";
  const ext = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  if (!DOCUMENT_EXTENSIONS.includes(ext)) {
    return "That file type is not a document. Use PDF, Word, Excel, CSV, text, or an image.";
  }
  return null;
}

// Storage path for one upload: company segment first (the future
// storage policies key on it), then a unique segment, then a safe name.
export function documentStoragePath(companyId, fileName, unique) {
  const safe = String(fileName || "document")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "_")
    .slice(0, 120) || "document";
  return `${companyId}/${unique}-${safe}`;
}

export function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDocDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}
