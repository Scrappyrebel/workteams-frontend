import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../app/portal/[token]/page.js",import.meta.url),"utf8");
for(const x of ["const [language,setLanguage]","workteams-client-portal-language",
 'id="workteams-client-language"','value={language}',"navigator.language.toLowerCase().startsWith",
 "Español","ACTUALIZACIONES DEL SERVICIO","Informes de calidad publicados",
 "Solicitar personal temporal","Contáctenos","Confirmar horas","Firmar modificación",
 "Mis solicitudes de personal temporal","Estado de mis solicitudes","localStatus(r.status)",
 "new Date(r.created_at).toLocaleString(language===",
 'id="portal-customer-requests"','id="portal-documents"',
 'id="portal-inspections"',"refreshCustomerRequests(true)","portalAction.current",
 'fetch("/api/portal/lookup"']){
 assert.ok(src.includes(x),"Missing protected bilingual client portal feature: "+x);
}
assert.ok(!src.includes("createSignedUrl("),"Bearer token must never mint private file download links");
console.log("WorkTeams bilingual client portal core, token-only boundaries and saved preference passed");