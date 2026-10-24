import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/056_client_portal_owner_activation_gate.sql");
const ui=read("app/app/[companyId]/client-portal/page.js");
const contacts=read("components/ClientIdentityContactManager.js");
const authenticated=read("supabase/055_client_portal_verified_email_contact_access.sql");
for(const t of [
 "workteams_client_portal_pilot_owner(p_company_id uuid)",
 "m.role='owner'",
 "u.email_confirmed_at is not null",
 "set_workteams_customer_login_activation(",
 "p_confirmation<>'ACTIVATE'",
 "p_confirmation<>'DISABLE'",
 "not v_settings.pilot_requested",
 "Approve a specific customer and location before activation.",
 "ct.status='active' and ct.revoked_at is null",
 "g.can_view_requests=true and g.revoked_at is null",
 "where company_id=p_company_id for update",
 "set enabled=p_enabled",
 "'login_activated' else 'login_disabled'",
 "'customer_login_enabled',coalesce(v_enabled,false)",
 "'can_activate',public.workteams_client_portal_pilot_owner(p_company_id)",
 "Disable customer logins before withdrawing the pilot.",
 "grant execute on function public.set_workteams_customer_login_activation(uuid,boolean,text)",
 "revoke all on function public.set_workteams_customer_login_activation(uuid,boolean,text)"
])assert.ok(sql.includes(t),"Missing owner activation guard: "+t);
assert.ok(!sql.includes("update public.client_portal_identity_settings set enabled=true;"),
 "Activation may never be automatic");
for(const t of [
 "set_workteams_customer_login_activation",
 'const phrase=nextEnabled?"ACTIVATE":"DISABLE"',
 "setPilotEnabled(data.customer_login_enabled)",
 "pilotCanActivate",
 "pilotRequested===true&&pilotCanActivate&&pilotEnabled!==null",
 'tr("Disable customer logins now","Desactivar accesos de clientes")',
 'tr("Activate verified customer logins","Activar accesos verificados")'
])assert.ok(ui.includes(t),"Missing owner UI safe action: "+t);
assert.ok(contacts.includes('typeof data.customer_login_enabled!=="boolean"'));
assert.ok(authenticated.includes("s.enabled=true and s.pilot_requested=true"));
assert.ok(authenticated.includes("il.revoked_at is null"));
console.log("WorkTeams owner-only customer activation and immediate shutoff regression passed.");
