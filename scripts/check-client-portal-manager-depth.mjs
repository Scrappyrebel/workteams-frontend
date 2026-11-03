import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  storedDateString,
  locationRequestActivity,
  contactAccessDates,
} from "../lib/client-portal-manager-depth.mjs";

// --- Unit: stored dates are shown only when real; absence stays absent ---
assert.equal(storedDateString("2026-10-01T12:00:00Z"), "2026-10-01T12:00:00Z");
assert.equal(storedDateString("not-a-date"), null);
assert.equal(storedDateString(""), null);
assert.equal(storedDateString(null), null);
assert.equal(storedDateString(undefined), null);
assert.equal(storedDateString(1720000000000), null);

// --- Unit: per-location activity counts only the loaded window ---
const messages = [
  { location_id: "loc-a", read_at: null, customer_status: "received", created_at: "2026-10-02T09:00:00Z" },
  { location_id: "loc-a", read_at: "2026-10-02T10:00:00Z", customer_status: "resolved", created_at: "2026-10-03T09:00:00Z" },
  { location_id: "loc-a", read_at: null, customer_status: "in_progress", created_at: "2026-10-01T09:00:00Z" },
  { location_id: "loc-b", read_at: null, customer_status: "received", created_at: "2026-10-04T09:00:00Z" },
  { location_id: "loc-a", read_at: null, customer_status: "received", created_at: "junk" },
];
const a = locationRequestActivity(messages, "loc-a");
assert.deepEqual(a, { recent: 4, unread: 3, open: 3, latestAt: "2026-10-03T09:00:00Z" });
assert.deepEqual(locationRequestActivity(messages, "loc-b"), {
  recent: 1, unread: 1, open: 1, latestAt: "2026-10-04T09:00:00Z",
});
assert.deepEqual(locationRequestActivity(messages, "loc-none"), {
  recent: 0, unread: 0, open: 0, latestAt: null,
});
assert.deepEqual(locationRequestActivity(null, "loc-a"), {
  recent: 0, unread: 0, open: 0, latestAt: null,
});

// --- Unit: contact access dates are tolerant of pre-migration payloads ---
assert.deepEqual(contactAccessDates({}), { approvedAt: null, accountLinkedAt: null });
assert.deepEqual(contactAccessDates(null), { approvedAt: null, accountLinkedAt: null });
assert.deepEqual(
  contactAccessDates({
    approved_at: "2026-09-15T08:30:00Z",
    account_linked_at: "2026-09-20T11:00:00Z",
  }),
  { approvedAt: "2026-09-15T08:30:00Z", accountLinkedAt: "2026-09-20T11:00:00Z" }
);
assert.deepEqual(
  contactAccessDates({ approved_at: "junk", account_linked_at: 42 }),
  { approvedAt: null, accountLinkedAt: null }
);
console.log("client-portal-manager-depth lib: stored-date, per-location activity and tolerant contact-date units PASSED");

// --- The lib is pure: it must never read, write or call the network ---
const lib = readFileSync(new URL("../lib/client-portal-manager-depth.mjs", import.meta.url), "utf8");
for (const banned of ["supabase", "fetch(", ".from(", ".rpc("]) {
  assert.ok(!lib.includes(banned), "depth lib must stay pure, found: " + banned);
}

// --- Manager page wiring: additive display only, reads unchanged ---
const page = readFileSync(
  new URL("../app/app/[companyId]/client-portal/page.js", import.meta.url), "utf8");
for (const token of [
  'from "../../../../lib/client-portal-manager-depth.mjs"',
  "locationRequestActivity(messages, l.id)",
  'tr("Link created","Enlace creado el")',
  'tr("Recent requests at this location","Solicitudes recientes en esta ubicación")',
  // Existing gates and selects stay exactly as they were: the new displays
  // reuse data those reads already loaded, manager-scoped as before.
  'member.role === "owner" || member.role === "admin"',
  'canUseWithRole(company?.effectiveTier || company?.tier, "portal", member?.role)',
  '.select("id, location_id, token, client_name, expires_at, created_at")',
]) {
  assert.ok(page.includes(token), "Missing manager-depth page token: " + token);
}
const count = (haystack, needle) => haystack.split(needle).length - 1;
assert.equal(count(page, '.from("portal_messages")'), 5, "portal_messages read/write sites must not change");
assert.equal(count(page, '.from("portal_tokens")'), 5, "portal_tokens read/write sites must not change");
assert.equal(count(page, '.from("locations")'), 1, "locations read sites must not change");
console.log("client-portal-manager-depth page: additive displays pinned; gates, selects and read sites unchanged");

// --- Contacts component: dates render only through the tolerant helper ---
const contacts = readFileSync(
  new URL("../components/ClientIdentityContactManager.js", import.meta.url), "utf8");
for (const token of [
  'from "../lib/client-portal-manager-depth.mjs"',
  "contactAccessDates(c).approvedAt",
  "contactAccessDates(c).accountLinkedAt",
  't("Approved ","Aprobado el ")',
  't("Account linked ","Cuenta vinculada el ")',
]) {
  assert.ok(contacts.includes(token), "Missing manager-depth contacts token: " + token);
}
console.log("client-portal-manager-depth contacts: approved/linked dates render tolerantly (absent pre-migration)");

// --- Migration 095: additive RPC payload only, same manager gate ---
const migration = readFileSync(
  new URL("../supabase/095_client_portal_contact_access_dates.sql", import.meta.url), "utf8");
for (const token of [
  "create or replace function public.list_workteams_customer_identity_contacts(p_company_id uuid)",
  "public.workteams_client_portal_pilot_manager(p_company_id)",
  "'approved_at',ct.approved_at",
  "'account_linked_at'",
  "select max(il.verified_at) from public.client_portal_identity_links il",
  "'schedule_access',g.can_view_schedule",
  "grant execute on function public.list_workteams_customer_identity_contacts(uuid)",
]) {
  assert.ok(migration.includes(token), "Missing migration 095 token: " + token);
}
assert.ok(!migration.includes("create table"), "095 must not create tables");
assert.ok(!migration.includes("alter table"), "095 must not alter tables");
assert.ok(!migration.includes("auth_user_id,"), "095 must not expose identity ids in the payload");
console.log("client-portal-manager-depth migration 095: additive dates payload under the existing manager gate PASSED");
