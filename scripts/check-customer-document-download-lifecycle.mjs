import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createCustomerDocumentDownloadGuard} from "../lib/customer-document-download-guard.mjs";

const guard=createCustomerDocumentDownloadGuard();
const first=guard.begin();
assert.equal(guard.isCurrent(first.run),true);
assert.equal(first.signal.aborted,false);
const second=guard.begin();
assert.equal(first.signal.aborted,true,"New request aborts stale PDF download");
assert.equal(guard.isCurrent(first.run),false);
assert.equal(guard.isCurrent(second.run),true);
guard.cancel();
assert.equal(second.signal.aborted,true,"Revocation or tenant switch cancels download");
assert.equal(guard.isCurrent(second.run),false);
const third=guard.begin();
assert.equal(guard.isCurrent(third.run),true);
guard.finish(third.run);
assert.equal(guard.isCurrent(third.run),false);

const page=readFileSync(new URL("../components/AuthenticatedCustomerDocuments.js",import.meta.url),"utf8");
for(const marker of [
 "createCustomerDocumentDownloadGuard",
 "auth.onAuthStateChange",
 'event==="SIGNED_OUT"',
 "downloadGuard.current.cancel()",
 "signal",
 "downloadGuard.current.isCurrent(run)",
 "subscription?.unsubscribe()"
])assert.ok(page.includes(marker),"Missing customer PDF session safety: "+marker);
assert.ok(page.includes('if(!downloadGuard.current.isCurrent(run))return;'),
 "Downloaded private bytes must be discarded if the customer changes session or tenant.");
console.log("Customer PDF download cancellation, sign-out, tenant-switch, and stale-response guards passed.");
