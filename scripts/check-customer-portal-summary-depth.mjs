import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeCustomerPortal } from "../lib/customer-portal-summary.mjs";

// Authenticated customer portal "At a glance" summary (Depth D-WT-05)
// invariants:
// * The authenticated portal rendered one long module stack per
//   location (Quality, Work Orders, Documents, Service Schedule,
//   Requests) with no summary at all. The summary is ADDITIVE: it is
//   rendered before those modules, and all five modules stay, in
//   their original order, with their original props.
// * The customer<->company/location scoping gates in the page stay
//   byte-identical in substance: the claim RPC, the identity RPC,
//   the fail-closed error wording, and the sentence stating that
//   invoices remain private are all still present, unchanged.
// * The summary reads ONLY through the same five scoped RPCs the
//   modules below it already use, with the same company + location
//   parameters. It contains no other RPC, no table read, and no
//   write of any kind. It computes no invoice, balance, price, or
//   payment figure — the authenticated portal does not publish
//   invoices to customers and the summary must never imply it does.
// * Failed section reads stay unknown (null -> a dash on screen),
//   never a made-up zero. Every new string ships in both languages
//   through the page's own t(en, es) posture.

const page = readFileSync("app/customer-portal/page.js", "utf8");
const summaryComponent = readFileSync(
  "components/AuthenticatedCustomerPortalSummary.js",
  "utf8"
);

// --- Unit checks on the pure summarizer ---
const full = summarizeCustomerPortal({
  visits: [
    { date: "2026-11-10", start: "09:00:00", end: "10:00:00" },
    { date: "2026-11-05", start: "08:30:00", end: "09:30:00" },
  ],
  requests: [
    { status: "received", has_unseen_reply: true },
    { status: "in_progress", has_unseen_reply: false },
    { status: "resolved", has_unseen_reply: true },
  ],
  workOrders: [
    { status: "open" },
    { status: "in_progress" },
    { status: "completed" },
    { status: "cancelled" },
  ],
  documents: [{ id: "a" }, { id: "b" }],
  reports: [
    { inspection_date: "2026-10-01", score: 4 },
    { inspection_date: "2026-10-20", score: 5 },
  ],
});
assert.equal(full.nextVisit.date, "2026-11-05", "next visit is the earliest published visit");
assert.equal(full.nextVisit.start, "08:30", "next visit start is sliced as the schedule module shows it");
assert.equal(full.openRequests, 2, "open requests exclude resolved");
assert.equal(full.newReplies, 2, "new replies count the stored unseen flag wherever it appears");
assert.equal(full.openWorkOrders, 2, "open work orders are open + in_progress only");
assert.equal(full.documentCount, 2, "document count counts the listed private PDFs");
assert.equal(full.latestReport.date, "2026-10-20", "latest report is by stored inspection_date");
assert.equal(full.latestReport.score, 5, "latest report carries its stored score");

const failed = summarizeCustomerPortal({
  visits: null,
  requests: null,
  workOrders: null,
  documents: null,
  reports: null,
});
assert.equal(failed.openRequests, null, "a failed requests read stays unknown, never zero");
assert.equal(failed.newReplies, null, "a failed requests read keeps replies unknown");
assert.equal(failed.openWorkOrders, null, "a failed work-order read stays unknown");
assert.equal(failed.documentCount, null, "a failed documents read stays unknown");
assert.equal(failed.visitsKnown, false, "a failed visits read is marked unknown");
assert.equal(failed.reportsKnown, false, "a failed reports read is marked unknown");
assert.equal(failed.nextVisit, null, "no visit is invented from a failed read");
assert.equal(failed.latestReport, null, "no report is invented from a failed read");

const empty = summarizeCustomerPortal({
  visits: [],
  requests: [],
  workOrders: [],
  documents: [],
  reports: [],
});
assert.equal(empty.openRequests, 0, "a successful empty read is a real zero");
assert.equal(empty.documentCount, 0, "a successful empty documents read is a real zero");
assert.equal(empty.nextVisit, null, "an empty published list has no next visit");
assert.equal(empty.visitsKnown, true, "an empty published list is known, not failed");

