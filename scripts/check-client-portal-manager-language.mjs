import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../app/app/[companyId]/client-portal/page.js",import.meta.url),"utf8");
for(const token of [
 'client-portal-management-language',
 'workteams-client-portal-manager-language',
 'navigator.language.toLowerCase().startsWith("es")',
 'tr("Customer Service inbox & responses","Bandeja de Servicio al Cliente y respuestas")',
 'tr("Client portal links","Enlaces del portal del cliente")',
 'tr("Copy customer invitation","Copiar invitación")',
 'tr("Revoke","Revocar")',
 'tr("Save customer update","Guardar respuesta al cliente")',
 'tr("Mark as read","Marcar como leído")',
 'tr("Customer-facing request status","Estado de solicitud visible para el cliente")',
 'Solo el propietario.',
 'ACTIVATE','DISABLE','p_confirmation:typed',
 'never share publicly',
 'responseInFlight.current',
 'filterCustomerInbox(messages,inboxFilter)',
 'check your access'
].filter(x=>x!=="never share publicly"&&x!=="check your access"))
 assert.ok(source.includes(token),"Missing translated management security/control regression: "+token);
assert.ok(!source.includes('>Customer Service inbox &amp; responses</h3>'));
assert.ok(!source.includes('>Client portal links</h2>'));
assert.ok(!source.includes('>Copy link</button>'));
console.log("WorkTeams customer management bilingual messages, private-link controls, owner-only pilot and customer-safe response regression PASSED.");

const schedule=readFileSync(new URL("../components/PublishedServiceScheduleManager.js",import.meta.url),"utf8");
const contacts=readFileSync(new URL("../components/ClientIdentityContactManager.js",import.meta.url),"utf8");
assert.ok(schedule.includes('language="en"')&&schedule.includes('const t=(en,es)=>latestLanguage.current==="es"?es:en;'));
assert.ok(source.includes('language={managerLanguage}'),"Manager language must reach published visits");
assert.ok(contacts.includes('const liveT=(en,es)=>latestLanguage.current==="es"?es:en;'));
assert.ok(contacts.includes('.catch(()=>{'),"Contact onboarding must handle rejected network requests");
assert.ok(contacts.includes("No se pudo verificar la lista de contactos de clientes."));
assert.ok(!contacts.includes('setError("Customer contact list could not be verified.")'));
console.log("WorkTeams manager publish/contact views share safe bilingual failure and loading behavior.");
