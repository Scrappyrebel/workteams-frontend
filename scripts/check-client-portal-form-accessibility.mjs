import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../app/portal/[token]/page.js",import.meta.url),"utf8");
for(const m of [
 'aria-labelledby="portal-sign-amendment-title"',
 'id="portal-sign-amendment-title"',
 'aria-label={t("Full legal name for signature"',
 'autoComplete="name" required placeholder=',
 'aria-busy={signBusy}','aria-busy={cleanBusy}',
 'aria-busy={tempBusy}','aria-busy={contactBusy}',
 'aria-label={t("Additional service notes (optional)"',
 'aria-label={t("Staffing job details (optional)"',
 'aria-label={t("Hours worked to confirm"',
 'aria-label={t("Your name","Su nombre")}',
 'aria-label={t("Subject","Asunto")}',
 'aria-label={t("Your message to customer service"',
 'role="radiogroup" aria-label={t("Reason for contacting us"',
 'style={{ accentColor: "var(--brand)", marginRight: 6 }}',
 'flexWrap: "wrap"','beginAction("contact")',
 'beginAction("sign")','portalAction.current',
 'id="portal-customer-requests"','id="portal-documents"',
 'This secure link is for this location only.']){
 assert.ok(src.includes(m),"WorkTeams accessible form/security regression: "+m);
}
assert.ok(!src.includes('style={{ display: "none" }} />'),"Category radios must remain keyboard accessible");
assert.ok(!src.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'),"Public link must not expose service credentials");
console.log("WorkTeams mobile forms, visible keyboard radios, and token-bound action protections passed.");