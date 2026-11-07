"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useCompany } from "../../../../../../lib/company-context";
import { categoryLabel } from "../../../../../../lib/documents/library";
import { starterFormByKey } from "../../../../../../lib/documents/starters";

// One built-in starter form: fill it in on screen, then print it or
// save it as a PDF from the browser. Entries are NOT stored in the app
// — the printed/saved copy is the record, and it can be uploaded into
// the company library afterwards. That is stated on the page so nobody
// mistakes a filled form for a saved one.
export default function StarterFormPage() {
  const params = useParams();
  const { company, loading } = useCompany();
  const form = starterFormByKey(params.formKey);
  const [values, setValues] = useState({});

  if (!form) {
    return (
      <main className="site-shell">
        <section className="panel" style={{ padding: 24 }}>
          <h2>Form not found</h2>
          <p style={{ color: "var(--muted)" }}>That starter form is not part of the library.</p>
          {company && (
            <Link href={`/app/${company.id}/documents`} className="back-link">
              ← Back to Documents &amp; Forms
            </Link>
          )}
        </section>
      </main>
    );
  }

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  return (
    <main className="site-shell">
      <section className="panel" style={{ padding: 24 }}>
        {company && (
          <Link href={`/app/${company.id}/documents`} className="back-link">
            ← Back to Documents &amp; Forms
          </Link>
        )}
        <h2 style={{ fontSize: "1.6rem", marginBottom: 4 }}>{form.title}</h2>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          {categoryLabel(form.category)} · {company?.name || ""}
        </div>
        <p style={{ color: "var(--muted)", maxWidth: 640 }}>{form.description}</p>
        <div className="warning-box" role="note" style={{ padding: "10px 14px", border: "1px solid", borderRadius: 12, marginBottom: 16 }}>
          <strong>Print or save this form when it is filled in.</strong>{" "}
          What you type here is not saved in the app. Use Print to make the paper
          or PDF copy, then upload the finished copy into the company library if
          it needs to be kept on file.
        </div>

        <div className="form">
          {form.fields.map((field) => (
            <div key={field.name}>
              <label htmlFor={`f-${field.name}`}>{field.label}</label>
              {field.type === "textarea" ? (
                <textarea
                  id={`f-${field.name}`}
                  className="input textarea"
                  rows={3}
                  value={values[field.name] || ""}
                  onChange={(e) => set(field.name, e.target.value)}
                />
              ) : field.type === "select" ? (
                <select
                  id={`f-${field.name}`}
                  className="input"
                  value={values[field.name] || ""}
                  onChange={(e) => set(field.name, e.target.value)}
                >
                  <option value="">Choose…</option>
                  {field.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : field.type === "checkbox" ? (
                <input
                  id={`f-${field.name}`}
                  type="checkbox"
                  checked={!!values[field.name]}
                  onChange={(e) => set(field.name, e.target.checked)}
                  style={{ width: 20, height: 20 }}
                />
              ) : (
                <input
                  id={`f-${field.name}`}
                  className="input"
                  type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                  value={values[field.name] || ""}
                  onChange={(e) => set(field.name, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn-primary" style={{ padding: "8px 18px" }} onClick={() => window.print()} disabled={loading}>
            Print / Save as PDF
          </button>
        </div>
      </section>
    </main>
  );
}
