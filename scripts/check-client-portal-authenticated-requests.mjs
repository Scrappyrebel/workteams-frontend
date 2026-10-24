import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/057_client_portal_authenticated_service_requests.sql");
const requests=read("components/AuthenticatedCustomerRequests.js");
const portal=read("app/customer-portal/page.js");
const oldHistory=read("supabase/051_client_portal_request_history.sql");
const denyDirectWrites=read("supabase/058_client_portal_deny_direct_message_writes.sql");
for(const term of [
 "add column if not exists customer_contact_id uuid",
 "add column if not exists customer_request_key uuid",
 "foreign key(company_id,customer_contact_id)",
 "on delete set null (customer_contact_id)",
 "portal_messages_customer_request_dedupe",
 "portal_messages_one_pending_auth_document_copy",
 "workteams_customer_authorized_location(",
 "public.workteams_customer_verified_email()",
 "s.enabled=true and s.pilot_requested=true",
 "ct.status='active'",
 "il.auth_user_id=auth.uid()",
 "il.revoked_at is null",
 "g.can_view_requests=true",
 "g.revoked_at is null",
 "l.company_id=g.company_id",
 "get_workteams_authenticated_customer_requests(",
 "submit_workteams_authenticated_customer_request(",
 "m.customer_contact_id=v_contact and m.portal_token_id is null",
 "m.customer_request_key=p_request_key",
 "for update",
 "v_count>=5",
 "length",
 "p_category='document_copy'",
 "values(p_company_id,p_location_id,null,v_contact,p_request_key",
 "grant execute on function public.submit_workteams_authenticated_customer_request(",
 "revoke all on function public.get_workteams_authenticated_customer_requests(",
 "to authenticated"
])assert.ok(sql.toLowerCase().includes(term.toLowerCase()),"Missing location customer request guard: "+term);
assert.ok(!sql.includes("grant select on public.portal_messages to anon"),"Do not reveal customer requests publicly");
assert.ok(!sql.includes("grant insert on public.portal_messages to authenticated"),"No direct customer insert");
assert.ok(denyDirectWrites.includes("revoke insert on public.portal_messages from anon,authenticated;"),"Only guarded RPC may write authenticated customer requests");
for(const term of [
 "get_workteams_authenticated_customer_requests",
 "submit_workteams_authenticated_customer_request",
 "onAuthorizationLost?.()",
 "globalThis.crypto.randomUUID()",
 "pendingKey.current=null",
 "p_company_id:companyId,p_location_id:locationId",
 "Request a contract copy",
 "Historial de solicitudes",
 "Refresh request statuses",
 "role=\"alert\""
])assert.ok(requests.includes(term),"Missing authenticated customer request UI: "+term);
assert.ok(portal.includes("AuthenticatedCustomerRequests"));
assert.ok(portal.includes("companyId={loc.company_id} locationId={loc.location_id}"));
assert.ok(portal.includes("onAuthorizationLost={()=>{"),"Must handle customer authorization loss");
assert.ok(portal.includes("requestSequence.current++;"),"Revoke pending customer identity reads on access loss");
assert.ok(portal.includes("setLocations([]);setNotice(\"\");setBusy(false)"),"Access loss must hide stale locations");
assert.ok(portal.includes("setError(t("),"Must report access loss without claiming successful authorization");
assert.ok(oldHistory.includes("and portal_token_id=pt.id"),
 "Old bearer-token history must filter exact bearer record (never authenticated contact messages)");
assert.ok(!oldHistory.includes("customer_contact_id"),"No new auth requests exposed through bearer tokens");
console.log("WorkTeams verified identity service requests, location-scoped history and old bearer privacy regression passed.");
