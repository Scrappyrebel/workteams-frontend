import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const get=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=get("supabase/055_client_portal_verified_email_contact_access.sql");
const mgmt=get("components/ClientIdentityContactManager.js");
const dashboard=get("app/customer-portal/page.js");
const signin=get("app/customer-login/page.js");
const old=get("app/api/portal/lookup/route.js");
const manager=get("app/app/[companyId]/client-portal/page.js");
for(const term of [
 "create unique index if not exists client_portal_one_identity_per_contact",
 "public.workteams_client_portal_pilot_manager(p_company_id)",
 "s.pilot_requested=true",
 "l.id=p_location_id and l.company_id=p_company_id",
 "ct.status='active'",
 "ct.revoked_at is null",
 "can_view_requests=true",
 "can_view_contracts",
 "public.revoke_workteams_customer_identity_contact",
 "set status='disabled',revoked_at=now(),updated_at=now()",
 "update public.client_portal_identity_links",
 "update public.client_portal_location_grants",
 "u.email_confirmed_at is not null",
 "lower(btrim(u.email))=lower(btrim(coalesce(auth.jwt()->>'email','')))",
 "s.enabled=true and s.pilot_requested=true",
 "il.auth_user_id=auth.uid()",
 "il.verified_at is not null and il.revoked_at is null",
 "g.revoked_at is null",
 "g.expires_at is null or g.expires_at>now()",
 "on conflict(company_id,contact_id) do update",
 "where public.client_portal_identity_links.auth_user_id=auth.uid()",
 "get_my_workteams_customer_identity",
 "claim_workteams_customer_identity",
 "from public,anon,authenticated",
 "to authenticated"
 ])assert.ok(sql.includes(term),"Missing security requirement in migration: "+term);
for(const rpc of [
 "list_workteams_customer_identity_contacts(uuid)",
 "approve_workteams_customer_identity_contact(",
 "revoke_workteams_customer_identity_contact(",
 "claim_workteams_customer_identity()",
 "get_my_workteams_customer_identity()"
])assert.ok(sql.includes(rpc),"Missing customer RPC "+rpc);
for(const term of [
 "approve_workteams_customer_identity_contact",
 "revoke_workteams_customer_identity_contact",
 "list_workteams_customer_identity_contacts",
 "p_company_id:companyId",
 "p_location_id:locationId",
 "pilotRequested",
 "Contact revoked."
])assert.ok(mgmt.includes(term),"Missing manager app guard "+term);
assert.ok(manager.includes("ClientIdentityContactManager"));
assert.ok(manager.includes("pilotRequested===true"));
assert.ok(dashboard.includes("auth.getUser()"));
assert.ok(dashboard.includes('rpc("claim_workteams_customer_identity")'));
assert.ok(dashboard.includes('rpc("get_my_workteams_customer_identity")'));
assert.ok(dashboard.includes("setLocations([])"));
assert.ok(signin.includes("auth.signUp"));
assert.ok(signin.includes("auth.signInWithPassword"));
assert.ok(signin.includes("/forgot-password"));
assert.ok(!signin.includes("service_role"));
assert.ok(old.includes("get_portal_data"));
assert.ok(!old.includes("client_portal_identity_links"));
console.log("WorkTeams verified-email, revocation, tenant-location and legacy portal separation regression passed.");
