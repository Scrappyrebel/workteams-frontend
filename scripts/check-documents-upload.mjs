// Guard for Documents & Forms upload + delete (D-WT-58, slice 2).
// Uploads are manager work, files are validated before storage, a
// document never exists in storage without its library row, and
// deletion is a confirmed, company-scoped, storage-first operation.
import { readFileSync, existsSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

check(existsSync("app/app/[companyId]/documents/page.js"), "documents-upload: library page exists");
const page = readFileSync("app/app/[companyId]/documents/page.js", "utf8");

check(page.includes("libraryReady && canManage"), "documents-upload: upload form renders only for managers and owners");
check(page.includes("validateDocumentFile(uploadFile)"), "documents-upload: file validated before anything is stored");
check(page.includes("documentStoragePath(company.id, uploadFile.name, unique)"), "documents-upload: storage path is company-scoped");
check(page.includes(".from(DOCUMENTS_BUCKET)"), "documents-upload: uploads go to the documents bucket");
check(!page.includes("inspection-photos") && !page.includes("walkthrough-photos"), "documents-upload: photo buckets are not reused as document storage");
check(page.includes("min_role: upload.min_role"), "documents-upload: the picked audience floor is stored on the row");
check(page.includes("uploaded_by: member?.id"), "documents-upload: uploader recorded on the row");
check(
  page.indexOf(".upload(path, uploadFile") < page.indexOf(".insert({") &&
    page.indexOf(".insert({") < page.indexOf(".remove([path])"),
  "documents-upload: storage first, row second, rollback remove on registration failure"
);
check(page.includes("Confirm delete?"), "documents-upload: delete is a two-step confirm, never one tap");
check(page.includes('.delete().eq("id", doc.id).eq("company_id", company.id)'), "documents-upload: delete is scoped to the current company");
check(page.includes("remove([doc.storage_key])"), "documents-upload: delete removes the stored file");

if (failures > 0) {
  console.error("check-documents-upload: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-documents-upload: OK");
