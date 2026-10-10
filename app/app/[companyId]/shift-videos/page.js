"use client";

import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";

const MAX_DURATION_SEC = 10 * 60; // 10 minutes
const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB chunks

function fmtBytes(n) {
  if (!n) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function fmtDuration(sec) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function daysLeft(expiresAt) {
  const ms = new Date(expiresAt) - new Date();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export default function ShiftVideosPage() {
  const { company, member, loading } = useCompany();
  const [videos, setVideos] = useState([]);
  const [locations, setLocations] = useState([]);
  const [uploading, setUploading] = useState(null); // { file, progress, upload, paused }
  const [form, setForm] = useState({ location_id: "", notes: "" });
  const [error, setError] = useState("");
  const [playingId, setPlayingId] = useState(null);
  const [videoUrls, setVideoUrls] = useState({});
  const fileRef = useRef(null);

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    const sb = supabase();
    const { data: vids } = await sb
      .from("shift_videos")
      .select("id, video_url, duration_seconds, file_size_bytes, notes, keep_video, video_expires_at, created_at, location_id, member_id, company_members!shift_videos_member_id_fkey(display_name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setVideos(vids || []);
    const { data: locs } = await sb
      .from("locations")
      .select("id, name")
      .eq("company_id", company.id)
      .order("name");
    setLocations(locs || []);
  }

  useEffect(() => {
    if (!loading && company?.id) load();
  }, [loading, company?.id]);

  // Get video duration from file metadata before uploading.
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
    setError("");
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Please choose a video file.");
      return;
    }
    const duration = await getDuration(file);
    if (duration && duration > MAX_DURATION_SEC) {
      setError(`That video is ${fmtDuration(duration)} — the limit is 10 minutes. Please trim it first.`);
      return;
    }
    startUpload(file, duration);
  }

  async function startUpload(file, duration) {
    const sb = supabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      setError("You're signed out. Sign back in and try again.");
      return;
    }
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const path = `${company.id}/${member.id}/${Date.now()}.${ext}`;
    const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

    const upload = new tus.Upload(file, {
      endpoint,
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      metadata: {
        bucketName: "shift-videos",
        objectName: path,
        contentType: file.type || "video/mp4",
      },
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
      onError: (err) => {
        console.error("upload failed", err);
        setError("Upload failed. Check your connection and tap Retry — it picks up where it stopped.");
        setUploading((u) => (u ? { ...u, failed: true } : u));
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        setUploading((u) => (u ? { ...u, progress: bytesUploaded / bytesTotal } : u));
      },
      onSuccess: async () => {
        // Save the DB record.
        const { error: dbErr } = await sb.from("shift_videos").insert({
          company_id: company.id,
          member_id: member.id,
          location_id: form.location_id || null,
          video_url: path,
          duration_seconds: Math.round(duration),
          file_size_bytes: file.size,
          notes: form.notes.trim() || null,
        });
        if (dbErr) {
          console.error("video record failed", dbErr);
          setError("Video uploaded but couldn't be saved. Tell your manager.");
        } else {
          setForm({ location_id: "", notes: "" });
          load();
        }
        setUploading(null);
      },
    });

    // Resume if we have a previous upload URL for this file.
    const prevUrl = localStorage.getItem(`tus-${file.name}-${file.size}`);
    if (prevUrl) upload.url = prevUrl;
    upload.on("afterResponse", (req, res) => {
      const url = req.getURL();
      if (url) localStorage.setItem(`tus-${file.name}-${file.size}`, url);
    });

    setUploading({ file, progress: 0, upload, paused: false, failed: false, duration });
    upload.start();
  }

  function pauseUpload() {
    if (uploading?.upload) {
      uploading.upload.abort();
      setUploading({ ...uploading, paused: true });
    }
  }

  function resumeUpload() {
    if (uploading?.upload) {
      setUploading({ ...uploading, paused: false, failed: false });
      uploading.upload.start();
    }
  }

  function cancelUpload() {
    if (uploading?.upload) uploading.upload.abort();
    localStorage.removeItem(`tus-${uploading.file.name}-${uploading.file.size}`);
    setUploading(null);
  }

  async function getPlayUrl(video) {
    if (videoUrls[video.id]) return videoUrls[video.id];
    const sb = supabase();
    const { data, error } = await sb.storage.from("shift-videos").createSignedUrl(video.video_url, 3600);
    if (error) {
      console.error("Signed URL error:", error);
      setError(`Couldn't load video: ${error.message}`);
      return null;
    }
    if (data?.signedUrl) {
      setVideoUrls((m) => ({ ...m, [video.id]: data.signedUrl }));
      return data.signedUrl;
    }
    return null;
  }

  async function toggleKeep(video) {
    const sb = supabase();
    await sb.from("shift_videos").update({ keep_video: !video.keep_video }).eq("id", video.id);
    load();
  }

  async function deleteVideo(video) {
    if (!confirm("Delete this video? This can't be undone.")) return;
    const sb = supabase();
    await sb.storage.from("shift-videos").remove([video.video_url]);
    await sb.from("shift_videos").delete().eq("id", video.id);
    load();
  }

  if (loading) return <main className="site-shell"><p>Loading…</p></main>;

  return (
    <main className="site-shell">
      <h1>🎬 Shift Videos</h1>
      <p style={{ color: "var(--muted)" }}>
        Record or upload a walkthrough video at the end of your shift (up to 10 minutes).
        Videos are kept for 7 days unless a manager saves one as proof.
      </p>

      {/* Upload form */}
      <section className="panel" style={{ marginBottom: 20 }}>
        <h2>Upload a video</h2>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <div style={{ display: "grid", gap: 10, maxWidth: 480 }}>
          <label>
            Location
            <select
              value={form.location_id}
              onChange={(e) => setForm({ ...form, location_id: e.target.value })}
              style={{ width: "100%", marginTop: 4 }}
            >
              <option value="">— Pick a location —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <label>
            Notes (optional)
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Finished all rooms, lobby needs extra attention"
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <button
            className="btn-primary"
            disabled={!!uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Uploading…" : "📹 Record or choose video"}
          </button>
        </div>

        {/* Upload progress */}
        {uploading && (
          <div style={{ marginTop: 16, maxWidth: 480 }}>
            <p>
              <strong>{uploading.file.name}</strong> ({fmtBytes(uploading.file.size)}, {fmtDuration(uploading.duration)})
            </p>
            <div style={{ background: "var(--border)", borderRadius: 8, height: 16, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.round(uploading.progress * 100)}%`,
                  height: "100%",
                  background: uploading.failed ? "var(--danger)" : "var(--primary)",
                  transition: "width 0.3s",
                }}
              />
            </div>
            <p>{Math.round(uploading.progress * 100)}% uploaded</p>
            {uploading.failed && (
              <p style={{ color: "var(--danger)" }}>
                Upload interrupted. It saved your progress — tap Resume to continue where it stopped.
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {uploading.paused || uploading.failed ? (
                <button className="btn-primary" onClick={resumeUpload}>▶ Resume</button>
              ) : (
                <button onClick={pauseUpload}>⏸ Pause</button>
              )}
              <button onClick={cancelUpload} style={{ color: "var(--danger)" }}>✕ Cancel</button>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Keep this page open while uploading. If your connection drops, just tap Resume.
            </p>
          </div>
        )}
      </section>

      {/* Video list */}
      <section className="panel">
        <h2>Recent videos</h2>
        {videos.length === 0 && <p style={{ color: "var(--muted)" }}>No videos yet.</p>}
        {videos.map((v) => (
          <div key={v.id} style={{ borderBottom: "1px solid var(--border)", padding: "12px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
              <div>
                <strong>{v.company_members?.display_name || "Someone"}</strong>
                {" · "}{fmtDuration(v.duration_seconds)}
                {" · "}{fmtBytes(v.file_size_bytes)}
                <br />
                <span style={{ color: "var(--muted)", fontSize: 13 }}>
                  {new Date(v.created_at).toLocaleString()}
                  {v.keep_video ? (
                    <span style={{ color: "var(--primary)" }}> · 📌 Saved as proof</span>
                  ) : (
                    <span> · 🗑 Deletes in {daysLeft(v.video_expires_at)}d</span>
                  )}
                </span>
                {v.notes && <p style={{ margin: "4px 0" }}>{v.notes}</p>}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={async () => {
                    if (playingId === v.id) {
                      setPlayingId(null);
                    } else {
                      const url = await getPlayUrl(v);
                      if (url) setPlayingId(v.id);
                      else setError("Couldn't load that video.");
                    }
                  }}
                >
                  {playingId === v.id ? "⏸ Close" : "▶ Play"}
                </button>
                {isManager && (
                  <>
                    <button onClick={() => toggleKeep(v)} title="Save as proof">
                      {v.keep_video ? "📌" : "📍"}
                    </button>
                    <button onClick={() => deleteVideo(v)} style={{ color: "var(--danger)" }}>🗑</button>
                  </>
                )}
              </div>
            </div>
            {playingId === v.id && videoUrls[v.id] && (
              <video
                src={videoUrls[v.id]}
                controls
                playsInline
                style={{ width: "100%", maxWidth: 640, marginTop: 8, borderRadius: 8 }}
                onError={(e) => {
                  console.error("Video load error:", e);
                  setError("This video file couldn't be played. It may not have finished uploading.");
                  setPlayingId(null);
                }}
              />
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
