"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { isManagerRole } from "../../../../lib/roles";
import {
  DOCUMENT_AUDIENCES,
  DOCUMENT_CATEGORIES,
  DOCUMENTS_BUCKET,
  DOCUMENTS_TABLE,
  audienceLabel,
  categoryLabel,
  documentStoragePath,
  filterDocuments,
  formatBytes,
  formatDocDate,
  validateDocumentFile,
} from "../../../../lib/documents/library";
import { STARTER_FORMS } from "../../../../lib/documents/starters";
import { documentSignedUrl } from "../../../../lib/documents/storage";

// Documents & Forms (D-WT-58, decided 2026-11-06): the company's
// document library plus the built-in starter forms. Library rows live
// in public.company_documents with files in the private
// company-documents bucket — both are a flagged database need (see
// lib/documents/library.js). Until that migration runs, the library
// panel explains itself and the starter forms keep working; nothing
// here errors or shows another company's documents.
export default function DocumentsPage() {
  const { company, member, loading } = useCompany();
  const [docs, setDocs] = useState([]);
  const [libraryReady, setLibraryReady] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [upload, setUpload] = useState({ title: "", category: "general", min_role: "employee", description: "" });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const role = member?.role || "employee";
  const canManage = isManagerRole(role);

  useEffect(() => {
    if (!company?.id) return;
    (async () => {
      const sb = supabase();
      const { data, error } = await sb
        .from(DOCUMENTS_TABLE)
        .select("id,company_id,title,description,category,storage_key,file_name,mime_type,size_bytes,min_role,uploaded_by,created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });
      if (error) {
        // Table not created yet (the flagged migration) — fail soft.
        setLibraryReady(false);
        setDocs([]);
      } else {
        setLibraryReady(true);
        setDocs(data || []);
      }
      setLoaded(true);
    })();
  }, [company?.id]);

  const visible = useMemo(
    () => filterDocuments(docs, { role, category, query }),
    [docs, role, category, query]
  );

  async function openDocument(doc, download) {
    setBusyId(doc.id);
    setMsg("");
    const url = await documentSignedUrl(supabase(), doc, role, { download });
    setBusyId(null);
    if (!url) {
      setMsg("That document's file could not be reached. It may not be uploaded yet, or the library storage is not set up.");
      return;
    }
    window.open(url, "_blank", "noopener");
  }

  // Upload (managers and owners): the file goes to the private
  // company-documents bucket first, then the library row is written.
  // If the row fails, the stored file is removed again — a document
  // never exists in storage without its library record, and the
  // audience floor the manager picked is stored on the row.
  async function submitUpload(e) {
    e.preventDefault();
    setUploadMsg("");
    const problem = validateDocumentFile(uploadFile);
    if (problem) {
      setUploadMsg(problem);
      return;
    }
    const title = (upload.title || uploadFile.name || "").trim();
    if (title.length < 3 || title.length > 140) {
      setUploadMsg("Give the document a title of 3–140 characters.");
      return;
    }
    setUploading(true);
    const sb = supabase();
    const unique =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const path = documentStoragePath(company.id, uploadFile.name, unique);
    const { error: upErr } = await sb.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, uploadFile, { contentType: uploadFile.type || undefined, upsert: false });
    if (upErr) {
      setUploading(false);
      setUploadMsg("The file could not be stored. The library storage may not be set up yet — nothing was added.");
      return;
    }
    const { data: row, error: insErr } = await sb
      .from(DOCUMENTS_TABLE)
      .insert({
        company_id: company.id,
        title,
        description: upload.description.trim() || null,
        category: upload.category,
        storage_key: path,
        file_name: uploadFile.name,
        mime_type: uploadFile.type || null,
        size_bytes: uploadFile.size,
        min_role: upload.min_role,
        uploaded_by: member?.id || null,
      })
      .select("id,company_id,title,description,category,storage_key,file_name,mime_type,size_bytes,min_role,uploaded_by,created_at")
      .single();
    if (insErr || !row) {
      await sb.storage.from(DOCUMENTS_BUCKET).remove([path]);
      setUploading(false);
      setUploadMsg("The document could not be registered, so the stored file was removed. Nothing was added to the library.");
      return;
    }
    setDocs((prev) => [row, ...prev]);
    setUpload({ title: "", category: "general", min_role: "employee", description: "" });
    setUploadFile(null);
    setUploading(false);
    setUploadMsg(`"${title}" is in the library.`);
  }

  // Delete (managers and owners): two-step confirm, storage object
  // first, then the row — the same order the app uses for photos.
  async function deleteDocument(doc) {
    if (confirmDeleteId !== doc.id) {
      setConfirmDeleteId(doc.id);
      return;
    }
    setConfirmDeleteId(null);
    setBusyId(doc.id);
    setMsg("");
    const sb = supabase();
    if (doc.storage_key) {
      await sb.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_key]);
    }
    const { error } = await sb.from(DOCUMENTS_TABLE).delete().eq("id", doc.id).eq("company_id", company.id);
    setBusyId(null);
    if (error) {
      setMsg("That document could not be deleted. Reload the library and try again.");
      return;
    }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    setMsg(`"${doc.title}" was deleted from the library.`);
  }

  if (loading || !company) {
    return (
      <main className="site-shell">
        <section className="panel" style={{ padding: 24 }}>
          <p style={{ color: "var(--muted)" }}>Loading documents…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="site-shell">
      <section className="panel" style={{ padding: 24, marginBottom: 16 }}>
        <h2 style={{ fontSize: "1.8rem", marginTop: 0 }}>📁 Documents &amp; Forms</h2>
        <p style={{ color: "var(--muted)", maxWidth: 640 }}>
          Every form and document for {company.name}&rsquo;s work, in one place.
          Documents are filed by department, and each one is visible only to the
          people its audience allows — the same role rules as the rest of the app.
        </p>
      </section>

      <section className="panel" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Starter forms</h3>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Built into the app — open one, fill it in, and print it or save it as a
          PDF. A finished form can be uploaded back into the library below.
        </p>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {STARTER_FORMS.map((form) => (
            <Link
              key={form.key}
              href={`/app/${company.id}/documents/forms/${form.key}`}
              className="record-card"
              style={{ display: "block", padding: 14, textDecoration: "none" }}
            >
              <strong>{form.title}</strong>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                {categoryLabel(form.category)}
              </div>
              <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0" }}>{form.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel" style={{ padding: 24 }}>
        <h3 style={{ marginTop: 0 }}>Company library</h3>

        {!libraryReady && (
          <div className="warning-box" role="status" style={{ padding: "12px 16px", border: "1px solid", borderRadius: 12 }}>
            <strong>The document library is not set up for this company yet.</strong>{" "}
            {canManage ? (
              <span>
                An owner needs one database step first: a <em>company_documents</em> table
                and a private <em>company-documents</em> storage bucket, with the
                per-company, per-role access rules described in the library setup
                notes. Until then, uploads are off — the starter forms above work
                as they are.
              </span>
            ) : (
              <span>
                Ask an owner or manager to finish the one-time library setup. Until
                then, uploads are off — the starter forms above work as they are.
              </span>
            )}
          </div>
        )}

        {libraryReady && canManage && (
          <form className="form" onSubmit={submitUpload} style={{ margin: "12px 0 20px" }}>
            <strong>Upload a document or form</strong>
            <div>
              <label htmlFor="doc-file">File (PDF, Word, Excel, CSV, text, or image — 15 MB max)</label>
              <input
                id="doc-file"
                className="input"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setUploadFile(f);
                  if (f && !upload.title) setUpload((u) => ({ ...u, title: f.name.replace(/\.[^.]+$/, "") }));
                }}
              />
            </div>
            <div>
              <label htmlFor="doc-title">Title</label>
              <input
                id="doc-title"
                className="input"
                value={upload.title}
                onChange={(e) => setUpload((u) => ({ ...u, title: e.target.value }))}
                placeholder="What this document is"
              />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label htmlFor="doc-category">Department</label>
                <select
                  id="doc-category"
                  className="input"
                  value={upload.category}
                  onChange={(e) => setUpload((u) => ({ ...u, category: e.target.value }))}
                >
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <label htmlFor="doc-audience">Who can see it</label>
                <select
                  id="doc-audience"
                  className="input"
                  value={upload.min_role}
                  onChange={(e) => setUpload((u) => ({ ...u, min_role: e.target.value }))}
                >
                  {DOCUMENT_AUDIENCES.map((a) => (
                    <option key={a.key} value={a.key}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="doc-desc">Description (optional)</label>
              <textarea
                id="doc-desc"
                className="input textarea"
                rows={2}
                value={upload.description}
                onChange={(e) => setUpload((u) => ({ ...u, description: e.target.value }))}
              />
            </div>
            {uploadMsg && <p role="status" style={{ color: "var(--muted)", fontSize: 13 }}>{uploadMsg}</p>}
            <div>
              <button className="btn-primary" style={{ padding: "8px 18px" }} disabled={uploading || !uploadFile}>
                {uploading ? "Uploading…" : "Upload to library"}
              </button>
            </div>
          </form>
        )}

        {libraryReady && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
              {[{ key: "all", label: "All departments" }, ...DOCUMENT_CATEGORIES].map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={category === c.key ? "btn-primary" : "btn-ghost"}
                  style={{ padding: "5px 12px", fontSize: 12 }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="form" style={{ marginBottom: 12 }}>
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents and forms…"
                aria-label="Search documents and forms"
              />
            </div>
            {msg && (
              <p role="status" style={{ color: "var(--muted)", fontSize: 13 }}>{msg}</p>
            )}
            {!loaded && <p style={{ color: "var(--muted)" }}>Loading the library…</p>}
            {loaded && visible.length === 0 && (
              <div className="empty-state">
                <strong>No documents here yet</strong>
                <p>
                  {docs.length === 0
                    ? "Nothing has been uploaded to this library yet."
                    : "Nothing matches that department or search — or the documents here are limited to roles above yours."}
                </p>
              </div>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              {visible.map((doc) => (
                <article key={doc.id} className="record-card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <strong>{doc.title}</strong>
                      <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
                        {categoryLabel(doc.category)} · {audienceLabel(doc.min_role)}
                        {doc.size_bytes ? ` · ${formatBytes(doc.size_bytes)}` : ""}
                        {doc.created_at ? ` · ${formatDocDate(doc.created_at)}` : ""}
                      </div>
                      {doc.description && (
                        <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0" }}>{doc.description}</p>
                      )}
                      {doc.file_name && (
                        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{doc.file_name}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <button
                        className="btn-primary"
                        style={{ padding: "6px 14px", fontSize: 13 }}
                        disabled={busyId === doc.id}
                        onClick={() => void openDocument(doc, false)}
                      >
                        Open
                      </button>
                      <button
                        className="btn-ghost"
                        style={{ padding: "6px 14px", fontSize: 13 }}
                        disabled={busyId === doc.id}
                        onClick={() => void openDocument(doc, true)}
                      >
                        Download
                      </button>
                      {canManage && (
                        <button
                          className="btn-ghost"
                          style={{ padding: "6px 14px", fontSize: 13 }}
                          disabled={busyId === doc.id}
                          onClick={() => void deleteDocument(doc)}
                        >
                          {confirmDeleteId === doc.id ? "Confirm delete?" : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
