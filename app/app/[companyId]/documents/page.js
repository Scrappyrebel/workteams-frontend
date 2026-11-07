"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { isManagerRole } from "../../../../lib/roles";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENTS_TABLE,
  audienceLabel,
  categoryLabel,
  filterDocuments,
  formatBytes,
  formatDocDate,
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