// --- Page wiring: additive, order preserved ---
assert.ok(
  page.includes('import AuthenticatedCustomerPortalSummary from "../../components/AuthenticatedCustomerPortalSummary";'),
  "the portal page must import the summary component"
);
assert.ok(
  page.includes("<AuthenticatedCustomerPortalSummary"),
  "the portal page must render the summary"
);
const order = [
  "<AuthenticatedCustomerPortalSummary",
  "<AuthenticatedCustomerQuality",
  "<AuthenticatedCustomerWorkOrders",
  "<AuthenticatedCustomerDocuments",
  "<AuthenticatedCustomerServiceSchedule",
  "<AuthenticatedCustomerRequests",
];
for (let i = 1; i < order.length; i++) {
  assert.ok(
    page.indexOf(order[i - 1]) !== -1 && page.indexOf(order[i - 1]) < page.indexOf(order[i]),
    `existing module order must be preserved: ${order[i - 1]} before ${order[i]}`
  );
}

// --- Scoping gates pinned byte-for-byte in substance ---
for (const gate of [
  'sb.rpc("claim_workteams_customer_identity")',
  'sb.rpc("get_my_workteams_customer_identity")',
  "Customer locations could not be verified. No information was displayed.",
  "Invoices, employee records and internal business information remain private.",
  "onAuthorizationLost",
]) {
  assert.ok(page.includes(gate), `scoping gate must stay in the portal page: ${gate}`);
}

// --- Summary component: only the five existing scoped RPCs ---
const allowedRpcs = [
  "get_workteams_authenticated_service_schedule",
  "get_workteams_authenticated_customer_requests",
  "get_workteams_authenticated_customer_work_orders",
  "get_workteams_authenticated_customer_documents",
  "get_workteams_authenticated_quality_reports",
];
for (const rpc of allowedRpcs) {
  assert.ok(summaryComponent.includes(`"${rpc}"`), `summary must reuse the scoped RPC: ${rpc}`);
}
const rpcCalls = summaryComponent.match(/\.rpc\(/g) || [];
assert.equal(rpcCalls.length, 1, "the summary must reach its RPCs through its single section() helper only");
assert.ok(
  summaryComponent.includes("p_company_id:companyId") &&
    summaryComponent.includes("p_location_id:locationId"),
  "the summary must scope every read to the same company + location parameters"
);
assert.ok(
  !/\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(summaryComponent),
  "the summary must never read tables directly or write anything"
);
assert.ok(
  !/invoice|balance_due|amount_due|payment/i.test(
    summaryComponent.replace("Invoices are not published in this portal.", "").replace("Las facturas no se publican en este portal.", "")
  ),
  "the summary must compute no invoice, balance, or payment figure (the one honest sentence naming that invoices are not published is allowed)"
);
assert.ok(
  summaryComponent.includes("summarizeCustomerPortal"),
  "the summary rendering must go through the pure summarizer"
);
for (const pair of [
  ["At a glance", "De un vistazo"],
  ["Next service visit", "Próxima visita de servicio"],
  ["Open requests", "Solicitudes abiertas"],
  ["Open work orders", "Órdenes de trabajo abiertas"],
  ["Private documents", "Documentos privados"],
  ["Latest quality report", "Informe de calidad más reciente"],
]) {
  assert.ok(
    summaryComponent.includes(pair[0]) && summaryComponent.includes(pair[1]),
    `every summary string must ship in both languages: ${pair[0]} / ${pair[1]}`
  );
}

// --- Protected areas: no clock, video, or Comm Book surface is touched ---
assert.ok(
  !/time_entries|clock_in|clock_out|shift.?video|comm.?book/i.test(summaryComponent),
  "the summary must not touch Time Clock, Shift Videos, or Communication Book surfaces"
);

console.log("Customer portal summary depth guards passed.");
