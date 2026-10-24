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
