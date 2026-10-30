"use client";

import { useRef, useState } from "react";
import { uploadShiftVideoSafely, MAX_VIDEO_BYTES } from "../lib/safe-shift-video-upload";
import { supabase } from "../lib/supabase";

const MAX_DURATION_SEC = 10 * 60;
const CHUNK_SIZE = 6 * 1024 * 1024;

function fmtBytes(n) {
  if (!n) return "—";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

// Compact shift-video uploader for embedding in the Time Clock page.
// Props: companyId, memberId, locationId (auto-filled), locationName, onDone
export default function ShiftVideoQuick({ companyId, memberId, locationId, locationName, onDone }) {
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const fileRef = useRef(null);

  function getDuration(file) {
    // Best-effort: resolves with seconds, or null if the browser can't decode
    // the file's metadata (e.g. HEVC from iPhones). Never rejects — an
    // unreadable duration must not block the upload.
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const el = document.createElement("video");
      el.preload = "metadata";
      el.muted = true;
      el.playsInline = true;
      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        resolve(val);
      };
      el.onloadedmetadata = () => finish(el.duration || null);
      el.onerror = () => finish(null);
      setTimeout(() => finish(null), 8000);
      el.src = url;
    });
  }

  async function handleFile(file) {
    setError(""); setDone(false);
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("Please choose a video file."); return; }
    const duration = await getDuration(file);
    if (duration && duration > MAX_DURATION_SEC) {
      setError("That video is too long — 10 minute limit. Please trim it first.");
      return;
    }
    startUpload(file, duration || 0);
  }

  async function startUpload(file, duration) {
    if (file.size > MAX_VIDEO_BYTES) {
      setError("This recording exceeds 500 MB. The original file remains on your phone; ask management for help.");
      return;
    }
    const sb = supabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setError("You're signed out. Sign back in and retry with the same video."); return; }
    setUploading({ file, progress: 0, upload: null, paused: false, failed: false, duration });
    setError("");
    try {
      const path = await uploadShiftVideoSafely({
        sb, file, session,
        companyId: companyId,
        memberId: memberId,
        onProgress: progress => setUploading(old => old ? { ...old, progress } : old),
        onUpload: upload => setUploading(old => old ? { ...old, upload } : old),
      });
      // On a retry after an upload succeeded but the DB request failed,
      // first check the exact private path to avoid duplicate proof rows.
      const { data: prior, error: priorError } = await sb.from("shift_videos")
        .select("id").eq("company_id", companyId)
        .eq("video_url", path).limit(1).maybeSingle();
      if (priorError) throw priorError;
      if (!prior) {
        const { error } = await sb.from("shift_videos").insert({
          company_id: companyId,
          member_id: memberId,
          location_id: locationId || null,
          video_url: path,
          duration_seconds: Math.round(duration || 0),
          file_size_bytes: file.size,
        });
        if (error) throw error;
      }
      // A successful transfer alone is not proof: confirm the private object
      // and the exact linked database row before showing "Video saved".
      const [{ data: stored, error: storageError }, { data: linked, error: linkedError }] =
        await Promise.all([
          sb.storage.from("shift-videos").info(path),
          sb.from("shift_videos").select("id,video_url,file_size_bytes")
            .eq("company_id", companyId).eq("member_id", memberId)
            .eq("video_url", path).limit(1).maybeSingle(),
        ]);
      if (storageError || !stored || linkedError || !linked ||
          linked.video_url !== path || Number(linked.file_size_bytes) !== file.size) {
        throw new Error("The saved recording could not be verified. Keep the original and retry.");
      }
      setDone(true);
      onDone?.();
      setUploading(null);
    } catch (err) {
      setError((err?.message || "Video upload failed.") + " Keep this screen open and tap Retry upload; the original video stays available.");
      setUploading(old => old ? { ...old, failed: true } : old);
    }
  }

  if (done) {
    return (
      <div style={{ padding: "12px", background: "#e6f4ea", borderRadius: 8, textAlign: "center" }}>
        ✅ Video saved{locationName ? ` for ${locationName}` : ""}!
        <br />
        <button onClick={() => { setDone(false); fileRef.current?.click(); }} style={{ marginTop: 8 }}>
          Record another
        </button>
        <input ref={fileRef} type="file" accept="video/*" capture="environment" style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files[0])} />
      </div>
    );
  }

  return (
    <div>
      {error && <p style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{error}</p>}
      <input ref={fileRef} type="file" accept="video/*" capture="environment" style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files[0])} />
      {!uploading ? (
        <button
          onClick={() => fileRef.current?.click()}
          style={{ width: "100%", padding: "14px", fontSize: "1rem", fontWeight: 700 }}
        >
          📹 Record end-of-shift video
        </button>
      ) : (
        <div>
          <p style={{ fontSize: "0.9rem", margin: "0 0 6px" }}>
            Uploading {fmtBytes(uploading.file.size)}… {Math.round(uploading.progress * 100)}%
          </p>
          <div style={{ background: "var(--border)", borderRadius: 8, height: 14, overflow: "hidden", marginBottom: 8 }}>
            <div style={{
              width: `${Math.round(uploading.progress * 100)}%`, height: "100%",
              background: uploading.failed ? "var(--danger)" : "var(--primary)",
            }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {uploading.paused || uploading.failed
              ? <button onClick={() => uploading.failed
                  ? void startUpload(uploading.file, uploading.duration)
                  : (setUploading({ ...uploading, paused: false, failed: false }), uploading.upload?.start())}>▶ Retry / Resume</button>
              : <button onClick={() => { uploading.upload.abort(); setUploading({ ...uploading, paused: true }); }}>⏸ Pause</button>}
            <button onClick={() => { uploading.upload.abort(); setUploading(null); }} style={{ color: "var(--danger)" }}>✕ Cancel</button>
          </div>
        </div>
      )}
      {locationName && !uploading && !done && (
        <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "6px 0 0", textAlign: "center" }}>
          Will be tagged to {locationName} · up to 10 min
        </p>
      )}
    </div>
  );
}
