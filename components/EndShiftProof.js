"use client";

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import * as tus from "tus-js-client";
import { supabase } from "../lib/supabase";
import { NO_COMMUNICATION_BOOK_NOTE } from "../lib/no-book-proof";

const MAX_VIDEO_SECONDS = 10 * 60;
// Supabase's free tier limits EACH stored object to 50 MB, not the
// total recording duration. Split large files without changing 10-minute rule.
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const VIDEO_PART_BYTES = 40 * 1024 * 1024;
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function extForMime(mime) {
  if (!mime) return "mp4";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return "mp4";
}

// EndShiftProof: one integrated end-of-shift proof block.
// - Live in-app walkthrough recording via MediaRecorder (no file picker).
// - Book photo via camera capture.
// - Video and photo upload INDEPENDENTLY via resumable TUS / storage upload.
// - Proof rows link to the time entry (shift_videos.time_entry_id,
//   comm_book.time_entry_id).
// Exposes via ref: hasPendingUploads(), waitForUploads().
const EndShiftProof = forwardRef(function EndShiftProof(
  { companyId, memberId, entryId, locationId, locationName, enableVideo = true, enableBook = true, onProofUploaded },
  ref
) {
  const isiOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // --- recording state ---
  const [recState, setRecState] = useState("idle"); // idle|recording|paused|recorded|uploading|uploaded
  const [recSeconds, setRecSeconds] = useState(0); // active recorded time (excludes pauses)
  const [videoError, setVideoError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [videoSaved, setVideoSaved] = useState(false);

  // --- book photo state ---
  const [photoFile, setPhotoFile] = useState(null);
  const [photoState, setPhotoState] = useState("idle"); // idle|ready|uploading|uploaded
  const [photoError, setPhotoError] = useState("");
  const [photoProgress, setPhotoProgress] = useState(0);
  const [noBookAtLocation, setNoBookAtLocation] = useState(false);
  const [noBookStatus, setNoBookStatus] = useState("idle"); // idle|saving|saved|error
  const [noBookError, setNoBookError] = useState("");

  const [done, setDone] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeRef = useRef("");
  const segStartRef = useRef(0); // when the current active segment started
  const activeMsRef = useRef(0); // accumulated active ms (excludes paused time)
  const timerRef = useRef(null);
  const previewRef = useRef(null);
  const photoRef = useRef(null);
  const tusUploadRef = useRef(null);
  const videoPathRef = useRef("");
  const videoUploadPromiseRef = useRef(null);
  const photoUploadPromiseRef = useRef(null);
  const videoSavedRef = useRef(false);
  const photoSavedRef = useRef(false);
  const noBookSelectedRef = useRef(false);
  const noBookSavedRef = useRef(false);
  const noBookSavePromiseRef = useRef(null);
  const waitersRef = useRef([]); // resolve fns waiting for uploads

  // Live timer: active recorded seconds only (paused time excluded)
  useEffect(() => {
    if (recState === "recording") {
      timerRef.current = setInterval(() => {
        const active = activeMsRef.current + (Date.now() - segStartRef.current);
        const sec = Math.floor(active / 1000);
        setRecSeconds(sec);
        if (sec >= MAX_VIDEO_SECONDS) finishRecording();
      }, 250);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recState]);

  // Stop camera tracks on unmount
  useEffect(() => {
    return () => {
      try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    };
  }, []);

  // Attach the live camera stream to the preview element whenever it mounts.
  // (The preview only renders once recording starts, so this must happen in an
  // effect — attaching it in startRecording runs before the element exists.)
  useEffect(() => {
    const el = previewRef.current;
    const stream = streamRef.current;
    if ((recState === "recording" || recState === "paused") && el && stream) {
      el.muted = true; // property, not just attribute — required for autoplay
      el.setAttribute("muted", "");
      el.setAttribute("playsinline", "");
      el.srcObject = stream;
      const tryPlay = () => el.play().catch(() => {});
      // iOS sometimes needs a beat before the stream is renderable
      tryPlay();
      const t = setTimeout(tryPlay, 500);
      // Diagnostic: if the video has no dimensions after metadata loads,
      // the stream has no usable video track.
      const onMeta = () => {
        if (el.videoWidth === 0) {
          setVideoError("Camera opened but no picture is coming through. Try closing other camera apps and retry.");
        }
      };
      el.addEventListener("loadedmetadata", onMeta);
      return () => { clearTimeout(t); el.removeEventListener("loadedmetadata", onMeta); };
    }
  }, [recState]);

  function notifyWaiters() {
    if (!hasPendingUploads()) {
      const ws = waitersRef.current;
      waitersRef.current = [];
      ws.forEach((r) => r());
    }
  }

  function hasPendingUploads() {
    // A FAILED upload needs an explicit Retry; never wait forever on it.
    const videoPending = enableVideo &&
      ["recording", "paused", "recorded", "uploading"].includes(recState) &&
      !videoSavedRef.current;
    const photoPending = enableBook && !!photoFile && !noBookSelectedRef.current && !photoSavedRef.current;
    // A no-book report is a real, persisted alternative to a photo. It is
    // never required to finish BEFORE the employee can save clock-out time.
    const noBookPending = enableBook && noBookSelectedRef.current && !noBookSavedRef.current;
    return videoPending || photoPending || noBookPending;
  }

  useImperativeHandle(ref, () => ({
    hasPendingUploads,
    hasVerifiedVideo() {
      return videoSavedRef.current;
    },
    hasStartedVideo() {
      return recState !== "idle" || !!window.__endShiftVideoBlob;
    },
    hasUnsavedRecording() {
      // A failed upload should not block clock-out, but leaving this screen
      // can lose its unsaved camera Blob; keep it available for Retry.
      return !!window.__endShiftVideoBlob && !videoSavedRef.current;
    },
    waitForUploads() {
      if (!hasPendingUploads()) return Promise.resolve();
      return new Promise((resolve) => waitersRef.current.push(resolve));
    },
  }));

  async function startRecording() {
    setVideoError("");
    setUploadFailed(false);
    setVideoSaved(false);
    videoSavedRef.current = false;
    videoPathRef.current = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 854 },
          height: { ideal: 480 },
        },
        audio: true,
      });
      streamRef.current = stream;

      // Verify the stream actually has a live video track before going further.
      const videoTracks = stream.getVideoTracks();
      if (!videoTracks.length || videoTracks[0].readyState !== "live") {
        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
        throw new Error("Camera opened but no video is coming through. Check that no other app is using the camera and try again.");
      }

      // Prefer interoperable H.264 MP4 on every platform when the recorder
      // supports it. Older Android recordings may still be WebM; playback
      // must retain a native-open fallback for those existing files.
      const candidates = [
        'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
        'video/mp4;codecs="avc1.42E01E"',
        "video/mp4",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      const mimeType = candidates.find((t) => {
        try { return window.MediaRecorder.isTypeSupported(t); } catch { return false; }
      });
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 320000,
        audioBitsPerSecond: 24000,
      });
      recorderRef.current = recorder;
      // Store the format actually selected by MediaRecorder, not only the
      // requested one; incorrect content types can yield black playback.
      mimeRef.current = recorder.mimeType || mimeType || "";
      chunksRef.current = [];
      activeMsRef.current = 0;
      setRecSeconds(0);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const actualMime = recorder.mimeType || chunksRef.current[0]?.type || mimeRef.current || "video/webm";
        mimeRef.current = actualMime;
        const blob = new Blob(chunksRef.current, { type: actualMime });
        chunksRef.current = [];
        try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
        if (previewRef.current) previewRef.current.srcObject = null;
        window.__endShiftVideoBlob = blob;
        if (blob.size > MAX_VIDEO_BYTES) {
          setVideoError("Recording exceeds the 500 MB device upload safety limit. Your recording remains on this page; please contact a manager.");
          setRecState("recorded");
          setUploadFailed(true);
          return;
        } // kept for upload; never cleared on failure
        setRecState("recorded");
        // Auto-start upload right away so the crew doesn't wait
        uploadVideo(blob);
      };
      recorder.onerror = () => {
        setVideoError("The camera ran into a problem. Try again.");
        setRecState("idle");
      };

      // CRITICAL iOS RULE: no repeating timeslice on iPhone — plain start().
      if (isiOS) recorder.start();
      else recorder.start(3000);

      segStartRef.current = Date.now();
      setRecState("recording");
    } catch (e) {
      setVideoError(
        e?.name === "NotAllowedError"
          ? "Camera access was blocked. Allow camera access and try again."
          : "Could not start the camera. Try again."
      );
    }
  }

  function pauseRecording() {
    const r = recorderRef.current;
    if (!r || r.state !== "recording") return;
    const pauseAt = Date.now();
    try { r.pause(); } catch (e) {
      setVideoError(e instanceof Error ? e.message : "The recorder could not pause.");
      return;
    }
    // Accumulate time only when pause succeeds.
    activeMsRef.current += pauseAt - segStartRef.current;
    setRecState("paused");
  }

  function resumeRecording() {
    const r = recorderRef.current;
    if (!r || r.state !== "paused") return;
    // Do NOT call requestData() before resume — especially on iPhone.
    try { r.resume(); } catch (e) {
      setVideoError(e instanceof Error ? e.message : "The recorder could not resume.");
      return;
    }
    segStartRef.current = Date.now();
    setRecState("recording");
  }

  function finishRecording() {
    const r = recorderRef.current;
    if (!r || !["recording", "paused"].includes(r.state)) return;
    if (r.state === "recording") activeMsRef.current += Date.now() - segStartRef.current;
    // Do NOT call requestData() before stop — especially on iPhone.
    try { r.stop(); } catch (e) {
      setVideoError(e instanceof Error ? e.message : "Could not finish the recording.");
    }
  }

  function discardRecording() {
    window.__endShiftVideoBlob = null;
    videoPathRef.current = "";
    videoSavedRef.current = false;
    setRecState("idle");
    setRecSeconds(0);
    setUploadProgress(0);
    setUploadFailed(false);
    setVideoError("");
  }

  async function uploadTusFile(file, path, session, onPercent) {
    // Per-object TUS resumable transfer; each part is < 50 MB.
    const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;
    await new Promise(async (resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint,
        chunkSize: TUS_CHUNK_BYTES,
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: "shift-videos",
          objectName: path,
          contentType: file.type || "application/octet-stream",
        },
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        },
        onError: reject,
        onProgress: (up, total) => onPercent(total ? up / total : 0),
        onSuccess: resolve,
      });
      tusUploadRef.current = upload;
      try {
        const previous = await upload.findPreviousUploads();
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      } catch (err) {
        console.warn("Upload resume lookup unavailable", err);
      }
      upload.start();
    });
  }

  async function uploadVideo(blob) {
    // Guard against double clicks causing duplicate rows or uploads.
    if (videoUploadPromiseRef.current || videoSavedRef.current) return;
    const b = blob || window.__endShiftVideoBlob;
    if (!b) {
      setVideoError("No saved recording is available on this page.");
      return;
    }
    const task = (async () => {
      setRecState("uploading");
      setUploadProgress(0);
      setUploadFailed(false);
      setVideoError("");
      try {
        const sb = supabase();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) throw new Error("You're signed out. Sign back in and retry the upload.");
        if (b.size > MAX_VIDEO_BYTES) throw new Error("This recording exceeds the device upload safety limit. Ask your manager for help.");

        const ext = extForMime(mimeRef.current || b.type);
        const multipart = b.size > VIDEO_PART_BYTES;
        if (!videoPathRef.current) {
          videoPathRef.current = `${companyId}/${entryId}/walkthrough-${Date.now()}.${ext}${multipart ? ".parts.json" : ""}`;
        }
        const path = videoPathRef.current;

        if (multipart) {
          const base = path.slice(0, -".parts.json".length);
          const count = Math.ceil(b.size / VIDEO_PART_BYTES);
          const parts = [];
          for (let index = 0; index < count; index++) {
            const start = index * VIDEO_PART_BYTES;
            const end = Math.min(b.size, start + VIDEO_PART_BYTES);
            const objectPath = `${base}.part-${String(index).padStart(3, "0")}.bin`;
            const piece = b.slice(start, end, "application/octet-stream");
            // Safe retry after the part has completed but a later step failed.
            const { data: existing } = await sb.storage.from("shift-videos").info(objectPath);
            if (Number(existing?.size) !== piece.size) {
              await uploadTusFile(piece, objectPath, session, (p) =>
                setUploadProgress(Math.min(0.98, ((start + piece.size * p) / b.size) * 0.98))
              );
            }
            parts.push(objectPath);
            setUploadProgress(Math.min(0.98, (end / b.size) * 0.98));
          }
          const manifest = JSON.stringify({
            kind: "workteams-walkthrough-parts", version: 1,
            mimeType: (mimeRef.current || b.type || "video/mp4").toLowerCase().includes("mp4") ? "video/mp4" : "video/webm",
            bytes: b.size, parts,
          });
          const { error: manifestError } = await sb.storage.from("shift-videos").upload(
            path, new Blob([manifest], { type: "application/json" }),
            { contentType: "application/json", upsert: false }
          );
          if (manifestError) {
            const { data: oldManifest, error: readError } = await sb.storage.from("shift-videos").download(path);
            if (readError || !oldManifest || (await oldManifest.text()) !== manifest) {
              throw new Error("Couldn't finalize walkthrough upload: " + manifestError.message);
            }
          }
        } else {
          const { data: existing } = await sb.storage.from("shift-videos").info(path);
          if (Number(existing?.size) !== b.size) {
            await uploadTusFile(b, path, session, setUploadProgress);
          }
        }

        const { data: existingRow, error: existingError } = await sb.from("shift_videos")
          .select("id").eq("company_id", companyId).eq("time_entry_id", entryId)
          .eq("video_url", path).limit(1).maybeSingle();
        if (existingError) throw new Error("Could not verify the video record: " + existingError.message);
        if (!existingRow) {
          const { error: dbErr } = await sb.from("shift_videos").insert({
            company_id: companyId,
            member_id: memberId,
            location_id: locationId || null,
            time_entry_id: entryId,
            video_url: path,
            duration_seconds: Math.min(MAX_VIDEO_SECONDS, Math.round(activeMsRef.current / 1000)),
            file_size_bytes: b.size,
          });
          if (dbErr) throw new Error("The video uploaded but couldn't be listed: " + dbErr.message);
        }

        // An upload progress bar reaching 100% is NOT proof that the recording
        // is saved. Confirm both the private storage object and the linked
        // database row before showing the green Uploaded message.
        const [{ data: verifiedObject, error: objectError }, { data: verifiedRow, error: rowError }] =
          await Promise.all([
            sb.storage.from("shift-videos").info(path),
            sb.from("shift_videos").select("id,video_url,time_entry_id,file_size_bytes")
              .eq("company_id", companyId)
              .eq("member_id", memberId)
              .eq("time_entry_id", entryId)
              .eq("video_url", path)
              .limit(1).maybeSingle(),
          ]);
        if (objectError || !verifiedObject) {
          throw new Error("The video upload could not be verified in storage. Please tap Retry.");
        }
        if (rowError || !verifiedRow || Number(verifiedRow.file_size_bytes) !== b.size) {
          throw new Error("The video is in storage, but it is missing from your shift's saved videos. Tap Retry.");
        }

        try {
          await fetch("/api/time/clock-out/proof", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ companyId, entryId, kind: "walkthrough", storagePath: path }),
          });
        } catch (err) {
          console.warn("Proof attachment retry may be needed", err);
        }

        window.__endShiftVideoBlob = null;
        videoSavedRef.current = true;
        setVideoSaved(true);
        setRecState("uploaded");
        setUploadProgress(1);
        setDone(true);
        onProofUploaded?.(entryId);
      } catch (err) {
        // A local video remains available for Retry as long as this page stays open.
        setUploadFailed(true);
        setRecState("recorded");
        setVideoError(err instanceof Error ? err.message : "Upload failed. Tap Retry.");
      } finally {
        notifyWaiters();
      }
    })();
    videoUploadPromiseRef.current = task;
    try { await task; } finally {
      videoUploadPromiseRef.current = null;
    }
  }

  function retryVideoUpload() {
    const b = window.__endShiftVideoBlob;
    if (!b) {
      setVideoError("The recording is no longer available. Please re-record.");
      setRecState("idle");
      return;
    }
    uploadVideo(b);
  }

  async function saveNoBookReport() {
    if (noBookSavedRef.current) return;
    if (noBookSavePromiseRef.current) return noBookSavePromiseRef.current;
    const task = (async () => {
      setNoBookStatus("saving");
      setNoBookError("");
      try {
        const sb = supabase();
        // Reuse a report for the same authenticated member + time entry when
        // Retry is tapped. Never create duplicate manager notes.
        const query = () => sb.from("comm_book").select("id")
          .eq("company_id", companyId)
          .eq("member_id", memberId)
          .eq("time_entry_id", entryId)
          .eq("category", "note")
          .eq("message", NO_COMMUNICATION_BOOK_NOTE)
          .is("photo_url", null).limit(1).maybeSingle();
        const { data: existing, error: findError } = await query();
        if (findError) throw new Error("Could not check the no-book report: " + findError.message);
        if (!existing) {
          const { error: insertError } = await sb.from("comm_book").insert({
            company_id: companyId,
            member_id: memberId,
            time_entry_id: entryId,
            location_id: locationId || null,
            category: "note",
            message: NO_COMMUNICATION_BOOK_NOTE,
            photo_url: null,
          });
          if (insertError) throw new Error("Could not save the no-book report: " + insertError.message);
        }
        // Read-back is required; do not pretend this is saved merely because
        // the checkbox was checked.
        const { data: saved, error: checkError } = await query();
        if (checkError || !saved) throw new Error("No-book report could not be verified. Tap Retry report.");
        noBookSavedRef.current = true;
        setNoBookStatus("saved");
        setDone(true);
        onProofUploaded?.(entryId);
      } catch (err) {
        setNoBookStatus("error");
        setNoBookError(err instanceof Error ? err.message : "Could not report no book. Tap Retry report.");
      } finally {
        notifyWaiters();
      }
    })();
    noBookSavePromiseRef.current = task;
    try { await task; } finally { noBookSavePromiseRef.current = null; }
  }

  function handleNoBookChange(checked) {
    if (!checked) {
      if (noBookSavedRef.current || noBookSavePromiseRef.current) return;
      noBookSelectedRef.current = false;
      setNoBookAtLocation(false);
      setNoBookStatus("idle");
      setNoBookError("");
      return;
    }
    if (photoState === "uploading" || photoSavedRef.current) return;
    noBookSelectedRef.current = true;
    setNoBookAtLocation(true);
    setPhotoFile(null);
    setPhotoState("idle");
    setPhotoError("");
    void saveNoBookReport();
  }

  function handlePhotoFile(f) {
    if (noBookSelectedRef.current) return;
    setPhotoError("");
    photoSavedRef.current = false;
    if (!f) return;
    if (!f.type.startsWith("image/")) { setPhotoError("Please choose a photo."); return; }
    setPhotoFile(f);
    setPhotoState("ready");
    // Auto-upload so the crew doesn't wait
    uploadPhoto(f);
  }

  async function uploadPhoto(f) {
    if (noBookSelectedRef.current) return;
    const file = f || photoFile;
    if (!file) return;
    setPhotoState("uploading");
    setPhotoProgress(0);
    setPhotoError("");
    try {
      const sb = supabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error("You're signed out. Sign back in and retry.");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${companyId}/${entryId}/book-${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from("inspection-photos").upload(path, file);
      if (upErr) throw new Error("Photo upload failed. Tap Retry.");
      setPhotoProgress(1);

      const { error: dbErr } = await sb.from("comm_book").insert({
        company_id: companyId,
        member_id: memberId,
        location_id: locationId || null,
        time_entry_id: entryId,
        category: "note",
        message: `End-of-shift book photo${locationName ? ` — ${locationName}` : ""}`,
        photo_url: path,
      });
      if (dbErr) throw dbErr;

      try {
        await fetch("/api/time/clock-out/proof", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ companyId, entryId, kind: "book", storagePath: path }),
        });
      } catch {}

      photoSavedRef.current = true;
      setPhotoState("uploaded");
      setDone(true);
      onProofUploaded?.(entryId);
      notifyWaiters();
    } catch (e) {
      setPhotoState("ready"); // keep the file so Retry never forces a retake
      setPhotoError(e instanceof Error ? e.message : "Photo upload failed. Tap Retry.");
      notifyWaiters();
    }
  }

  return (
    <div>
      {enableVideo && (
      <>
      {/* ---- Walkthrough video ---- */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>📹 End-of-shift walkthrough</div>

        {recState === "idle" && (
          <button onClick={startRecording} style={{ width: "100%", padding: "14px", fontSize: "1rem", fontWeight: 700 }}>
            🎥 Record live walkthrough
          </button>
        )}

        {(recState === "recording" || recState === "paused") && (
          <div>
            <video ref={previewRef} muted playsInline autoPlay
              style={{ width: "100%", borderRadius: 8, background: "#000", maxHeight: 220, minHeight: 160 }} />
            <p style={{ fontWeight: 800, fontSize: "1.2rem", margin: "8px 0", textAlign: "center" }}>
              {recState === "paused" ? "⏸ Paused — " : "🔴 Recording — "}
              {fmtTime(recSeconds)} / {fmtTime(MAX_VIDEO_SECONDS)}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              {recState === "recording"
                ? <button onClick={pauseRecording} style={{ flex: 1, padding: "12px" }}>⏸ Pause</button>
                : <button onClick={resumeRecording} style={{ flex: 1, padding: "12px" }}>▶ Resume</button>}
              <button onClick={finishRecording}
                style={{ flex: 2, padding: "12px", fontWeight: 700, background: "#28704a", color: "#fff" }}>
                ✅ Finish &amp; save
              </button>
            </div>
          </div>
        )}

        {recState === "recorded" && (
          <div>
            <p style={{ fontWeight: 700 }}>✅ Walkthrough saved ({fmtTime(recSeconds)})</p>
            {uploadFailed ? (
              <div>
                {videoError && <p style={{ color: "var(--danger)" }}>{videoError}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={retryVideoUpload} style={{ flex: 1, padding: "12px", fontWeight: 700 }}>
                    🔁 Retry upload
                  </button>
                  <button onClick={discardRecording} style={{ padding: "12px", color: "var(--danger)" }}>
                    Discard
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ color: "var(--muted)" }}>Preparing upload…</p>
            )}
          </div>
        )}

        {recState === "uploading" && (
          <div>
            <p style={{ margin: "0 0 6px", fontWeight: 700 }}>
              ⬆ Uploading walkthrough… {Math.round(uploadProgress * 100)}%
            </p>
            <div style={{ background: "var(--border)", borderRadius: 8, height: 14, overflow: "hidden" }}>
              <div style={{ width: `${Math.round(uploadProgress * 100)}%`, height: "100%", background: "var(--primary)" }} />
            </div>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              You can clock out — the upload keeps going.
            </p>
          </div>
        )}

        {recState === "uploaded" && (
          <div style={{ padding: "10px", background: "#e6f4ea", borderRadius: 8, textAlign: "center" }}>
            ✅ Walkthrough uploaded and verified{locationName ? ` — ${locationName}` : ""}
            <br />
            <button onClick={discardRecording} style={{ marginTop: 8, fontSize: "0.88rem" }}>
              Record another
            </button>
          </div>
        )}

        {videoError && recState !== "recorded" && (
          <p style={{ color: "var(--danger)" }}>{videoError}</p>
        )}
        {locationName && recState === "idle" && (
          <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "6px 0 0", textAlign: "center" }}>
            Tagged to {locationName} · up to 10 min
          </p>
        )}
      </div>
      </>
      )}

      {enableBook && (
      <>
      {/* ---- Communication Book proof ---- */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>📷 Communication book</div>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 8px" }}>
          If this location has a communication book, take its photo. If there is no book, report it instead — no photo is needed.
        </p>
        <label style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 10px", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={noBookAtLocation}
            onChange={(e) => handleNoBookChange(e.target.checked)}
            disabled={photoState === "uploading" || photoSavedRef.current || noBookStatus === "saving" || noBookStatus === "saved"}
            style={{ width: 22, height: 22, flexShrink: 0 }}
          />
          <strong>No communication book at this location — no photo required</strong>
        </label>
        {noBookAtLocation ? (
          <div style={{ marginTop: 10 }}>
            {noBookStatus === "saving" && (
              <p role="status">Saving no-book report for management… You may still clock out.</p>
            )}
            {noBookStatus === "saved" && (
              <p role="status" style={{ color: "var(--primary)", fontWeight: 700 }}>
                ✓ No communication book reported and saved for this shift. Photo not required.
              </p>
            )}
            {noBookStatus === "error" && (
              <div role="alert">
                <p style={{ color: "var(--danger)" }}>{noBookError}</p>
                <button type="button" onClick={() => void saveNoBookReport()}>
                  🔁 Retry no-book report
                </button>
                <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                  Clock-out time is independent. The report must be saved to finish required proof.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {photoError && <p style={{ color: "var(--danger)" }}>{photoError}</p>}
            <input ref={photoRef} type="file" accept="image/*" capture="environment"
              style={{ display: "none" }}
              onChange={(e) => handlePhotoFile(e.target.files?.[0] || null)} />
            {photoState === "idle" && (
              <button type="button" onClick={() => photoRef.current?.click()}
                style={{ width: "100%", padding: "14px", fontSize: "1rem", fontWeight: 700 }}>
                📷 Take book photo
              </button>
            )}
            {photoState === "ready" && (
              <div>
                <p style={{ fontWeight: 700 }}>✓ Book photo ready</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => void uploadPhoto()} style={{ flex: 1, padding: "12px", fontWeight: 700 }}>
                    🔁 Retry upload
                  </button>
                  <button type="button" onClick={() => photoRef.current?.click()} style={{ padding: "12px" }}>
                    Retake
                  </button>
                </div>
              </div>
            )}
            {photoState === "uploading" && <p style={{ fontWeight: 700 }}>⬆ Uploading photo…</p>}
            {photoState === "uploaded" && (
              <div style={{ padding: "10px", background: "#e6f4ea", borderRadius: 8, textAlign: "center" }}>
                ✅ Book photo uploaded
                <div>
                  <button type="button" onClick={() => { setPhotoFile(null); setPhotoState("idle"); }}
                    style={{ marginTop: 8, fontSize: "0.88rem" }}>
                    Take another
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {done && !hasPendingUploads() && (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 10, textAlign: "center" }}>
          Proof saved — safe to clock out.
        </p>
      )}
    </div>
  );
});

export default EndShiftProof;
