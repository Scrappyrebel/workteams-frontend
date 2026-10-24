import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const portal=readFileSync(new URL("../app/portal/[token]/page.js",import.meta.url),"utf8");
const contractRoute=readFileSync(new URL("../app/api/portal/service/route.js",import.meta.url),"utf8");
const manager=readFileSync(new URL("../app/app/[companyId]/client-portal/page.js",import.meta.url),"utf8");
const api=readFileSync(new URL("../app/api/portal/lookup/route.js",import.meta.url),"utf8");
function block(source,start,end){
 const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,"missing block "+start);
 return source.slice(i,j);
}
assert.ok(portal.includes('import { useEffect, useRef, useState } from "react"'));
assert.ok(portal.includes('const portalAction = useRef("")'));
assert.ok(portal.includes('if (portalAction.current || loading || data?.ok !== true) return false'));
assert.ok(portal.includes("portalAction.current = name"));
assert.ok(portal.includes('if (portalAction.current === name) portalAction.current = ""'));
for(const [begin,end,action] of [
 ["  async function sendContact(e) {","  async function signAmendment(e) {","contact"],
 ["  async function signAmendment(e) {","  async function requestClean(e) {","sign"],
 ["  async function requestClean(e) {","  async function requestTemps(e) {","service"],
 ["  async function requestTemps(e) {","  async function confirmHours(e, requestId) {","temp"],
 ["  async function confirmHours(e, requestId) {","  const dueAmendments =","hours"]
]){
 const s=block(portal,begin,end);
 assert.ok(s.includes('beginAction("'+action+'")'),action+" guard");
 assert.ok(s.includes("try {")&&s.includes("} catch (err) {")&&s.includes("} finally {"),action+" cleanup");
 assert.ok(s.includes('j.ok !== true'),action+" confirmed response");
 assert.ok(s.includes('finishAction("'+action+'")'),action+" lock release");
}
assert.ok(portal.includes("setActionError("));
assert.ok(portal.includes("Message status could not be confirmed."));
assert.ok(portal.includes("Service request could not be confirmed."));
assert.ok(portal.includes("Signature status could not be confirmed."));
assert.ok(portal.includes("Hours confirmation could not be verified."));
assert.ok(portal.includes("cancelled = true"));
assert.ok(portal.includes("if(cancelled||currentPortalToken.current!==token)return"));
assert.ok(portal.includes("data?.ok !== true"));
assert.ok(portal.includes('role="alert"'));
assert.ok(portal.includes("This secure link is for this location only."));
const links=[...portal.matchAll(/href="#(portal-[a-z-]+)"/g)].map(m=>m[1]);
assert.ok(links.length>=7,"expected direct links to primary customer sections");
for(const id of links)assert.ok(portal.includes('id="'+id+'"'),"target missing "+id);
assert.ok(portal.includes('const dueAmendments ='));
assert.ok(portal.includes('const hoursToConfirm ='));
assert.ok(portal.includes('disabled={contactBusy || Boolean(portalAction.current)}'));
assert.ok(portal.includes('disabled={signBusy || Boolean(portalAction.current)}'));
assert.ok(portal.includes('disabled={confirmBusy === r.id || Boolean(portalAction.current)}'));
assert.ok(manager.includes("Quick Access / Acceso rápido"));
assert.ok(manager.includes("Client messages"));
assert.ok(manager.includes("Location links"));
assert.ok(manager.includes("Expired: {expiredLinks}"));
assert.ok(manager.includes("linkExpired(t)"));
assert.ok(manager.includes("if(!tokenByLocation[t.location_id])"));
assert.ok(manager.includes("Client messages are temporarily unavailable. This does not mean there are no messages."));
assert.ok(manager.includes('disabled={working} style={dangerButton}'));
assert.ok(manager.includes('eq("company_id", company.id)'));
assert.ok(api.includes('sb.rpc("get_portal_data"'));
assert.ok(api.includes("checkRateLimit"));
assert.ok(!portal.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"));
console.log("WorkTeams customer-portal cross-app parity and token isolation safeguards verified.");

const firstLoad=block(portal,"  useEffect(() => {\\n    let cancelled = false;","  async function refreshCustomerRequests(");
const lookupGate=firstLoad.indexOf("if(!res.ok||result?.ok!==true)");
const contractFetch=firstLoad.indexOf("const contractRes=await fetch(");
assert.ok(lookupGate>0&&contractFetch>lookupGate,"signed contract must load after valid exact-location token lookup");
for(const snippet of ["currentPortalToken.current!==token","contractRes.ok","currentPortalToken.current===token&&contractJson?.contract",'cache:"no-store"']){
 assert.ok(firstLoad.includes(snippet),"missing protected contract fetch: "+snippet);
}
for(const snippet of ["portal-contract:","token.length > 128","if(tokenError)","if(contractError)","Cache-Control"]){
 assert.ok(contractRoute.includes(snippet),"contract API protection missing: "+snippet);
}
for(const phrase of ["Please write your message first.","Sign this amendment? This makes the changes part of your contract.",
 "Service request could not be confirmed.","Hours confirmation could not be verified."]){
 assert.ok(portal.includes('t("'+phrase+'","'),"customer action not bilingual: "+phrase);
}
console.log("WorkTeams token-first contract access and bilingual customer transactions protected.");
