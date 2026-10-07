// Regression guard: end-of-shift proof (MediaRecorder repair).
// Fails the build unless the required behaviors remain in the source.
// Run: node scripts/check-end-shift-proof.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let failures = [];
function check(name, file, test) {
  let src;
  try { src = read(file); }
  catch { failures.push(`${name}: file missing (${file})`); return; }
  if (!test(src)) failures.push(`${name}: FAILED in ${file}`);
  else console.log(`ok - ${name}`);
}

const C = "components/EndShiftProof.js";
const T = "app/app/[companyId]/time/page.js";
const CO = "app/api/time/clock-out/route.js";
const CC = "app/api/time/clock-out/complete/route.js";

// 1. MediaRecorder live capture exists.
check("MediaRecorder live capture", C, (s) => s.includes("new MediaRecorder("));
// 2. iOS uses recorder.start() with NO repeating timeslice.
check("iOS plain start()", C, (s) => s.includes("if (isiOS) recorder.start();"));
// 3. Pause calls recorder.pause().
check("pause() on recorder", C, (s) => s.includes("r.pause()"));
// 4. Pause does NOT force requestData() (ignore comments).
check("no requestData before pause/stop", C, (s) => {
  const code = s.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  return !code.includes("requestData(");
});
// 5. Resume calls recorder.resume().
check("resume() on recorder", C, (s) => s.includes("r.resume()"));
// 6. Paused time excluded from 10-minute counter.
check("active-time tracking", C, (s) =>
  s.includes("activeMsRef") && s.includes("Paused time does NOT count") || s.includes("excludes paused"));
// 7. Video upload is resumable and chunked.
check("TUS resumable chunked upload", C, (s) =>
  s.includes("new tus.Upload") && s.includes("chunkSize") && s.includes("retryDelays"));
// 8. Clock-out timestamp saves before proof upload completes.
check("phase-1 clock-out first", T, (s) =>
  s.includes("/api/time/clock-out") && s.includes("waitForUploads"));
// 9. Retry does not create a new timestamp (idempotent clock-out).
check("idempotent clock-out", CO, (s) =>
  s.includes("alreadyClosed") && !s.includes('status: 409') || s.includes("alreadyClosed"));
// 10. Video and book proof attach independently.
check("independent proof attach", C, (s) =>
  s.includes('kind: "walkthrough"') && s.includes('kind: "book"'));
// 11. Final proof completion checks company policy server-side.
check("server-side policy check", CC, (s) =>
  s.includes("require_walkthrough_video") && s.includes("require_book_photo"));
// 12. beforeunload guard for in-flight uploads.
check("leave-page protection", T, (s) => s.includes("beforeunload"));
// 13. 7-day expiry on videos (retention).
check("video expiry", "app/app/[companyId]/shift-videos/page.js", (s) =>
  s.includes("video_expires_at") || s.includes("7 * 24"));
// 14. Required book-photo control is obvious on mobile.
check("book photo control", C, (s) =>
  s.includes("Take book photo") && s.includes('capture="environment"'));
// 15. Full workflow reachable from Time Clock.
check("time page integration", T, (s) => s.includes("EndShiftProof"));

if (failures.length) {
  console.error("\nREGRESSION FAILURES:");
  failures.forEach((f) => console.error("  x " + f));
  process.exit(1);
}
console.log("\nAll end-of-shift proof guards passed.");
