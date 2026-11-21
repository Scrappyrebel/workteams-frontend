import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
// Wendy's ruling (2026-11-21): the temp agency is NOT part of the
// December 15 launch — it needs a lot more going-through, and the
// main WorkTeams app and Workforce come first. Every agency-side
// surface carries the under-construction tag until she releases it.
// This is a temp-specific notice; the commercial banner check's
// "not on Lilly temp services" line covers the COMMERCIAL notice
// only and is unchanged.
test("The temp agency carries its under-construction tag (Wendy, 2026-11-21)",()=>{
 const notice=read("components/TempAgencyConstructionNotice.js");
 for(const value of ["UNDER CONSTRUCTION — TEMP AGENCY","still being built and tested","not part of the December 15 launch","available at a later date"])
  assert.ok(notice.includes(value),value);
 for(const p of ["app/app/[companyId]/temp/page.js","app/app/[companyId]/temp-pay/page.js"])
  assert.ok(read(p).includes("<TempAgencyConstructionNotice />"),p);
 const pkg=JSON.parse(read("package.json"));assert.ok(pkg.scripts.prebuild.includes("check-temp-construction-notice.mjs"));
});
