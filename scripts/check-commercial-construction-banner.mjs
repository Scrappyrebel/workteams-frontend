import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
test("The WorkTeams national monthly subscription storefront is clearly under construction",()=>{
 const notice=read("components/CommercialConstructionNotice.js");
 for(const value of ["UNDER CONSTRUCTION","available at a later date","not ready for general public launch","Existing authorized users"])
  assert.ok(notice.includes(value),value);
 for(const p of ["components/LandingContent.js","app/login/page.js","app/app/[companyId]/plans/page.js"])
  assert.ok(read(p).includes("<CommercialConstructionNotice />"),p);
});
test("Commercial sales-only banners do not interrupt existing shift operations or Lilly temp services",()=>{
 assert.ok(!read("app/app/[companyId]/layout.js").includes("CommercialConstructionNotice"));
 assert.ok(!read("app/temp/TempLandingClient.js").includes("CommercialConstructionNotice"));
 const pkg=JSON.parse(read("package.json"));assert.ok(pkg.scripts.prebuild.includes("check-commercial-construction-banner.mjs"));
});
