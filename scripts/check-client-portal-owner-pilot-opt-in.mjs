import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const sql=read("supabase/054_client_portal_owner_pilot_opt_in.sql");
const manager=read("app/app/[companyId]/client-portal/page.js");
const bearer=read("app/api/portal/lookup/route.js");
for(const phrase of [
 "pilot_requested boolean not null default false",
 "client_portal_identity_management_events",
 "enable row level security",
 "revoke all on public.client_portal_identity_management_events from public,anon,authenticated",
 "get_workteams_client_portal_pilot_status(p_company_id uuid)",
 "set_workteams_client_portal_pilot_request(",
 "auth.uid() is not null",
 "m.company_id=p_company_id and m.user_id=auth.uid()",
 "m.role in ('owner','admin')",
 "lower(trim(m.email))=lower(trim(coalesce(auth.jwt()->>'email','')))",
 "if p_company_id is null or p_requested is null",
 "pilot_requested=excluded.pilot_requested",
 "'customer_login_enabled',false",
 "revoke all on function public.get_workteams_client_portal_pilot_status(uuid)",
 "grant execute on function public.get_workteams_client_portal_pilot_status(uuid)",
 "grant execute on function public.set_workteams_client_portal_pilot_request(uuid,boolean)"
])assert.ok(sql.includes(phrase),"Missing safe pilot enrollment: "+phrase);
assert.ok(!sql.includes("grant select on public.client_portal_"),"No customer-account database reads granted");
for(const phrase of [
 'get_workteams_client_portal_pilot_status',
 'set_workteams_client_portal_pilot_request',
 'p_company_id:companyId,p_requested:requested',
 'if(!companyId||!isManager||pilotBusy||pilotRequested===null||pilotEnabled===null||',
 'typeof data.customer_login_enabled!=="boolean"',
 'setPilotRequested(null)',
 'Login is only activated with a separate owner confirmation.',
 'Authenticated customer login:',
 'Request pilot / Solicitar prueba',
 'Withdraw pilot request / Cancelar solicitud'
])assert.ok(manager.toLowerCase().includes(phrase.toLowerCase()),"Missing guarded manager UI: "+phrase);
assert.ok(bearer.includes("get_portal_data"),"Keep location link unchanged");
assert.ok(!bearer.includes("client_portal_identity_settings"),"No identity account available to bearer token");
console.log("WorkTeams manager-only pilot request, RLS audit and disabled-login regressions passed.");
