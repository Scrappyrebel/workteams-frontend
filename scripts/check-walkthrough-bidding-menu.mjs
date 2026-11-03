import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Walkthrough and Bidding menu grouping (owner, 2026-11-03) invariants:
// * Presentation only. The owner asked for the whole walkthrough chain
//   -- Walkthroughs, Bids, Contracts -- to sit together in the menu
//   under one heading, "Walkthrough and Bidding", anchored where
//   Walkthroughs already was. No page changes, no renames, nothing
//   removed or re-gated: the three items keep their exact labels,
//   hrefs and minRole values, and every other NAV item keeps its
//   relative order (the front pins Time Clock / Schedule / My
//   Schedule / Dashboard are untouched).
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
  assert.deepEqual(keys.slice(0, 4), ["timeclock", "scheduling", "myschedule", "dashboard"]);
  assert.equal(keys[w - 1], "messaging", "Messages still directly precedes the chain anchor");
  assert.equal(keys[w + 3], "workorders", "Work Orders still directly follows the chain");
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
  assert.ok(shell.includes("WALKTHROUGH AND BIDDING"), "panel heading text is present");
  assert.ok(
    shell.includes('if (navResults === null && item.key === "walkthroughs")'),
    "heading is gated to the unsearched panel at the Walkthroughs item",
  );
  assert.ok(
    shell.includes('key="walkthrough-bidding-heading"'),
    "heading carries its stable key",
  );
  // The heading is a <p>, never a Link/menuitem, and is not part of
  // the searchable item list.
  const headingAt = shell.indexOf("WALKTHROUGH AND BIDDING");
  const block = shell.slice(Math.max(0, headingAt - 700), headingAt);
  assert.ok(block.includes("<p"), "heading renders as a paragraph, not a link");
  assert.ok(!block.includes('role="menuitem"'), "heading is not a menu item");
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
