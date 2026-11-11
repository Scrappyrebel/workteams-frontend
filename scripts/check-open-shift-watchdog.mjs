// Behavioral drill for the open-shift watchdog (Lockdown Standard item 6).
//
// The Nov 8, 2026 failure was not just a lost clock-out — it was a lost
// clock-out that NOTHING noticed for 56.16 hours, because the old overtime
// alert fired once inside a narrow window and then went silent forever.
// This drill rehearses the watchdog's decisions against the clock:
//   - alert stages keep REPEATING (stage numbers grow; never fire-once)
//   - unlinked entries (no schedule) are watched too, staged on age
//   - the auto-close cap is the EARLIER of 16 h after clock-in and 12 h
//     past the scheduled end, and the plan flips to autoclose AT the cap
//   - the auto-close note carries the flag that keeps a capped entry from
//     masquerading as an employee clock-out
//   - per-stage dedupe keys differ per stage (that is what makes the
//     repetition exactly-once-per-stage instead of spam or silence)
// and pins the sweep's wiring: separate cron route, stage dedupe, the
// still-open guard on the closing update, and the vercel.json schedule.
// Removing the repetition, the cap, or the flag fails the build.
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  stageForOverdueMinutes,
  stageForOpenMinutes,
  capAtMs,
  watchdogPlan,
  stageDedupeKey,
  autoCloseDedupeKey,
  autoCloseNote,
  AUTO_CLOSE_FLAG,
} from "../lib/open-shift-watchdog.mjs";

const MIN = 60000;
const H = 60 * MIN;
const read = (p) => fs.readFileSync(p, "utf8");

// --- Linked stages: quiet before 30 min, then repeat forever -------------
assert.equal(stageForOverdueMinutes(0), 0, "no alert at scheduled end");
assert.equal(stageForOverdueMinutes(29), 0, "no alert at +29 min");
assert.equal(stageForOverdueMinutes(30), 1, "first alert at +30 min");
assert.equal(stageForOverdueMinutes(119), 1, "stage 1 holds until +2 h");
assert.equal(stageForOverdueMinutes(120), 2, "second alert at +2 h");
assert.equal(stageForOverdueMinutes(359), 2, "stage 2 holds until +6 h");
assert.equal(stageForOverdueMinutes(360), 3, "third alert at +6 h");
assert.equal(stageForOverdueMinutes(600), 4, "alerts keep repeating at +10 h");
// A full sweep of the first 15 hours past end must hit many DISTINCT
// stages — the old watchdog's fire-once behavior scores exactly 1.
const stages = new Set();
for (let m = 0; m <= 15 * 60; m += 5) stages.add(stageForOverdueMinutes(m));
assert.ok(stages.size >= 5, `escalation must repeat (saw ${stages.size} stages in 15 h)`);

// --- Unlinked entries: staged on age open, never invisible ---------------
assert.equal(stageForOpenMinutes(60), 0, "unlinked: quiet in the first hours");
assert.equal(stageForOpenMinutes(239), 0, "unlinked: quiet before 4 h open");
assert.equal(stageForOpenMinutes(240), 1, "unlinked: first alert at 4 h open");
assert.equal(stageForOpenMinutes(480), 2, "unlinked: repeats every 4 h");

// --- The cap: earlier of clock-in+16 h and scheduled-end+12 h ------------
// Short shift 9:00–10:30, clock-in 9:00 → end+12 h (13.5 h) beats
// clock-in+16 h, so the scheduled-end cap wins.
const inShort = Date.UTC(2026, 10, 8, 14, 0); // 9:00 AM CST
const endShort = Date.UTC(2026, 10, 8, 16, 30); // 10:30 AM CST
assert.equal(capAtMs({ clockInMs: inShort, scheduledEndMs: endShort }), endShort + 12 * H,
  "short shift: cap is 12 h past the scheduled end");
// Long shift 6 AM–6 PM, clock-in 6 AM → end+12 h (6 AM next day) beats
// clock-in+16 h (10 PM) — no: end+12h = +24 h, clock-in+16 h = +16 h wins.
const inLong = Date.UTC(2026, 10, 8, 12, 0);
const endLong = Date.UTC(2026, 10, 9, 0, 0);
assert.equal(capAtMs({ clockInMs: inLong, scheduledEndMs: endLong }), inLong + 16 * H,
  "long shift: 16 h after clock-in is the earlier cap");
