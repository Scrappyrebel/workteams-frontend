import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  alertAgeLabel,
  alertStatusKey,
  filterEmergencyAlerts,
  latestEventByAlert,
  waitingSummary,
} from "../lib/emergency-alert-events.js";
const read = (p) => readFileSync(p, "utf8");

// Emergency Alerts log depth (D-WT-53) invariants:
// * Catalog §7 confirmed on main: the log's only action was
//   acknowledge ("I'm on it"); no resolution note, no closed state
//   beyond acknowledged_at, no assignment, no escalation; the list
//   was .limit(50) with no filtering; every employee sees every alert.
// * HARD FENCES pinned here: (1) the EmergencyButton SEND flow is
//   untouched and NO new or escalated notification is sent anywhere
//   in this build; (2) the clock-in disclaimer stays byte-identical
//   and acknowledge never creates or touches a time entry; (3) alert
//   VISIBILITY stays all-company — nothing narrows who sees alerts;
//   (4) existing wording (including the empty state) is byte-identical.
// * Built (expansion-only): triage filters over stored fields
//   (category / status / date), a display-only unacknowledged-age
//   signal from stored timestamps, stored-but-unshown facts on the
//   cards (location_name, who responded via acknowledged_by), a
//   "Show more alerts" step past 50 that keeps today's default view,
//   and an assignment + resolution/closure record in the additive
//   migration-086 emergency_alert_events table — written by the same
//   supervisor+ roles that acknowledge, never gating acknowledge, and
//   fail-soft so the page is exactly as today before 086 runs.
// * NOT built, by design (decision items): escalation / any new send,
//   visibility scoping, required resolution notes.

const PAGE = "app/app/[companyId]/emergency/page.js";
const BUTTON = "components/EmergencyButton.js";
const ACK_ROUTE = "app/api/emergency/acknowledge/route.js";
const SEND_ROUTE = "app/api/emergency/send/route.js";
const LIB = "lib/emergency-alert-events.js";
const MIGRATION = "supabase/086_emergency_alert_events.sql";

test("fence 1: the send flow is untouched and nothing new is sent", () => {
  const button = read(BUTTON);
  for (const needle of [
    '{ key: "owner", label: "The owner", desc: "Goes straight to the owner only" }',
    '{ key: "leaders", label: "Managers & supervisors", desc: "Everyone who can respond and acknowledge" }',
    '["clock_issue", "Clock-in / clock-out problem"]',
    '["safety", "Safety or emergency"]',
    '["customer_issue", "Customer / communication-book problem"]',
    '["schedule_coverage", "Schedule / coverage / no-show problem"]',
    '["proof_upload", "Photo / video / proof upload problem"]',
    '["equipment", "Equipment or supply problem"]',
    '["emergency", "Other urgent problem"]',
    "maxLength={500}",
    '"Alert saved in the app. Push notifications aren\'t set up yet — tell your manager to enable them in the app menu."',
    'fetch("/api/emergency/send"',
  ]) {
    assert.ok(button.includes(needle), `EmergencyButton keeps: ${needle}`);
  }
  // This build sends nothing: neither the page nor the lib references
  // a send/notify/push path.
  for (const src of [read(PAGE), read(LIB)]) {
    for (const banned of ["/api/emergency/send", "sendPush", "/notify", "push_subscriptions"]) {
      assert.ok(!src.includes(banned), `no new sending introduced: ${banned}`);
    }
  }
  // The send route itself still owns the only emergency insert.
  assert.ok(read(SEND_ROUTE).includes('.from("emergency_alerts")'), "send route unchanged in shape");
});

test("fence 2: disclaimer verbatim; acknowledge never touches time entries", () => {
  const page = read(PAGE);
  assert.ok(
    page.includes(
      "Acknowledging an alert does not clock you in. Only your own scheduled shift or a separate manager-approved clock-in can create a time entry."
    ),
    "clock-in disclaimer is byte-identical"
  );
  const ack = read(ACK_ROUTE);
  assert.ok(ack.includes("Never create or modify"), "ack route keeps its no-time-entry comment");
  assert.ok(ack.includes("time_entries from alerts"), "ack route names the protected area");
  assert.ok(!ack.includes('.from("time_entries")'), "ack route never reads or writes time_entries");
  assert.ok(!page.includes('.from("time_entries")'), "log page never touches time_entries");
  // The acknowledge path itself is the original one.
  for (const needle of [
    'fetch("/api/emergency/acknowledge"',
    '"I\'m on it"',
    "acknowledged_at, acknowledged_by, company_members!emergency_alerts_sender_member_id_fkey(display_name)",
    'body: JSON.stringify({ companyId: company.id, alertId: id })',
  ]) {
    assert.ok(page.includes(needle), `acknowledge path keeps: ${needle}`);
  }
});

test("fences 3+4: visibility and existing wording are byte-preserved", () => {
  const page = read(PAGE);
  for (const needle of [
    "// Everyone sees the alerts for their company.",
    "No alerts. Hopefully it stays that way.",
    "needing a response right now",
    '{a.company_members?.display_name || "Someone"}',
    '" • ✅ Responded"',
    "Open customer request →",
  ]) {
    assert.ok(page.includes(needle), `page keeps: ${needle}`);
  }
  // The alerts query still scopes by company only — no audience,
  // role, category or sender narrowing was added to the load.
  assert.ok(page.includes('.eq("company_id", company.id)'), "alerts load stays company-scoped");
  assert.ok(!page.includes('.eq("audience"'), "no audience narrowing introduced");
});

