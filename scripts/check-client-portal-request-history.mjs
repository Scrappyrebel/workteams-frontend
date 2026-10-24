import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/051_client_portal_request_history.sql",import.meta.url),"utf8");
const api=readFileSync(new URL("../app/api/portal/lookup/route.js",import.meta.url),"utf8");
const client=readFileSync(new URL("../app/portal/[token]/page.js",import.meta.url),"utf8");
const manager=readFileSync(new URL("../app/app/[companyId]/client-portal/page.js",import.meta.url),"utf8");
const all=(src,words)=>{for(const x of words)assert.ok(src.includes(x),"Missing client request status rule: "+x)};
all(sql,["get_client_portal_request_history(tok text)","public.portal_tokens",
 "(expires_at is null or expires_at>now())","l.company_id=pt.company_id",
 "where company_id=pt.company_id and location_id=pt.location_id",
 "portal_token_id=pt.id","order by created_at desc limit 30",
 "'category',r.category","'status',r.customer_status","'response',r.customer_response",
 "'responded_at',r.customer_responded_at",
 "revoke all on public.portal_messages from anon",
 "portal_message_response_events","enable row level security",
 "portal_message_response_audit","grant execute on function public.get_client_portal_request_history(text)"]);
const readStart=sql.indexOf("create or replace function public.get_client_portal_request_history");
assert.ok(readStart>=0);
const query=sql.slice(readStart);
for(const internal of ["r.subject","r.body","r.sender_name","r.priority","r.read_at","r.emailed_at","r.location_id"]){
 assert.ok(!query.includes(internal),"Shared link must not reveal original private message fields: "+internal);
}
all(api,["get_client_portal_request_history","history.error||history.data?.ok!==true",
 "customer_requests_error","Array.isArray(history.data.requests)",
 "...data,customer_requests:history.data.requests"]);
all(manager,["saveCustomerResponse(message)","responseInFlight.current",
 ".eq(\"company_id\",company.id)","customer_status:status",
 "customer_response:reply||null","select(\"id,customer_status,customer_response,customer_responded_at\")",
 "window.confirm","Save customer update",
 "Customer Service inbox &amp; responses"]);
all(client,["id=\"portal-customer-requests\"","customer_requests_error",
 "My Request Status / Estado de mis solicitudes","refreshCustomerRequests(true)",
 "request statuses","r.status===\"resolved\"",
 "r.response&&","Refresh request status / Actualizar estado",
 "Original personal messages"]);
assert.ok(!client.includes("r.body"),"Shared token must not render original message");
assert.ok(!client.includes("r.sender_name"),"Shared token must not render sender name");
console.log("WorkTeams request status and customer-safe response privacy regression passed.");
