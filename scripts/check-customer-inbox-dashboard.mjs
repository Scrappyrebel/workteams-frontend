import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CUSTOMER_INBOX_FILTERS,filterCustomerInbox,summarizeCustomerInbox,needsCustomerAttention} from "../lib/customer-inbox-dashboard.mjs";
const page=readFileSync(new URL("../app/app/[companyId]/client-portal/page.js",import.meta.url),"utf8");
const cases=[
 {id:"a",read_at:null,customer_status:"received",customer_response:null,category:"general"},
 {id:"b",read_at:"2026-10-24",customer_status:"in_progress",customer_response:"We are looking into this.",category:"service_problem"},
 {id:"c",read_at:"2026-10-24",customer_status:"in_progress",customer_response:null,category:"document_copy"},
 {id:"d",read_at:"2026-10-24",customer_status:"resolved",customer_response:"Resolved.",category:"callback_request"}
];
assert.deepEqual(summarizeCustomerInbox(cases),{
 recent:4,attention:2,unread:1,open:3,document_copy:1,resolved:1
});
assert.deepEqual(filterCustomerInbox(cases,"attention").map(x=>x.id),["a","c"]);
assert.deepEqual(filterCustomerInbox(cases,"unread").map(x=>x.id),["a"]);
assert.deepEqual(filterCustomerInbox(cases,"open").map(x=>x.id),["a","b","c"]);
assert.deepEqual(filterCustomerInbox(cases,"document_copy").map(x=>x.id),["c"]);
assert.deepEqual(filterCustomerInbox(cases,"resolved").map(x=>x.id),["d"]);
assert.deepEqual(filterCustomerInbox(cases,"all").map(x=>x.id),["a","b","c","d"]);
assert.deepEqual(filterCustomerInbox(cases,"invalid"),[]);
assert.deepEqual(summarizeCustomerInbox(null),{
 recent:0,attention:0,unread:0,open:0,document_copy:0,resolved:0
});
assert.equal(needsCustomerAttention(cases[3]),false);
assert.equal(CUSTOMER_INBOX_FILTERS.length,6);
for(const v of [
 '.eq("company_id",companyId)',
 'const companyId=company.id',
 'document.visibilityState!=="visible"',
 'responseInFlight.current||working',
 'setInterval(()=>{void pollInbox()},30000)',
 'document.addEventListener("visibilitychange",onVisibility)',
 'document.removeEventListener("visibilitychange",onVisibility)',
 'liveInboxCompany.current!==companyId',
 'setMessages([])',
 'setInboxError(tr("Customer request refresh failed.',
 'if(next[m.id]===undefined)',
 'CUSTOMER_INBOX_FILTERS.map',
 'filterCustomerInbox(messages,inboxFilter)',
 'summarizeCustomerInbox(messages)',
 'visibleInbox.map((m) =>',
 'most recent 50 requests, not all-time totals.'
])assert.ok(page.includes(v),"Missing manager inbox isolation or usability: "+v);
assert.ok(!page.includes("setInterval(()=>{void load()},30000)"),
 "Background refresh must not repeatedly fetch or mutate tokens and settings");
console.log("WorkTeams customer service inbox counts, filters, visibility-only polling, company scope and draft protection passed.");
