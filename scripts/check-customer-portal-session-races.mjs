import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("../app/customer-portal/page.js",import.meta.url),"utf8");
const old=readFileSync(new URL("../app/api/portal/lookup/route.js",import.meta.url),"utf8");
for(const requirement of [
 "const requestSequence=useRef(0)",
 "const mounted=useRef(false)",
 "if(!mounted.current||sequence!==requestSequence.current)return",
 "if(!silent){\n    const {data:claimed,error:claimError}=await sb.rpc(\"claim_workteams_customer_identity\")",
 'rpc("get_my_workteams_customer_identity")',
 "void refresh({silent:true})",
 "document.addEventListener(\"visibilitychange\",recheck)",
 "window.setInterval(recheck,60000)",
 "window.clearInterval(poll)",
 "setLocations([]);setNotice(\"\");setBusy(false)",
 "setError(err instanceof Error?err.message:tr(",
 "window.location.assign(\"/customer-login?lang=\"+latestLanguage.current)"
])assert.ok(s.includes(requirement),"Missing revocation or session-race protection: "+requirement);
const signout=s.slice(s.indexOf("async function signOut(){"),s.indexOf("return <main",s.indexOf("async function signOut(){")));
assert.ok(signout.indexOf("requestSequence.current++")>=0);
assert.ok(signout.indexOf("requestSequence.current++")<signout.indexOf("await supabase().auth.signOut()"),"Invalidate pending reads BEFORE starting asynchronous signout");
assert.ok(signout.includes("setLocations([]);setLoggedIn(false)"));
const revoked=s.slice(s.indexOf("onAuthorizationLost={()=>{"),s.indexOf("}}/>",s.indexOf("onAuthorizationLost={()=>{")));
assert.ok(revoked.includes("requestSequence.current++"),"Revocation event must invalidate in-flight reads");
assert.ok(revoked.indexOf("requestSequence.current++")<revoked.indexOf("setLocations([])"),"Reject late responses before clearing UI");
assert.ok(s.includes("if(!silent){"),"Background revalidation should not write identity links on each timer");
assert.ok(old.includes("get_portal_data"),"Original bearer-only link service is unchanged");
console.log("WorkTeams customer signout, revoked view, stale promise and read-only background revalidation regressions passed.");
