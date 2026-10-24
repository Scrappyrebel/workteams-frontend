import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/049_client_portal_private_quality_publications.sql",import.meta.url),"utf8");
const detail=readFileSync(new URL("../app/app/[companyId]/inspections/[id]/page.js",import.meta.url),"utf8");
const portal=readFileSync(new URL("../app/portal/[token]/page.js",import.meta.url),"utf8");
const temp=readFileSync(new URL("../app/api/portal/temp/route.js",import.meta.url),"utf8");
function all(src,terms){for(const k of terms)assert.ok(src.includes(k),"missing "+k)}
all(sql,[
 "client_portal_inspection_publications","enable row level security",
 "revoke all on table public.client_portal_inspection_publications",
 "set_client_portal_inspection_publication","get_client_portal_inspection_publication_for_manager",
 "m.role in ('owner','admin')","if auth.uid() is null","i.score is null",
 "char_length(v_summary)<10","char_length(v_summary)>600",
 "publication.published = true","publication.company_id = i.company_id",
 "publication.location_id = i.location_id",
 "order by pub.created_at desc,pub.id desc limit 1",
 "select i.inspection_date, i.score, publication.customer_summary",
 "portal_token_id = pt.id","select title, null::text as description",
 "set search_path = ''","grant execute on function public.get_portal_data(text) to anon, authenticated;"
]);
assert.ok(!sql.includes("select inspection_date, score, notes"),"Never expose internal inspection notes");
assert.ok(!sql.includes("and customer_name = pt.client_name"),"Do not select temps by shared customer name");
assert.ok(!sql.includes("select title, description, status"),"Do not expose internal work descriptions");
all(temp,[
 "portal_token_id: pt.id",'.eq("portal_token_id", pt.id)',
 '.eq("portal_token_id",pt.id)',
 '.eq("company_id",pt.company_id)',
 '.is("hours_confirmed",null)',
 "getPortalToken(token)","Too many requests"
]);
all(detail,[
 "Customer Portal — Published Quality Report",
 "set_client_portal_inspection_publication",
 "get_client_portal_inspection_publication_for_manager",
 "check.data?.published!==publish",
 "p_publish:publish","p_customer_summary:publish?summary:null",
 "if(!isManager||!inspection||publicationBusy)return",
 "Withdraw report","Customer-safe quality summary",
 "Internal notes, checklists, inspector identities and photos stay private."
]);
all(portal,[
 "Published quality reports","No quality reports have been approved",
 "x.customer_summary","Inspection notes, photos, internal checklists",
 "data.inspections.map"
]);
assert.ok(!portal.includes("{x.notes}"),"Never render internal notes in public token portal");
console.log("WorkTeams quality report privacy: default-private publishing, role checks, snapshot, token-scoped temps and protected UI passed");
