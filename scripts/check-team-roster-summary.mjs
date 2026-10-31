import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Team roster orientation (Depth D-WT-19) invariants:
// * The Team page already had invites, roles, dual pay rates, department
//   access and an availability board, but no roster-level orientation:
//   no headcount, no active/pending split, no pay-setup completeness,
//   no way to find one person in a long roster, and no tenure context.
// * Everything added is computed from rows the page's load() already
//   fetches under the existing RLS — no new query, no new data exposure:
//   - Headcount + active/invite-pending split (the same user_id signal
//     the existing Active / Invite pending badges already use).
//   - "Both pay rates set" count, shown ONLY when the member_pay read
//     succeeded (payLoaded) — a failed pay read must never print a
//     made-up "0 of N".
//   - "On the team since {Month Year}" renders only when the loaded
//     row carries created_at. Manager selects include it; the employee
//     team_directory view does not return it, so employee cards are
//     unchanged.
//   - The roster search filters the member CARDS only; the
//     availability section keeps mapping the unfiltered roster.
// * This pass deliberately does NOT change the page's write behavior.
//   Three behaviors are Wendy decision items, pinned here so any
//   change to them is a visible, deliberate diff:
//   - Pay fields still save on blur (changePayField via onBlur).
//   - Remove still hard-deletes the company_members row.
//   - The pre-migration "Profile editing turns on" note still renders
//     verbatim for members whose profile columns aren't there yet.
// * No pay write path, rate value, or time record is touched; nothing
//   here can change anyone's pay or time.

const page = readFileSync("app/app/[companyId]/team/page.js", "utf8");

// --- The additions exist and stay honest ---
assert.ok(
  page.includes("have both pay rates set") && page.includes("payLoaded"),
  "the both-pay-rates count must render only behind the payLoaded flag"
);
assert.ok(
  page.includes("setPayLoaded(!payError)"),
  "payLoaded must come from the member_pay read's own error state"
);
assert.ok(
  page.includes("invite pending") && page.includes("activeCount"),
  "the summary must show the active / invite-pending split from loaded rows"
);
assert.ok(
  page.includes("On the team since") && page.includes("m.created_at"),
  "the tenure line must be gated on the loaded row carrying created_at"
);
assert.ok(
  page.includes("visibleMembers.map") && page.includes("Search the team by name or email"),
  "the roster search must filter the member cards"
);
assert.ok(
  page.includes("{members.map((m) => {") && page.includes("availabilityCells(m.id)"),
  "the availability section must keep rendering the full, unfiltered roster"
);
assert.ok(
  page.includes("Rates and titles save on their own as soon as you tap out of a field"),
  "the pay grid must state plainly that pay fields auto-save on blur today"
);

// --- Decision-item behaviors are pinned, NOT changed by this pass ---
assert.ok(
  page.includes("onBlur={(e) => {") && page.includes("changePayField(m, f.field, e.target.value)"),
  "pay fields still save on blur — changing that is Wendy's decision (D-WT-19 D1)"
);
assert.ok(
  page.includes('from("company_members").delete()'),
  "remove still hard-deletes the member row — deactivate is Wendy's decision (D-WT-19 D2)"
);
assert.ok(
  page.includes("Profile editing turns on with the latest WorkTeams update."),
  "the pre-migration profile note still renders verbatim — rewording is Wendy's decision (D-WT-19 D3)"
);

// --- Everything already on the page stays ---
for (const kept of [
  "Invite a team member",
  "Team availability",
  "update_my_profile",
  "Tap again to remove",
  "Set both rates and they'll pick Cleaner or Manager at clock-in.",
]) {
  assert.ok(page.includes(kept), `existing team element must stay: ${kept}`);
}

console.log("Team roster summary guards passed.");
