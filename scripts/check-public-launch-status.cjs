const fs=require("node:fs");const assert=require("node:assert/strict");
const marketing=fs.readFileSync("components/LandingContent.js","utf8");
const status=fs.readFileSync("lib/public-launch-status.js","utf8");
const instructions=fs.readFileSync("AGENTS.md","utf8");
assert.match(status,/WORKTEAMS_PUBLIC_SALE_APPROVED=false/);
for(const s of ["UNDER CONSTRUCTION — Available at a Later Date","id=\"construction-status\"","Existing users can continue to", "WORKTEAMS_PUBLIC_SALE_APPROVED", "Check launch status","pricing is shown for preview only"])
 if(s!=="pricing is shown for preview only")assert.ok(marketing.includes(s),"Missing public sales disclosure: "+s);
assert.ok(marketing.includes("Plan pricing is shown for preview only"),"Plan pricing must be clearly marked preview");
assert.ok(instructions.includes("100% Nationwide Subscription Rule")&&instructions.includes("owner-only Control Hub"));
const privateApp=fs.readFileSync("app/app/page.js","utf8");
assert.ok(!privateApp.includes("UNDER CONSTRUCTION"),"Do not show sale banners in signed-in app");
console.log("PASS: public WorkTeams sales disclosure; existing personal app untouched.");
