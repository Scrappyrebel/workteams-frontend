import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/portal/temp/route.js",import.meta.url),"utf8");
const guards=[
 'typeof token!=="string"||!token||token.length>128',
 'if(tokenError)return',
 'new Date(pt.expires_at)<=new Date()',
 '.eq("id",pt.location_id).eq("company_id",pt.company_id)',
 'if(locationError)return',
 'if(!loc)return',
 '"Cache-Control":"private, no-store, max-age=0"',
 'const { data: cfg, error: cfgError }',
 'const { data: jr, error: jrError }',
 '.eq("portal_token_id", pt.id)',
 '.select("id,hours_confirmed")',
 'if(!updated||Number(updated.hours_confirmed)!==hours)',
 'Number.isInteger(cleanersNeeded)'
];
for(const g of guards)assert.ok(route.includes(g),"Missing temp security check: "+g);
assert.ok(route.indexOf('getPortalToken(token);')<route.indexOf('.from("temp_job_requests").insert('));
console.log("Temporary staffing location token checks and confirmed writes passed.");
