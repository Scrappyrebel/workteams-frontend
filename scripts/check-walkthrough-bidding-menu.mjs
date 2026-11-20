import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Sales department menu grouping invariants. The grouping began as
// "Walkthrough and Bidding" (owner, 2026-11-03); the WorkTeams
// walkthrough of 2026-11-19 (Wendy) superseded parts of it:
// * The chain -- Walkthroughs, Bids, Contracts -- still sits together
//   under one heading, now "SALES DEPARTMENT" (a real department, not
//   just a chain label), anchored where Walkthroughs already was. The
//   three items keep their exact labels, hrefs and minRole values.
// * The front order is now Time Clock / My Schedule / Dashboard /
//   Schedule (Dashboard third, Schedule on its other side), and the
//   strip ends Temp Staffing (runtime-inserted) -> Settings -> App
//   Sales -> Tier Prices -> Plans, Plans last. "Sales" was renamed
//   "App Sales" so it is not confused with this department.
// * A second department heading, "CUSTOMER SERVICE DEPARTMENT", sits
//   above Client Portal (that page carries the customer inbox too).
// * The heading is presentational: it is not a link and it is never
//   a menu-search result. It renders only over the full (unsearched)
//   panel, directly above Walkthroughs. All three chain items are
//   manager-gated, so the heading shows exactly when they do.
// * Menu search is unchanged: it still filters the same
//   permission-filtered list with the same word-tolerant matcher, so
//   Walkthroughs / Bids / Contracts are found exactly as before.

const SHELL = "components/AppShell.js";

function navKeys(shell) {
  const start = shell.indexOf("const NAV = [");
  const end = shell.indexOf("];", start);
  assert.ok(start >= 0 && end > start, "NAV array is present");
  return [...shell.slice(start, end).matchAll(/\{ key: "([^"]+)"/g)].map((m) => m[1]);
}

test("the chain sits together in NAV, in chain order, anchored at Walkthroughs", () => {
  const shell = read(SHELL);
  const keys = navKeys(shell);
  const w = keys.indexOf("walkthroughs");
  assert.ok(w > 0, "walkthroughs is in NAV");
  assert.equal(keys[w + 1], "bidding", "Bids directly follows Walkthroughs");
  assert.equal(keys[w + 2], "contracts", "Contracts directly follows Bids");
  assert.equal(keys.filter((k) => k === "contracts").length, 1, "contracts appears exactly once in NAV");
  assert.equal(keys.filter((k) => k === "walkthroughs").length, 1, "walkthroughs appears exactly once in NAV");
  assert.equal(keys.filter((k) => k === "bidding").length, 1, "bidding appears exactly once in NAV");
  // Everything before Walkthroughs keeps its order (front pins first),
  // and the item that followed the chain before (Work Orders) still
  // follows it now.
  assert.deepEqual(keys.slice(0, 4), ["timeclock", "myschedule", "dashboard", "scheduling"]);
  assert.equal(keys[w - 1], "messaging", "Messages still directly precedes the chain anchor");
  assert.equal(keys[w + 3], "workorders", "Work Orders still directly follows the chain");
});

test("Emergency Alerts rides behind the core; Temp Staffing leads the end group (Wendy, 2026-11-19)", () => {
  const shell = read(SHELL);
  const keys = navKeys(shell);
  // Emergency Alerts (Wendy, 2026-11-16) still rides right behind the
  // pinned core: it is the fifth item. Temp Staffing no longer rides
  // up front with it — the 2026-11-19 walkthrough reversed that: Temp
  // Staffing leads the end-of-strip group (Temp Staffing -> Settings
  // -> App Sales -> Tier Prices -> Plans, Plans last of all), inserted
  // at runtime before the first end-group item present.
  assert.equal(keys[4], "emergency", "Emergency Alerts directly follows Schedule");
  assert.equal(keys.filter((k) => k === "emergency").length, 1, "emergency appears exactly once in NAV");
  assert.ok(
    shell.includes("links.splice(endIdx, 0, tempItem)"),
    "Temp Staffing is inserted at the head of the end group, not up front"
  );
  assert.ok(
    shell.includes('["settings", "sales", "tierprices", "plans"].includes(l.key)'),
    "the end group is Settings / App Sales / Tier Prices / Plans"
  );
  assert.deepEqual(
    keys.slice(-4),
    ["settings", "sales", "tierprices", "plans"],
    "NAV ends Settings -> App Sales -> Tier Prices -> Plans"
  );
  assert.ok(
    shell.includes('{ key: "sales", label: "App Sales"'),
    "the app-revenue dashboard is renamed App Sales"
  );
});

test("the three chain items keep their exact labels, hrefs and role gates", () => {
  const shell = read(SHELL);
  for (const needle of [
    '{ key: "walkthroughs", label: "Walkthroughs", href: (c) => `/app/${c}/walkthroughs`, minRole: "manager" }',
    '{ key: "bidding", label: "Bids", href: (c) => `/app/${c}/bids`, minRole: "manager" }',
    '{ key: "contracts", label: "Contracts", href: (c) => `/app/${c}/contracts`, minRole: "manager" }',
  ]) {
    assert.ok(shell.includes(needle), `NAV keeps: ${needle}`);
  }
});

test("the heading renders only over the full panel, directly above Walkthroughs", () => {
  const shell = read(SHELL);
  assert.ok(shell.includes("SALES DEPARTMENT"), "panel heading text is present");
  assert.ok(
    shell.includes('if (navResults === null && item.key === "walkthroughs")'),
    "heading is gated to the unsearched panel at the Walkthroughs item",
  );
  assert.ok(
    shell.includes('key="sales-department-heading"'),
    "heading carries its stable key",
  );
  // The heading is a <p>, never a Link/menuitem, and is not part of
  // the searchable item list.
  const headingAt = shell.indexOf("SALES DEPARTMENT");
  const block = shell.slice(Math.max(0, headingAt - 700), headingAt);
  assert.ok(block.includes("<p"), "heading renders as a paragraph, not a link");
  assert.ok(!block.includes('role="menuitem"'), "heading is not a menu item");
  // The Customer Service department heading rides the same pattern,
  // above Client Portal (Wendy, 2026-11-19).
  assert.ok(shell.includes("CUSTOMER SERVICE DEPARTMENT"), "customer service heading text is present");
  assert.ok(
    shell.includes('if (navResults === null && item.key === "portal")'),
    "customer service heading is gated to the unsearched panel at the Client Portal item",
  );
  assert.ok(
    shell.includes('key="customer-service-department-heading"'),
    "customer service heading carries its stable key",
  );
});

test("menu search behaviour is unchanged", () => {
  const shell = read(SHELL);
  for (const needle of [
    "function navLabelMatches(label, query) {",
    "navResults = linksMapped.filter((item) => {",
    "if (!navLabelMatches(item.label, navQuery)) return false;",
    "const panelItems = navResults ?? linksMapped;",
  ]) {
    assert.ok(shell.includes(needle), `search keeps: ${needle}`);
  }
});

test("the guard itself is wired into the prebuild chain", () => {
  const pkg = read("package.json");
  assert.ok(
    pkg.includes("node scripts/check-walkthrough-bidding-menu.mjs"),
    "prebuild runs this guard",
  );
});
