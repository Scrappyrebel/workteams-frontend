import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../app/app/[companyId]/client-portal/page.js",import.meta.url),"utf8");
for(const m of [
 'const [invitationLanguage,setInvitationLanguage]',
 'id="client-invitation-language"',
 'Copy customer invitation','copyLink(t,"invitation")',
 'disabled={working||linkExpired(t)||Boolean(loadError)}',
 'async function copyLink(link,format="url")',
 '!isManager||!allowed||!company?.id',
 'tokens.some(row=>row.id===link.id&&row.token===link.token)',
 'new Date(link.expires_at).getTime()<=Date.now()',
 '.from("portal_tokens")','.eq("company_id",company.id).eq("id",link.id).maybeSingle()',
 'checked.data.token!==link.token',
 'checked.data.location_id!==link.location_id',
 'new Date(checked.data.expires_at).getTime()<=Date.now()',
 'window.location.origin','navigator.clipboard.writeText(payload)',
 'window.prompt','Español','No lo reenvíe','Please do not forward it',
 'The link was revoked, rotated or expired.',
 'portal_messages','customer_response'
 ])assert.ok(page.includes(m),"Missing safe WorkTeams customer link invitation guard: "+m);
assert.ok(!page.includes('mailto:')&&!page.includes('sms:'),"Never auto-send a private location token to third parties");
assert.ok(!page.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"));
console.log("WorkTeams exact company/location, expiry, revoked-token and bilingual manual-copy guards passed.");
