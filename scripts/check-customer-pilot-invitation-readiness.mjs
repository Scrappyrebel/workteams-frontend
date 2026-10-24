import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeCustomerInvitation} from "../lib/customer-invitation.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/060_client_portal_manager_onboarding_readiness.sql");
const manager=read("components/ClientIdentityContactManager.js");
const parent=read("app/app/[companyId]/client-portal/page.js");
const signup=read("app/customer-login/page.js");
for(const phrase of [
 "not public.workteams_client_portal_pilot_manager(p_company_id)",
 "il.status='active' and il.revoked_at is null",
 "il.verified_at is not null and u.email_confirmed_at is not null",
 "lower(btrim(u.email))=ct.email_normalized",
 "il.company_id=ct.company_id and il.contact_id=ct.id",
 "'account_linked',exists(",
 "'quality_access',g.can_view_quality",
 "'basic_portal',g.can_view_requests",
 "'active',g.revoked_at is null and g.can_view_requests",
 "g.expires_at is null or g.expires_at>now()",
 "revoke all on function public.list_workteams_customer_identity_contacts(uuid)",
 "grant execute on function public.list_workteams_customer_identity_contacts(uuid)"
])assert.ok(sql.includes(phrase),"Manager-only verified readiness missing: "+phrase);
for(const phrase of [
 "makeCustomerInvitation",
 "pilotEnabled===true&&serverLoginEnabled===true",
 "contact.status!==\"active\"||location.active!==true",
 "currentCompany.current!==id",
 "account_linked",
 "Location grant unavailable or expired",
 "Software readiness",
 "NOT VERIFIED",
 "navigator.clipboard.writeText",
 "window.prompt",
 "Copy private customer invitation",
 "pilotRequested===true"
])assert.ok(manager.includes(phrase),"Manager invitation UI guard missing: "+phrase);
assert.ok(parent.includes("pilotRequested={pilotRequested} pilotEnabled={pilotEnabled}"));
assert.ok(signup.includes('params.get("mode")==="create"'));
assert.ok(signup.includes('const supplied=params.get("lang")'));
assert.ok(signup.includes('supplied==="es"?"es"'));
assert.ok(signup.includes("workteams-customer-portal-language"));
for(const language of ["en","es"]){
 const msg=makeCustomerInvitation({
  origin:"https://app.lillybsjanitorial.com",
  email:"APPROVED@example.com",
  locationName:"Approved Test Location",
  language
 });
 const url=msg.match(/https:\/\/[^\s]+/)[0];
 assert.equal(url,"https://app.lillybsjanitorial.com/customer-login?mode=create&lang="+language);
 assert.ok(msg.includes("approved@example.com"));
 assert.ok(msg.includes("Approved Test Location"));
 assert.ok(!url.includes("@"),"Approved email cannot be placed inside invitation URL");
 assert.ok(!url.includes("token="));
 assert.ok(!url.includes("company_id"));
 assert.ok(!url.includes("contact_id"));
 assert.ok(!url.includes("password"));
 assert.ok(!msg.toLowerCase().includes("magic link"));
}
assert.ok(makeCustomerInvitation({
 origin:"https://app.lillybsjanitorial.com",email:"X@EXAMPLE.COM",
 locationName:"X",language:"es"
}).includes("No comparta su contraseña"));
assert.throws(()=>makeCustomerInvitation({
 origin:"http://example.com",email:"a@b.com",locationName:"Somewhere",language:"en"
}),/secure/);
console.log("WorkTeams approved-contact invitation, no-token URL, bilingual copy and truthful pilot readiness checks passed.");
