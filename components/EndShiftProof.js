"use client";

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import * as tus from "tus-js-client";
import { supabase } from "../lib/supabase";

const MAX_VIDEO_SECONDS = 10 * 60;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
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
  { companyId, memberId, entryId, locationId, locationName },
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
    const videoPending =
      (recState === "recorded" || recState === "uploading") && !videoSaved;
    const photoPending =
      (photoState === "ready" || photoState === "uploading") && photoFile;
    return videoPending || photoPending;
  }

  useImperativeHandle(ref, () => ({
    hasPendingUploads,
    waitForUploads() {
      if (!hasPendingUploads()) return Promise.resolve();
      return new Promise((resolve) => waitersRef.current.push(resolve));
    },
  }));

  async function startRecording() {
    setVideoError("");
    setUploadFailed(false);
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

      const candidates = isiOS
        ? ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm"]
        : ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
      const mimeType = candidates.find((t) => {
        try { return window.MediaRecorder.isTypeSupported(t); } catch { return false; }
      });
      mimeRef.current = mimeType || "";

      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 320000,
        audioBitsPerSecond: 24000,
      });
      recorderRef.current = recorder;
      chunksRef.current = [];
      activeMsRef.current = 0;
      setRecSeconds(0);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current || "video/mp4" });
        chunksRef.current = [];
        try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
        if (previewRef.current) previewRef.current.srcObject = null;
        if (blob.size > MAX_VIDEO_BYTES) {
          setVideoError("That recording is too large. Try a shorter walkthrough.");
          setRecState("idle");
          return;
        }
        window.__endShiftVideoBlob = blob; // kept for upload; never cleared on failure
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
    // Accumulate active time; paused time does NOT count toward the 10-min max.
    activeMsRef.current += Date.now() - segStartRef.current;
    try { r.pause(); } catch (e) {
      setVideoError(e instanceof Error ? e.message : "The recorder could not pause.");
      return;
    }
    setRecState("paused");
  }

  function resumeRecording() {
    const r = recorderRef.current;
    if (!r || r.state !== "paused") return;
    // Do NOT call requestData() before resume — especially on iPhone.
    segStartRef.current = Date.now();
    try { r.resume(); } catch (e) {
      setVideoError(e instanceof Error ? e.message : "The recorder could not resume.");
      return;
    }
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
    setRecState("idle");
    setRecSeconds(0);
    setUploadProgress(0);
    setUploadFailed(false);
    setVideoError("");
  }

  async function uploadVideo(blob) {
    const b = blob || window.__endShiftVideoBlob;
    if (!b) return;
    setRecState("uploading");
    setUploadProgress(0);
    setUploadFailed(false);
    setVideoError("");
    try {
      const sb = supabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error("You're signed out. Sign back in and retry the upload.");
      const ext = extForMime(mimeRef.current || b.type);
      const path = `${companyId}/${entryId}/walkthrough-${Date.now()}.${ext}`;
      const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

      await new Promise((resolve, reject) => {
        const upload = new tus.Upload(b, {
          endpoint,
          chunkSize: TUS_CHUNK_BYTES,
          retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
          metadata: {
            bucketName: "shift-videos",
            objectName: path,
            contentType: b.type || "video/mp4",
          },
          headers: {
            authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          },
          onError: reject,
          onProgress: (up, total) => setUploadProgress(total ? up / total : 0),
          onSuccess: resolve,
        });
        tusUploadRef.current = upload;
        const prevUrl = localStorage.getItem(`tus-walk-${entryId}`);
        if (prevUrl) upload.url = prevUrl;
        upload.on("postResponse", () => {
          try {
            const url = upload.url;
            if (url) localStorage.setItem(`tus-walk-${entryId}`, url);
          } catch {}
        });
        upload.start();
      });

      localStorage.removeItem(`tus-walk-${entryId}`);
      const { error: dbErr } = await sb.from("shift_videos").insert({
        company_id: companyId,
        member_id: memberId,
        location_id: locationId || null,
        time_entry_id: entryId,
        video_url: path,
        duration_seconds: Math.round(activeMsRef.current / 1000),
        file_size_bytes: b.size,
      });
      if (dbErr) throw dbErr;

      // Attach proof to the time entry (best-effort; row above is the record)
      try {
        await fetch("/api/time/clock-out/proof", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ companyId, entryId, kind: "walkthrough", storagePath: path }),
        });
      } catch {}

      window.__endShiftVideoBlob = null; // upload succeeded — safe to clear
      setVideoSaved(true);
      setRecState("uploaded");
      setDone(true);
      notifyWaiters();
    } catch (e) {
      // Keep the local blob so Retry never forces a re-record.
      setUploadFailed(true);
      setRecState("recorded");
      setVideoError(e instanceof Error ? e.message : "Upload failed. Tap Retry — your recording is safe.");
      notifyWaiters();
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

  function handlePhotoFile(f) {
    setPhotoError("");
    if (!f) return;
    if (!f.type.startsWith("image/")) { setPhotoError("Please choose a photo."); return; }
    setPhotoFile(f);
    setPhotoState("ready");
    // Auto-upload so the crew doesn't wait
    uploadPhoto(f);
  }

  async function uploadPhoto(f) {
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

      setPhotoState("uploaded");
      setDone(true);
      notifyWaiters();
    } catch (e) {
      setPhotoState("ready"); // keep the file so Retry never forces a retake
      setPhotoError(e instanceof Error ? e.message : "Photo upload failed. Tap Retry.");
      notifyWaiters();
    }
  }

  return (
    <div>
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
            ✅ Walkthrough uploaded{locationName ? ` — ${locationName}` : ""}
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

      {/* ---- Book photo ---- */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>📷 Communication book photo</div>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 8px" }}>
          Take a clear photo of the communication book before clocking out.
        </p>
        {photoError && <p style={{ color: "var(--danger)" }}>{photoError}</p>}
        <input ref={photoRef} type="file" accept="image/*" capture="environment"
          style={{ display: "none" }}
          onChange={(e) => handlePhotoFile(e.target.files?.[0] || null)} />
        {photoState === "idle" && (
          <button onClick={() => photoRef.current?.click()}
            style={{ width: "100%", padding: "14px", fontSize: "1rem", fontWeight: 700 }}>
            📷 Take book photo
          </button>
        )}
        {photoState === "ready" && (
          <div>
            <p style={{ fontWeight: 700 }}>✓ Book photo ready</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => uploadPhoto()} style={{ flex: 1, padding: "12px", fontWeight: 700 }}>
                🔁 Retry upload
              </button>
              <button onClick={() => photoRef.current?.click()} style={{ padding: "12px" }}>
                Retake
              </button>
            </div>
          </div>
        )}
        {photoState === "uploading" && (
          <p style={{ fontWeight: 700 }}>⬆ Uploading photo…</p>
        )}
        {photoState === "uploaded" && (
          <div style={{ padding: "10px", background: "#e6f4ea", borderRadius: 8, textAlign: "center" }}>
            ✅ Book photo uploaded
            <br />
            <button onClick={() => { setPhotoFile(null); setPhotoState("idle"); }}
              style={{ marginTop: 8, fontSize: "0.88rem" }}>
              Take another
            </button>
          </div>
        )}
      </div>

      {done && !hasPendingUploads() && (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 10, textAlign: "center" }}>
          Proof saved — safe to clock out.
        </p>
      )}
    </div>
  );
});

export default EndShiftProof;