// Clocked in early for a short shift: in 9:00, end 10:30 next-day edge —
// end+12 h earlier than in+16 h when the end is < 4 h after clock-in+12h.
const endEarly = inShort + 3 * H; // ends 3 h after clock-in
assert.equal(capAtMs({ clockInMs: inShort, scheduledEndMs: endEarly }), endEarly + 12 * H,
  "end+12 h wins when it is earlier");
assert.equal(capAtMs({ clockInMs: inShort, scheduledEndMs: null }), inShort + 16 * H,
  "unlinked: cap is 16 h after clock-in");

// --- The plan flips at the cap, and Kristin's shift would have closed ---
const kristinIn = Date.UTC(2026, 10, 8, 15, 6); // 9:06 AM CST, Nov 8
const kristinEnd = Date.UTC(2026, 10, 8, 21, 30); // 3:30 PM CST scheduled end
const justBefore = watchdogPlan({ clockInMs: kristinIn, scheduledEndMs: kristinEnd, nowMs: kristinIn + 16 * H - MIN });
assert.equal(justBefore.state, "alert", "still alerting (loudly) just before the cap");
assert.ok(justBefore.stage >= 3, "by the cap the alert has repeated several times");
const atCap = watchdogPlan({ clockInMs: kristinIn, scheduledEndMs: kristinEnd, nowMs: kristinIn + 16 * H });
assert.equal(atCap.state, "autoclose", "plan auto-closes AT the cap");
assert.equal(atCap.capAtMs, kristinIn + 16 * H, "closes at the cap time, not 'now'");
const at56h = watchdogPlan({ clockInMs: kristinIn, scheduledEndMs: kristinEnd, nowMs: kristinIn + 56 * H });
assert.equal(at56h.state, "autoclose", "a 56-hour-old open shift is an auto-close, never silence");

// --- Dedupe keys: one per stage, all distinct, autoclosed separate -------
const keys = new Set([1, 2, 3, 4, 5].map((s) => stageDedupeKey("entry-1", s)));
assert.equal(keys.size, 5, "every stage gets its own dedupe key (fires once per stage)");
assert.notEqual(autoCloseDedupeKey("entry-1"), stageDedupeKey("entry-1", 1),
  "auto-close alert has its own key");

// --- The flag note ---------------------------------------------------------
const note = autoCloseNote(null, { capAt: new Date(kristinIn + 16 * H), clockIn: new Date(kristinIn) });
assert.ok(note.startsWith(AUTO_CLOSE_FLAG), "note leads with the AUTO-CLOSED flag");
assert.ok(note.includes("NOT an employee clock-out"), "note says plainly it is not a clock-out");
assert.ok(note.includes("before payroll"), "note demands review before payroll");
assert.ok(note.includes("16.00 hours"), "note records the capped hours");
const appended = autoCloseNote("Manager note here", { capAt: new Date(kristinIn + 16 * H), clockIn: new Date(kristinIn) });
assert.ok(appended.includes("Manager note here") && appended.includes(AUTO_CLOSE_FLAG),
  "existing notes are preserved, flag appended");

// --- Wiring pins ------------------------------------------------------------
const route = read("app/api/cron/open-shift-watchdog/route.js");
assert.ok(route.includes("open-shift-watchdog.mjs"), "sweep uses the shared watchdog logic");
assert.ok(route.includes("stageDedupeKey(entry.id, plan.stage)"), "alerts dedupe per stage (repeat, not fire-once)");
assert.ok(route.includes("autoCloseNote("), "auto-close writes the flag note");
assert.ok(route.includes('.is("clock_out", null)'), "closing update only lands while the entry is still open");
assert.ok(route.includes("plan.capAtMs"), "entry closes at the cap time");
assert.ok(route.includes("CRON_SECRET"), "sweep keeps the cron secret check");
assert.ok(route.includes("sendOwnerAlert"), "alerts reuse the owner alert transport");
assert.ok(route.includes("sendPush"), "employee reminder reuses the push transport");
const vercel = JSON.parse(read("vercel.json"));
assert.ok((vercel.crons || []).some((c) => c.path === "/api/cron/open-shift-watchdog"),
  "vercel.json schedules the watchdog sweep");
const attendance = read("app/api/cron/attendance/route.js");
assert.ok(attendance.includes("overtime:${shift.id}"), "the existing overtime alert is untouched");
const pkg = JSON.parse(read("package.json"));
assert.ok(pkg.scripts.prebuild.includes("check-open-shift-watchdog.mjs"),
  "prebuild runs the watchdog drill");

console.log("Open-shift watchdog drill passed: alerts repeat on stages, unlinked entries are watched, the cap auto-closes with the flag, and the sweep is wired.");