test("triage depth: filters, ageing, stored facts, show-more", () => {
  const page = read(PAGE);
  for (const needle of [
    "filterEmergencyAlerts",
    "All categories",
    "Needs a response",
    "Last 7 days",
    "Last 30 days",
    "No alerts match those filters.",
    "waiting over an hour · longest wait",
    "• Waiting ",
    "alertAgeLabel(a.created_at, nowMs)",
    "📍 {a.location_name}",
    "Responded by {names[a.acknowledged_by]}",
    "const [limit, setLimit] = useState(50);",
    ".limit(limit)",
    "Show more alerts",
    "alerts.length === limit",
  ]) {
    assert.ok(page.includes(needle), `triage depth present: ${needle}`);
  }
  const lib = read(LIB);
  assert.ok(lib.includes("return { ok: false, events: [] }"), "event loads fail soft before migration 086");
  assert.ok(lib.includes('if (eventType === "assigned" && !assigneeMemberId) return false;'), "assignment requires a named responder");
});

test("assignment + resolution record alongside, never gating acknowledge", () => {
  const page = read(PAGE);
  for (const needle of [
    "recordEmergencyAlertEvent",
    'recordEvent(a, "assigned")',
    'recordEvent(a, "resolved")',
    "Assign to",
    "Choose a responder…",
    "Assigned to",
    "Resolution note (optional — what was done)",
    "Mark resolved",
    "✅ Resolved ",
    "eventsOk && canAck && !resolvedEvent",
    '.from("team_directory")',
    '["owner", "admin", "supervisor"].includes(m.role)',
  ]) {
    assert.ok(page.includes(needle), `record layer present: ${needle}`);
  }
  // Acknowledge is defined before, and independently of, the record
  // writer — recordEvent never calls it and it never calls recordEvent.
  const ackIdx = page.indexOf("async function acknowledge(id)");
  const recordIdx = page.indexOf("async function recordEvent(");
  assert.ok(ackIdx > 0 && recordIdx > ackIdx, "record writer is separate from acknowledge");
  const ackBody = page.slice(ackIdx, recordIdx);
  assert.ok(!ackBody.includes("recordEmergencyAlertEvent"), "acknowledge never writes an event");
});

test("migration 086 is additive-only, append-only, supervisor+ writes", () => {
  const sql = read(MIGRATION);
  assert.ok(sql.includes("create table if not exists public.emergency_alert_events"), "one new table");
  assert.ok(sql.includes("grant select, insert, update, delete on public.emergency_alert_events to authenticated;"), "grants present (AGENTS.md rule)");
  assert.ok(sql.includes("grant all on public.emergency_alert_events to service_role;"), "service_role grant present");
  for (const banned of ["alter table public.emergency_alerts", "drop table", "drop column", "update public.emergency_alerts", "delete from public.emergency_alerts"]) {
    assert.ok(!sql.toLowerCase().includes(banned), `migration does not touch existing data: ${banned}`);
  }
  assert.ok(sql.includes('"emergency_alert_events select if member"'), "select mirrors the alerts' all-member visibility");
  assert.ok(sql.includes('"emergency_alert_events insert if supervisor+"'), "insert mirrors 029's acknowledge predicate");
  assert.ok(sql.includes("m.role in ('owner', 'admin', 'supervisor')"), "only the roles that acknowledge today can write the record");
  assert.ok(!sql.includes("for update") && !sql.includes("for delete"), "no update/delete policies — the record cannot be rewritten from the app");
});

test("lib helpers: status, ageing, filtering behave as specified", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  const alerts = [
    { id: "1", category: "safety", created_at: "2026-11-02T10:30:00Z", acknowledged_at: null },
    { id: "2", category: "clock_issue", created_at: "2026-11-01T09:00:00Z", acknowledged_at: "2026-11-01T09:30:00Z" },
    { id: "3", category: "safety", created_at: "2026-10-20T09:00:00Z", acknowledged_at: "2026-10-20T09:30:00Z" },
  ];
  const resolvedIds = new Set(["2"]);
  assert.equal(alertStatusKey(alerts[0], resolvedIds), "needs_response");
  assert.equal(alertStatusKey(alerts[1], resolvedIds), "resolved");
  assert.equal(alertStatusKey(alerts[2], resolvedIds), "responded");
  assert.equal(alertAgeLabel(alerts[0].created_at, now), "1 h 30 min");
  assert.equal(alertAgeLabel("2026-11-02T11:59:30Z", now), "under a minute");
  const ws = waitingSummary(alerts, now);
  assert.equal(ws.waiting, 1);
  assert.equal(ws.overHour, 1);
  assert.equal(ws.oldestMs, 90 * 60 * 1000);
  assert.deepEqual(
    filterEmergencyAlerts(alerts, { category: "safety", resolvedIds, nowMs: now }).map((a) => a.id),
    ["1", "3"]
  );
  assert.deepEqual(
    filterEmergencyAlerts(alerts, { status: "needs_response", resolvedIds, nowMs: now }).map((a) => a.id),
    ["1"]
  );
  assert.deepEqual(
    filterEmergencyAlerts(alerts, { when: "7d", resolvedIds, nowMs: now }).map((a) => a.id),
    ["1", "2"]
  );
  const evs = [
    { alert_id: "1", event_type: "assigned", assignee_member_id: "m1", created_at: "2026-11-02T10:40:00Z" },
    { alert_id: "1", event_type: "assigned", assignee_member_id: "m2", created_at: "2026-11-02T10:50:00Z" },
  ];
  assert.equal(latestEventByAlert(evs, "assigned").get("1").assignee_member_id, "m2");
});
