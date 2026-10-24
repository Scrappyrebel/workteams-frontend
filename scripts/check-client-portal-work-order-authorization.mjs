import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../app/api/portal/service/route.js",import.meta.url),"utf8");
const post=source.slice(source.indexOf("export async function POST("));
for(const guard of [
 'typeof token!=="string"','token.length>128','typeof date!=="string"',
 'Number.isNaN(Date.parse(date))','new Date(date).toISOString().slice(0,10)!==date',
 'typeof notes!=="string"||notes.length>2000',
 'const { data: pt, error: tokenError }','if(tokenError)return portalResponse(',
 'if (!pt) return portalResponse(','pt.expires_at',
 '.eq("company_id", pt.company_id)','.eq("location_id", pt.location_id)',
 '.eq("status", "signed")','if(contractError)return portalResponse(',
 'rawPrice===null||rawPrice===undefined','!Number.isFinite(Number(rawPrice))',
 'Number(rawPrice)<0','No signed contract rate is available for this service',
 'const price=Number(rawPrice);'
]){
 assert.ok(post.includes(guard),"WorkTeams priced work order safeguard absent: "+guard);
}
assert.ok(post.indexOf("if(rawPrice===null")<post.indexOf('.from("work_orders").insert('),
 "Unpriced requests must be rejected before creating work orders");
assert.ok(source.includes('"Cache-Control":"private, no-store, max-age=0"'));
console.log("WorkTeams token, calendar date, contract rate, notes length and no-unpriced-write checks passed.");
