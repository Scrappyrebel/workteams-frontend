import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/053_client_portal_opt_in_identity_foundation.sql",import.meta.url),"utf8");
const doc=readFileSync(new URL("../docs/CLIENT_PORTAL_AUTHENTICATED_IDENTITY_DECISION.md",import.meta.url),"utf8");
const old=readFileSync(new URL("../app/api/portal/lookup/route.js",import.meta.url),"utf8");
const targets=["client_portal_identity_settings","client_portal_contacts","client_portal_identity_links","client_portal_location_grants"];
for(const t of targets){
 assert.ok(sql.includes("create table if not exists public."+t+"("),"Missing isolated identity table "+t);
 assert.ok(sql.includes("alter table public."+t+" enable row level security;"),"RLS missing on "+t);
 assert.ok(sql.includes("revoke all on public."+t+" from public,anon,authenticated;"),"Public grants must be revoked: "+t);
}
for(const exact of [
 "enabled boolean not null default false",
 "status text not null default 'pending'",
 "can_view_contracts boolean not null default false",
 "can_view_quality boolean not null default false",
 "can_view_requests boolean not null default false",
 "can_view_documents boolean not null default false",
 "can_request_services boolean not null default false",
 "can_sign boolean not null default false",
 "foreign key(company_id,location_id)",
 "references public.locations(company_id,id) on delete cascade",
 "foreign key(company_id,contact_id)",
 "references public.client_portal_contacts(company_id,id) on delete cascade",
 "unique(company_id,contact_id,location_id)",
 "client_portal_contacts_approval_required",
 "client_portal_identity_links_active_verified"
])assert.ok(sql.includes(exact),"Missing opt-in safety: "+exact);
assert.ok(!sql.includes("grant select on public.client_portal_"),"No direct customer reads");
assert.ok(!sql.includes("insert into public.client_portal_"),"Do not provision contacts or enable companies");
assert.ok(!sql.includes("create policy"),"No customer identity policy should exist before auth rollout");
for(const term of ["Phase A", "Phase B", "Phase C", "Phase D", "Phase E", "Phase F", "separate authenticated route group","token","disabled by default","identity_links"])
 assert.ok(doc.toLowerCase().includes(term.toLowerCase()),"Architecture decision missing "+term);
assert.ok(old.includes("get_portal_data"),"Original bearer location lookup must remain unchanged");
assert.ok(!old.includes("client_portal_identity_links"),"Never bridge bearer links to identity data");
console.log("WorkTeams opt-in Customer Portal identity design and disabled-by-default RLS foundation checks passed.");
