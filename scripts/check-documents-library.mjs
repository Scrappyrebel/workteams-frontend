// Guard for the Documents & Forms library (D-WT-58).
// The access rules are the point of this section: documents are
// per-company, each carries an audience floor, unknown floors fail
// closed, and the protected shift-video storage is never the document
// store. Those invariants are pinned here.
import { readFileSync, existsSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

check(existsSync("lib/documents/library.js"), "documents: library model exists");
const lib = readFileSync("lib/documents/library.js", "utf8");
check(lib.includes('DOCUMENTS_BUCKET = "company-documents"'), "documents: private company-documents bucket named");
check(lib.includes('DOCUMENTS_TABLE = "company_documents"'), "documents: company_documents table named");
check(!lib.includes("shift-videos") && !lib.includes("shift_proof"), "documents: protected video storage never referenced");
for (const key of ["general", "operations", "inspections", "safety", "human_resources", "customers", "finance", "training", "temp_staffing"]) {
  check(lib.includes(`key: "${key}"`), `documents: category present — ${key}`);
}
for (const key of ["employee", "supervisor", "admin", "owner"]) {
  check(lib.includes(`{ key: "${key}"`), `documents: audience present — ${key}`);
}
check(lib.includes('roleRank("admin")'), "documents: unknown audience floor fails closed to managers and owners");
check(lib.includes("documentVisibleToRole"), "documents: per-document visibility check exists");
check(lib.includes("validateDocumentFile"), "documents: upload validation exists");

check(existsSync("lib/documents/starters.js"), "documents: starter forms catalog exists");
const starters = readFileSync("lib/documents/starters.js", "utf8");
for (const key of ["incident-report", "supply-request", "walkthrough-form", "inspection-form"]) {
  check(starters.includes(`key: "${key}"`), `documents: starter form present — ${key}`);
}

const shell = readFileSync("components/AppShell.js", "utf8");
check(
  shell.includes('{ key: "documents", label: "Documents & Forms"') &&
    shell.includes("/documents`, minRole: null"),
  "documents: nav entry present, additive, open to all roles like Supplies"
);

check(existsSync("app/app/[companyId]/documents/page.js"), "documents: library page exists");
const page = readFileSync("app/app/[companyId]/documents/page.js", "utf8");
check(page.includes('.eq("company_id", company.id)'), "documents: library list is scoped to the current company");
check(page.includes("setLibraryReady(false)"), "documents: missing-table state fails soft, never errors");
check(page.includes("filterDocuments"), "documents: list passes through the role/category/search filter");
check(page.includes("documentSignedUrl"), "documents: files open through short-lived signed URLs");

check(existsSync("app/app/[companyId]/documents/forms/[formKey]/page.js"), "documents: starter form page exists");
const formPage = readFileSync("app/app/[companyId]/documents/forms/[formKey]/page.js", "utf8");
check(formPage.includes("not saved in the app"), "documents: form page honestly states entries are not saved");
check(formPage.includes("window.print()"), "documents: form page offers print / save as PDF");

if (failures > 0) {
  console.error("check-documents-library: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-documents-library: OK");
