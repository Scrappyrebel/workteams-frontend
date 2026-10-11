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
  s.includes('await api("/api/time/clock-out"') && s.includes('setProofEntry(open)') &&
  !s.includes('await proofRef.current.waitForUploads()'));
check("recording retained after clock-out", T, (s) =>
  s.includes('(open || proofEntry) &&') && s.includes("hasUnsavedRecording") &&
  s.includes("onProofUploaded={finalizeProofUpload}"));
check("multipart 10-minute upload", C, (s) =>
  s.includes("VIDEO_PART_BYTES = 40 * 1024 * 1024") &&
  s.includes("workteams-walkthrough-parts") && s.includes("uploadTusFile(") &&
  !s.includes('Try a shorter walkthrough'));
check("failed uploads preserve retry", C, (s) =>
  s.includes("window.__endShiftVideoBlob = blob") &&
  s.includes("hasUnsavedRecording()") &&
  s.includes("setUploadFailed(true)"));
check("multipart playback protected", "components/PrivateWalkthroughPlayer.js", (s) =>
  s.includes('info?.kind !== "workteams-walkthrough-parts"') &&
  s.includes('storage.from("shift-videos").download(part)') &&
  s.includes('new Blob(chunks'));
check("multipart deletion removes all parts", "app/app/[companyId]/shift-videos/page.js", (s) =>
  s.includes("paths = [...manifest.parts, video.video_url]"));
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

// Verified proof receipts: an uploaded-looking progress bar isn't proof.
check("verified video receipt", C, (src) =>
  src.includes("verifiedObject") && src.includes("verifiedRow") &&
  src.includes("Walkthrough uploaded and verified"));
check("clock-out isn't video receipt", T, (src) =>
  src.includes("No walkthrough video was saved for this shift") &&
  src.includes("Walkthrough video uploaded and verified"));
check("clock-out keeps proof pending", T, (src) =>
  src.includes("if (!awaitingProof)") &&
  src.includes("clockedOutEntryIdRef.current !== entryId"));
check("video listing errors visible", "app/app/[companyId]/shift-videos/page.js", (src) =>
  src.includes("Refresh videos") && src.includes("setListError") &&
  src.includes("if (plain.error) throw plain.error"));

// No-book path: the employee can check a box instead of taking a fake photo.
// Persist a manager-visible note, validate it on the server, and keep
// timestamp saving independent from optional proof upload completion.
check("no-book checkbox visible", C, (src) =>
  src.includes('type="checkbox"') &&
  src.includes('No communication book at this location') &&
  src.includes('checked={noBookAtLocation}'));
check("no-book photo exemption", C, (src) =>
  src.includes('noBookAtLocation ? (') &&
  src.includes('onChange={(e) => handleNoBookChange(e.target.checked)}') &&
  src.includes('noBookSelectedRef.current'));
check("no-book manager report and retry", C, (src) =>
  src.includes('from("comm_book").insert') &&
  src.includes('message: NO_COMMUNICATION_BOOK_NOTE') &&
  src.includes('Retry no-book report') &&
  src.includes('noBookSavedRef.current = true'));
check("no-book persisted policy exception", CC, (src) =>
  src.includes('NO_COMMUNICATION_BOOK_NOTE') &&
  src.includes('.eq("member_id", member.id)') &&
  src.includes('.eq("time_entry_id", entryId)') &&
  src.includes('.is("photo_url", null)') &&
  src.includes('if (!noBook)'));
check("clock-out never waits for book report", T, (src) =>
  src.includes('await api("/api/time/clock-out"') &&
  !src.includes('await proofRef.current.waitForUploads()') &&
  src.includes('setProofEntry(open)'));

const SV = "app/app/[companyId]/shift-videos/page.js";
const CB = "app/app/[companyId]/comm-book/page.js";
const EX = "lib/evidence-export.js";
check("private evidence export reconstructs large video", EX, src =>
  src.includes('kind !== "workteams-walkthrough-parts"') &&
  src.includes('new Blob(chunks') &&
  src.includes('.storage.from(bucket).download('));
check("owner-only video share and saved copy", SV, src =>
  src.includes('if (!isManager || exportingId) return') &&
  src.includes('↗ Share') &&
  src.includes('↓ Save copy') &&
  src.includes('preparedShare'));
check("owner-only communication book photo share", CB, src =>
  src.includes('canExport={isManager}') &&
  src.includes('Share book photo') &&
  src.includes('Save copy') &&
  src.includes('Share prepared photo'));
check("browser native file share and download fallback", EX, src =>
  src.includes('navigator.share({ files: [file]') &&
  src.includes('navigator.canShare({ files: [file]') &&
  src.includes('link.download = filename') &&
  !src.includes('getPublicUrl('));

check("installed WorkTeams never keeps an old recorder script", "public/sw.js", src =>
  src.includes("workteams-v3-fresh-js-20261011") &&
  src.includes('fetch(request, { cache: "no-store" })') &&
  !src.includes("if (hit) return hit"));
// Automatic ten-minute recording stop. The recorder must stop itself, not
// merely display a countdown and wait for a manual tap.
check("one-shot automatic stop at ten active minutes", C, src =>
  src.includes("const MAX_ACTIVE_VIDEO_MS = MAX_VIDEO_SECONDS * 1000") &&
  src.includes("setTimeout(() => finishRecording(true), remaining)") &&
  src.includes("if (active >= MAX_ACTIVE_VIDEO_MS) finishRecording(true)"));
check("pause excludes time from automatic stop", C, src =>
  src.includes("clearTimeout(deadlineTimerRef.current)") &&
  src.includes("activeMsRef.current += pauseAt - segStartRef.current") &&
  src.includes("function resumeRecording()") &&
  src.includes("armAutoStopDeadline()"));
check("automatic stop immediately triggers real upload", C, src =>
  src.includes("recorder.onstop = () => {") &&
  src.includes("window.__endShiftVideoBlob = blob") &&
  src.includes("uploadVideo(blob)") &&
  src.includes('setRecState("uploading")') &&
  src.includes("setRecState(\"finishing\")"));
check("automatic stop avoids duplicate stop or discarded video", C, src =>
  src.includes("stopRequestedRef.current = true") &&
  src.includes("if (!r || ![\"recording\", \"paused\"].includes(r.state) || stopRequestedRef.current) return") &&
  src.includes('["recording", "paused", "finishing", "recorded", "uploading"]') &&
  src.includes("setUploadFailed(true)") &&
  src.includes("retryVideoUpload()"));
check("ten minute auto-upload explained on recorder", C, src =>
  src.includes("Automatically stops and starts uploading at 10 minutes") &&
  src.includes("stopping recording and starting upload automatically") &&
  src.includes("Paused time does not count"));

if (failures.length) {
  console.error("\nREGRESSION FAILURES:");
  failures.forEach((f) => console.error("  x " + f));
  process.exit(1);
}
console.log("\nAll end-of-shift proof guards passed.");
