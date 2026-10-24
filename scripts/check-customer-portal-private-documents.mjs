import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/063_client_portal_private_pdf_center.sql");
const upload=read("app/api/customer-documents/upload/route.js");
const download=read("app/api/customer-documents/[id]/download/route.js");
const manager=read("components/CustomerDocumentManager.js");
const grants=read("components/ClientIdentityContactManager.js");
const customer=read("components/AuthenticatedCustomerDocuments.js");
const managerPage=read("app/app/[companyId]/client-portal/page.js");
const clientPage=read("app/customer-portal/page.js");
for(const s of [
 "workteams-customer-documents','workteams-customer-documents',false",
 "create table if not exists public.workteams_customer_documents",
 "published boolean not null default false",
 "client_portal_documents_company_location_idx", // replaced below
 "enable row level security",
 "revoke all on public.workteams_customer_documents from public,anon,authenticated",
 "authorize_workteams_customer_document_upload",
 "public.workteams_customer_document_manager(p_company_id,p_location_id)",
 "public.list_workteams_customer_identity_contacts",
 "'work_order_access',g.can_view_work_orders",
 "'document_access',g.can_view_documents",
 "set_workteams_customer_document_publication",
 "p_expires_at<=now()",
 "set_workteams_customer_document_access",
 "can_view_documents=p_allow",
 "client_portal_identity_management_events",
 "get_workteams_authenticated_customer_documents",
 "public.workteams_customer_authorized_location(p_company_id,p_location_id)",
 "g.can_view_documents=true",
 "published=true and (expires_at is null or expires_at>now())",
 "authorize_workteams_customer_document_download",
 "v_contact:=public.workteams_customer_authorized_location(d.company_id,d.location_id)",
 "where id=p_document_id and published=true",
 "storage_key",
 "grant execute on function public.authorize_workteams_customer_document_download(uuid)",
 "from public,anon,authenticated"
].filter(s=>s!=="client_portal_documents_company_location_idx")){
 assert.ok(sql.includes(s),"Missing customer document safety requirement: "+s);
}
assert.ok(!sql.includes("create policy")&&!sql.includes("grant select on public.workteams_customer_documents to authenticated"),"No Storage or metadata public RLS");
for(const s of [
 'auth.getUser(token)','authorize_workteams_customer_document_upload',
 'SUPABASE_SERVICE_ROLE_KEY',"uploaded_by:verified.user.id","published:false",
 '.upload(path,bytes','bytes.subarray(0,5)','file.size>LIMIT',
 'randomUUID()', 'from("workteams_customer_documents").insert',
 'Cache-Control'
])assert.ok(upload.includes(s),"Missing trusted upload guard: "+s);
// A revocation during storage download must prevent responding with bytes.
// The second server-side authorization is distinct from the React cancellation.
assert.equal(download.split('"authorize_workteams_customer_document_download"').length-1,2,
 "Must reauthorize a private PDF after downloading it and before sending it.");
assert.ok(download.indexOf('const {data:reauthorized,error:revoked}')>
 download.indexOf('await admin.storage.from(BUCKET).download'),
 "Reauthorization must run after retrieving the private object.");
assert.ok(download.indexOf('if(revoked||reauthorized?.ok!==true')<
 download.indexOf('return new NextResponse(bytes'),
 "Revoked access must stop the response before bytes are delivered.");
for(const stable of [
 'reauthorized.company_id!==allowed.company_id',
 'reauthorized.location_id!==allowed.location_id',
 'reauthorized.storage_key!==allowed.storage_key'
])assert.ok(download.includes(stable),"A switched private document must be denied: "+stable);
for(const s of [
 'auth.getUser(bearer)','authorize_workteams_customer_document_download',
 'SUPABASE_SERVICE_ROLE_KEY','storage_key.startsWith',
 '.storage.from(BUCKET).download','Content-Disposition',
 'attachment;', 'Cache-Control', 'Referrer-Policy',
 'X-Content-Type-Options', 'application/pdf'
])assert.ok(download.includes(s),"Missing download security guard: "+s);
for(const s of [
 "/api/customer-documents/upload","set_workteams_customer_document_publication",
 "out.published!==false","Upload PRIVATE PDF",'t("Withdraw","Retirar")'
])assert.ok(manager.includes(s),"Missing manager controls: "+s);
assert.ok(grants.includes("set_workteams_customer_document_access"));
assert.ok(grants.includes("l.document_access"));
for(const s of ["get_workteams_authenticated_customer_documents",
 "/api/customer-documents/","Authorization:","createObjectURL",
 "visibilitychange"])assert.ok(customer.includes(s),"Missing customer read flow: "+s);
assert.ok(managerPage.includes("CustomerDocumentManager"));
assert.ok(clientPage.includes("AuthenticatedCustomerDocuments"));
const bearer=read("app/api/portal/service/route.js");
assert.ok(!bearer.includes("workteams_customer_documents"));
console.log("WorkTeams private PDF bucket, no-store auth proxy, manager publish, grants, expiry and legacy bearer separation passed.");
