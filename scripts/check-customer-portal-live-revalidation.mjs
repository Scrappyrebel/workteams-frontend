import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {findReadyCustomerContacts} from "../lib/customer-pilot-readiness.mjs";
const src=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const page=src("app/customer-portal/page.js");
const manager=src("components/ClientIdentityContactManager.js");
const sql=src("supabase/060_client_portal_manager_onboarding_readiness.sql");
const legacy=src("app/api/portal/lookup/route.js");
const confirmed={status:"active",account_linked:true,locations:[{active:false,revoked:false,basic_portal:true}]};
const locationOnly={status:"active",account_linked:false,locations:[{active:true,revoked:false,basic_portal:true}]};
assert.equal(findReadyCustomerContacts([confirmed,locationOnly]).length,0,
 "Two different customers must not jointly create a green readiness score.");
assert.deepEqual(findReadyCustomerContacts([{
 status:"active",account_linked:true,locations:[{active:true,revoked:false,basic_portal:true}]
}]).length,1);
for(const deny of [
 {status:"disabled",account_linked:true,locations:[{active:true,revoked:false,basic_portal:true}]},
 {status:"active",account_linked:true,locations:[{active:true,revoked:true,basic_portal:true}]},
 {status:"active",account_linked:true,locations:[{active:true,revoked:false,basic_portal:false}]},
 {status:"active",account_linked:false,locations:[{active:true,revoked:false,basic_portal:true}]},
])assert.equal(findReadyCustomerContacts([deny]).length,0,"Revoked, disabled or unlinked customer counted as pilot-ready.");
assert.equal(findReadyCustomerContacts(null).length,0);
for(const term of [
 "findReadyCustomerContacts",
 "readyContacts.length>0",
 "for the same customer before field testing",
 "Real customer sign-in, request submission, revocation and phone acceptance: NOT VERIFIED"
])assert.ok(manager.includes(term),"Missing truthful pilot guidance: "+term);
for(const term of [
 "const requestSequence=useRef(0)",
 "const mounted=useRef(false)",
 "void refresh({silent:true})",
 "window.setInterval(recheck,60000)",
 "window.clearInterval(poll)",
 "window.addEventListener(\"focus\",recheck)",
 "document.addEventListener(\"visibilitychange\",recheck)",
 "window.removeEventListener(\"focus\",recheck)",
 "document.removeEventListener(\"visibilitychange\",recheck)",
 "sequence!==requestSequence.current",
 "setLocations([]);setNotice(\"\")",
 'sb.auth.getUser()',
 'rpc("claim_workteams_customer_identity")',
 'rpc("get_my_workteams_customer_identity")',
 "if(document.visibilityState===\"visible\")"
])assert.ok(page.includes(term),"Missing session/location revalidation safeguard: "+term);
assert.ok(sql.includes("'account_linked',exists("),"Manager readiness must come from trusted server status");
assert.ok(legacy.includes("get_portal_data"),"Keep original token-only portal path unchanged");
console.log("WorkTeams revoked-session visibility recheck and exact customer pilot readiness regressions passed.");
