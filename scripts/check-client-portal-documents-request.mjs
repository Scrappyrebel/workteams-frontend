import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const page=read('app/portal/[token]/page.js');
const api=read("app/api/portal/contact/route.js");
const manager=read("app/app/[companyId]/client-portal/page.js");
const sql=read("supabase/052_client_portal_document_copy_requests.sql");
const lookup=read("supabase/051_client_portal_request_history.sql");

function includes(src,terms,where){for(const x of terms)assert.ok(src.includes(x),where+" missing "+x)}
includes(page,[
 'id="portal-documents"','href="#portal-documents"',
 'id="portal-contract-copy-name"','maxLength={120}',
 'async function requestContractCopy()',
 'beginAction("document")','finishAction("document")',
 'category:"document_copy"','setCopySubmitted(true)',
 'result?.ok!==true','result.already_pending',
 'void refreshCustomerRequests(true)',
 'r.category==="document_copy"',
 'r.status!=="resolved"',
 'No private document is sent through this shared link.',
 'No se envían documentos privados mediante este enlace compartido.',
 'role="status"'
],"customer page");
includes(api,[
 'typeof token!=="string"','token.length>128',
 '.eq("id",pt.location_id).eq("company_id",pt.company_id)',
 'const isCopy=category==="document_copy"',
 '.eq("status","signed")',
 '.eq("company_id",pt.company_id).eq("location_id",pt.location_id)',
 'if(!approved)return reply(',
 '.eq("portal_token_id",pt.id).eq("category","document_copy")',
 '.in("customer_status",["received","in_progress"])',
 'if(existing)return reply({ok:true,already_pending:true,request_id:existing.id})',
 'cat="document_copy"',
 'cleanSubject="Signed contract copy requested"',
 'cleanBody="Please arrange secure delivery',
 'portal_token_id:pt.id',
 'return reply({ok:true,request_id:msg.id,emailed});',
 '"Cache-Control":"private, no-store, max-age=0"'
],"request API");
const segment=api.slice(api.indexOf("const isCopy="),api.indexOf('const {data:msg,error}'));
assert.ok(segment.indexOf('if(!approved)')<segment.indexOf('cleanSubject="Signed contract copy requested"'),"must verify signed contract before copy request");
includes(sql,[
 "portal_messages_category_check",
 "'document_copy'",
 "portal_messages_one_open_document_copy_per_token",
 "customer_status in ('received','in_progress')",
 "portal_messages_document_copy_response_no_url",
 "customer_response !~*"
],"safe database migration");
includes(manager,[
 'm.category==="document_copy"',
 'deliveryConfirmed[message.id]',
 'verify the recipient and deliver the document privately',
 'Verified the recipient',
 'setDeliveryConfirmed(',
 'Do not paste document links, file paths or attachments'
],"manager inbox");
includes(lookup,[
 "'category',r.category","'status',r.customer_status",
 "'response',r.customer_response",
 "where company_id=pt.company_id and location_id=pt.location_id",
 "portal_token_id=pt.id"
],"exact token request history");
assert.ok(!page.includes('service_role'),"location bearer view cannot include service credentials");
assert.ok(!page.includes('storage.from("customer-documents")'),"WorkTeams must not distribute HQ private customer files");
console.log("WorkTeams tracked, tenant-scoped document request, manager fulfillment and safe status lifecycle passed.");
