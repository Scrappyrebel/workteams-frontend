import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/064_client_portal_published_service_schedule.sql");
const manager=read("components/PublishedServiceScheduleManager.js");
const access=read("components/ClientIdentityContactManager.js");
const customer=read("components/AuthenticatedCustomerServiceSchedule.js");
const managerPage=read("app/app/[companyId]/client-portal/page.js");
const portal=read("app/customer-portal/page.js");
for(const term of [
 "can_view_schedule boolean not null default false",
 "client_portal_service_schedule_publications",
 "enable row level security",
 "revoke all on public.client_portal_service_schedule_publications",
 "shifts_company_location_id_unique",
 "foreign key(company_id,location_id,shift_id)",
 "published boolean not null",
 "shift_date date not null",
 "start_time time not null",
 "end_time time not null",
 "public_note text",
 "set_workteams_customer_schedule_access(",
 "set_workteams_customer_service_visit_publication(",
 "list_workteams_customer_service_visits_for_manager(",
 "get_workteams_authenticated_service_schedule(",
 "workteams_client_portal_pilot_manager(p_company_id)",
 "workteams_customer_authorized_location(p_company_id,p_location_id)",
 "g.can_view_schedule=true",
 "g.revoked_at is null",
 "pub.published=true",
 "pub.shift_date=s.shift_date",
 "pub.start_time=s.start_time",
 "pub.end_time=s.end_time",
 "where s.company_id=p_company_id and s.location_id=p_location_id",
 "where g.company_id=p_company_id and g.contact_id=p_contact_id",
 "g.can_view_schedule",
 "'schedule_access_granted' else 'schedule_access_revoked'",
 "'document_published','document_withdrawn'",
 "can_view_work_orders=false,can_view_schedule=false",
 "grant execute on function public.get_workteams_authenticated_service_schedule(uuid,uuid)",
 "from public,anon,authenticated"
])assert.ok(sql.includes(term),"Missing schedule security requirement: "+term);
for(const phrase of ["set_workteams_customer_service_visit_publication","p_company_id:company","p_shift_id:visit.id","p_publish:publish",'t("Withdraw visit","Retirar visita")','t("Publish visit","Publicar visita")'])
 assert.ok(manager.includes(phrase),"Missing manager action: "+phrase);
for(const phrase of ["set_workteams_customer_schedule_access","changeScheduleAccess(c,l,!l.schedule_access)","l.schedule_access","p_contact_id:contact.id","p_location_id:location.id"])
 assert.ok(access.includes(phrase),"Missing per-contact grant: "+phrase);
for(const phrase of ["get_workteams_authenticated_service_schedule","setVisits([])","visibilitychange","Próximas visitas","data.visits"])
 assert.ok(customer.includes(phrase),"Missing verified customer view: "+phrase);
assert.ok(managerPage.includes("PublishedServiceScheduleManager"));
assert.ok(portal.includes("AuthenticatedCustomerServiceSchedule"));
assert.ok(!sql.includes("s.member_id as"),"Never publish employee staffing");
assert.ok(!sql.includes("s.notes as"),"Never expose private shift notes");
assert.ok(!sql.includes("grant select on public.client_portal_service_schedule_publications to authenticated"));
console.log("Verified Customer Portal manager-published visits, exact-location permission and no staffing disclosure regression passed.");

for(const phrase of [
 'latestLanguage.current=language',
 'if(!active.current||companyRef.current!==company)return',
 'active.current=false',
 'No se pudieron verificar las próximas visitas.',
 'No se pudo verificar el cambio de horario.',
 't("Upcoming service visits","Próximas visitas de servicio")',
 't("Refresh upcoming visits","Actualizar próximas visitas")',
 't("No scheduled visits for the next 30 days.',
 't("Customer-safe public note (optional, 5–300 characters)"'
])assert.ok(manager.includes(phrase),"Missing bilingual/revoked manager schedule workflow: "+phrase);
for(const unsafe of ['throw Error(e?.message','setError(e.message','Upcoming shifts could not be verified. No publication changes were made."];']){
 assert.ok(!manager.includes(unsafe),"Customer manager must not expose raw SQL errors: "+unsafe);
}
assert.ok(managerPage.includes('PublishedServiceScheduleManager companyId={company?.id} language={managerLanguage}'),
 "All manager subpanels must use the same selected language");
console.log("Published service visit manager full Spanish copy, company-scope async reads and safe failure control verified.");
