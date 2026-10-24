import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

for(const path of ["../app/api/portal/lookup/route.js","../app/api/portal/service/route.js"]){
 const src=readFileSync(new URL(path,import.meta.url),"utf8");
 assert.ok(src.includes('"Cache-Control":"private, no-store, max-age=0"'),path+" must never cache link data");
 assert.ok(src.includes('"Referrer-Policy":"no-referrer"'),path+" must not leak bearer token via referrer");
 assert.ok(src.includes('"X-Content-Type-Options":"nosniff"'),path+" must prevent sniffing");
 assert.ok(src.includes("headers:{...(options.headers||{}),...PRIVATE_PORTAL_HEADERS}"),"headers must survive success/error");
 assert.ok(src.includes("function portalResponse(payload,options={})"),"safe responses must share control");
 const withoutHelper=src.slice(src.indexOf("function portalResponse(")+45);
 assert.ok(!withoutHelper.includes("return NextResponse.json("),"route must not bypass private cache helper");
}
console.log("WorkTeams location link, customer request history and contract responses cannot be cached or referrer leaked.");
