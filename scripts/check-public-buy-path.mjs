// Public pages + buying (Wendy, 2026-11-06, decided): the public
// pages are a real sales front door, and buying starts from the
// homepage / Plans / sign-up page. The WorkTeams landing was rebuilt
// to the owner's approved design on 2026-10-20; this check pins the
// pieces this pass added on top of it:
//
//   * Honesty: the landing's staffing section carries the temp
//     agency's under-construction status and the December 15 line,
//     matching the banner on the temp pages themselves (Wendy,
//     2026-11-21: the temp agency is NOT part of the Dec 15 launch).
//   * The buy path: each pricing card's button carries its tier to
//     signup (?tier=<key>); signup names the picked plan + price,
//     remembers the pick on the device, and the Plans page arms that
//     plan's subscribe button with a plain explanation — so a buyer
//     who chose on the homepage is one tap from checkout instead of
//     starting over.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("landing staffing section is honest about the temp agency's status", () => {
  const landing = read("components/LandingContent.js");
  for (const needle of [
    "🚧 <strong>Under construction:</strong> the temp agency is still being",
    "It is not part of the December 15 launch",
    "available at a later date",
    "being built on this same app, from client requests",
  ]) {
    assert.ok(landing.includes(needle), `landing keeps: ${needle}`);
  }
  assert.ok(
    !landing.includes("runs on this same app") && !landing.includes("runs on\n            this same app"),
    "the temp service is never sold as already running"
  );
});

test("pricing buttons carry the chosen tier to signup", () => {
  const landing = read("components/LandingContent.js");
  assert.ok(landing.includes("href={`/signup?tier=${key}`}"), "pricing link carries the tier");
});

test("signup names and remembers the picked tier", () => {
  const signup = read("app/signup/page.js");
  for (const needle of [
    'new URLSearchParams(window.location.search).get("tier")',
    'localStorage.setItem("workteams:chosen-tier", key)',
    "You picked <strong>{TIERS[pickedTier].name}</strong>",
    "the Plans page will",
  ]) {
    assert.ok(signup.includes(needle), `signup keeps: ${needle}`);
  }
});

test("plans page arms the remembered pick and clears it once subscribed", () => {
  const page = read("app/app/[companyId]/plans/page.js");
  for (const needle of [
    'localStorage.getItem("workteams:chosen-tier")',
    'localStorage.removeItem("workteams:chosen-tier")',
    "setConfirmKey(key)",
    "You picked <strong>{TIERS[homePick].name}</strong> on the home page",
  ]) {
    assert.ok(page.includes(needle), `plans keeps: ${needle}`);
  }
});
