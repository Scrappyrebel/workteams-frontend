import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../app/portal/[token]/page.js",import.meta.url),"utf8");
for(const token of [
  'href="#portal-documents"',
  'id="portal-documents"',
  'Documents &amp; Agreements / Documentos y contratos',
  'only approved contract details and amendment statuses',
  'does not provide private downloadable company files',
  'Request a contract copy / Solicitar copia del contrato',
  'Request a copy of my signed contract',
  'setContact(previous=>({...previous,subject:',
  'setContactSent(false)',
  'document.getElementById("portal-contact")?.scrollIntoView',
  'disabled={Boolean(portalAction.current)}',
  'href="#portal-contract"',
  'href="#portal-amendments"',
  'id="portal-contract"',
  'id="portal-amendments"',
  'get_portal_data',
  'role="alert"',
  'This secure link is for this location only.'
 ])assert.ok(page.includes(token),"Missing safe WorkTeams document pathway: "+token);
assert.ok(!page.includes('service_role'),"Never enable service-role access from bearer portal");
assert.ok(!page.includes('storage.from("customer-documents")'),"Do not expose Business HQ private files from WorkTeams bearer portal");
console.log("WorkTeams location-scoped agreement copies and Customer Service request flow verified.");
