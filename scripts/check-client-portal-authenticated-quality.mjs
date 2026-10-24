import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/059_client_portal_authenticated_published_quality.sql");
const manager=read("components/ClientIdentityContactManager.js");
const client=read("components/AuthenticatedCustomerQuality.js");
const portal=read("app/customer-portal/page.js");
const old=read("supabase/049_client_portal_private_quality_publications.sql");
for(const p of [
 "set_workteams_customer_quality_access(",
 "not public.workteams_client_portal_pilot_manager(p_company_id)",
 "g.location_id=p_location_id and g.revoked_at is null",
 "ct.status='active' and ct.revoked_at is null",
 "can_view_quality=p_allow",
 "'quality_access_granted' else 'quality_access_revoked'",
 "get_workteams_authenticated_quality_reports(",
 "public.workteams_customer_authorized_location(p_company_id,p_location_id)",
 "g.can_view_quality=true",
 "g.can_view_requests",
 "g.revoked_at is null",
 "order by x.created_at desc,x.id desc limit 1",
 "pub.published=true",
 "pub.company_id=i.company_id and pub.location_id=i.location_id",
 "where i.company_id=p_company_id and i.location_id=p_location_id",
 "select i.id,i.inspection_date,i.score,pub.customer_summary",
 "select 1 from public.client_portal_location_grants g",
 "limit 10",
 "from public,anon,authenticated",
 "to authenticated",
 "'quality_access',g.can_view_quality",
])assert.ok(sql.includes(p),"Missing authenticated customer-safe quality guard: "+p);
assert.ok(!sql.includes("i.notes"),"Do not expose internal inspection notes");
assert.ok(!sql.includes("i.inspector_id"),"Do not expose inspector identity");
assert.ok(!sql.includes("inspection_photos"),"Do not share private photos");
assert.ok(!sql.includes("inspection_items"),"Do not share internal checklist items");
for(const p of [
 "set_workteams_customer_quality_access",
 "p_contact_id:contact.id",
 "p_location_id:location.id",
 "p_allow:allow",
 "Allow published quality reports",
 "Revoke quality reports",
 "l.quality_access",
 "changeQuality(c,l,!l.quality_access)"
])assert.ok(manager.includes(p),"Missing manager exact-contact permission control: "+p);
for(const p of [
 "get_workteams_authenticated_quality_reports",
 "setReports([])",
 "visibilitychange",
 "data.reports",
 "Published Quality Reports",
 "Informes de calidad publicados",
 "role=\"status\""
])assert.ok(client.includes(p),"Missing customer published report safety: "+p);
assert.ok(portal.includes("AuthenticatedCustomerQuality"));
assert.ok(old.includes("set_client_portal_inspection_publication"));
assert.ok(old.includes("publication.published = true"));
console.log("Authenticated customer quality publications, exact-location manager consent, private notes exclusion and revocation regression passed.");
