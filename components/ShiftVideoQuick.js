"use client";

import { useRef, useState } from "react";
import * as tus from "tus-js-client";
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
    const sb = supabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setError("You're signed out. Sign back in and try again."); return; }
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const path = `${companyId}/${memberId}/${Date.now()}.${ext}`;
    const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

    const upload = new tus.Upload(file, {
      endpoint,
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      metadata: { bucketName: "shift-videos", objectName: path, contentType: file.type || "video/mp4" },
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
      onError: () => {
        setError("Upload interrupted. Tap Resume — it picks up where it stopped.");
        setUploading((u) => (u ? { ...u, failed: true } : u));
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        setUploading((u) => (u ? { ...u, progress: bytesUploaded / bytesTotal } : u));
      },
      onSuccess: async () => {
        const { error: dbErr } = await sb.from("shift_videos").insert({
          company_id: companyId,
          member_id: memberId,
          location_id: locationId || null,
          video_url: path,
          duration_seconds: Math.round(duration),
          file_size_bytes: file.size,
        });
        if (dbErr) setError("Video uploaded but couldn't be saved. Tell your manager.");
        else { setDone(true); onDone && onDone(); }
        setUploading(null);
      },
    });

    const prevUrl = localStorage.getItem(`tus-${file.name}-${file.size}`);
    if (prevUrl) upload.url = prevUrl;

    setUploading({ file, progress: 0, upload, paused: false, failed: false });
    upload.start();
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
              ? <button onClick={() => { setUploading({ ...uploading, paused: false, failed: false }); uploading.upload.start(); }}>▶ Resume</button>
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
