"use client";

import { useEffect, useRef, useState } from "react";
import { uploadShiftVideoSafely, MAX_VIDEO_BYTES } from "../../../../lib/safe-shift-video-upload";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import PrivateWalkthroughPlayer from "../../../../components/PrivateWalkthroughPlayer";
import { readEvidenceBlob, evidenceFilename, exportEvidence } from "../../../../lib/evidence-export";

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
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [exportingId, setExportingId] = useState(null);
  const [exportNote, setExportNote] = useState("");
  const [preparedShare, setPreparedShare] = useState(null);
  const [shareStatusVideoId, setShareStatusVideoId] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [videoOverrides, setVideoOverrides] = useState([]);
  const [videoUrls, setVideoUrls] = useState({});
  const [playbackIssue, setPlaybackIssue] = useState(null);
  const fileRef = useRef(null);

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    if (!company?.id) return;
    setListLoading(true);
    setListError("");
    try {
      const sb = supabase();
      const cols = "id, video_url, duration_seconds, file_size_bytes, notes, keep_video, video_expires_at, created_at, location_id, member_id";
      let { data: vids, error: videosError } = await sb
        .from("shift_videos")
        .select(cols + ", company_members!shift_videos_member_id_fkey(display_name)")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (videosError) {
        // An optional employee-name relationship error must not hide the
        // recordings themselves. Retry the main records without the join.
        const plain = await sb.from("shift_videos").select(cols)
          .eq("company_id", company.id)
          .order("created_at", { ascending: false })
          .limit(100);
        if (plain.error) throw plain.error;
        vids = plain.data;
        setListError("Employee names could not be loaded, but saved recordings are shown.");
      }
      setVideos(vids || []);
      // Walkthrough overrides (migration 052): shifts where the employee
      // saved an "I can't upload this" reason instead of a video. Manager
      // review only. Tolerant: table absent before the migration runs.
      try {
        const { data: ovs, error: ovError } = await sb
          .from("shift_proof_overrides")
          .select("id, proof_kind, reason, created_at, location_id, member_id, company_members!shift_proof_overrides_member_id_fkey(display_name), locations(name)")
          .eq("company_id", company.id)
          .eq("proof_kind", "walkthrough")
          .order("created_at", { ascending: false })
          .limit(100);
        if (!ovError) setVideoOverrides(ovs || []);
      } catch { /* overrides unavailable — video list still renders */ }
      const { data: locs, error: locationsError } = await sb
        .from("locations")
        .select("id, name")
        .eq("company_id", company.id)
        .order("name");
      if (locationsError) console.warn("Shift video location names unavailable:", locationsError.message);
      setLocations(locs || []);
    } catch (err) {
      // Never show 'No videos yet' as though a failed query returned zero.
      setListError("Could not load the saved walkthrough list: " + (err?.message || "Unknown error") +
        ". Tap Refresh videos or sign in again.");
    } finally {
      setListLoading(false);
    }
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
        companyId: company.id,
        memberId: member.id,
        onProgress: progress => setUploading(old => old ? { ...old, progress } : old),
        onUpload: upload => setUploading(old => old ? { ...old, upload } : old),
      });
      // On a retry after an upload succeeded but the DB request failed,
      // first check the exact private path to avoid duplicate proof rows.
      const { data: prior, error: priorError } = await sb.from("shift_videos")
        .select("id").eq("company_id", company.id)
        .eq("video_url", path).limit(1).maybeSingle();
      if (priorError) throw priorError;
      if (!prior) {
        const { error } = await sb.from("shift_videos").insert({
          company_id: company.id,
          member_id: member.id,
          location_id: form.location_id || null,
          video_url: path,
          duration_seconds: Math.round(duration || 0),
          file_size_bytes: file.size,
          notes: form.notes.trim() || null,
        });
        if (error) throw error;
      }
      setForm({ location_id: "", notes: "" });
      void load();
      setUploading(null);
    } catch (err) {
      setError((err?.message || "Video upload failed.") + " Keep this screen open and tap Retry upload; the original video stays available.");
      setUploading(old => old ? { ...old, failed: true } : old);
    }
  }

  function pauseUpload() {
    if (uploading?.upload) {
      uploading.upload.abort();
      setUploading({ ...uploading, paused: true });
    }
  }

  function resumeUpload() {
    if (!uploading) return;
    if (uploading.failed) {
      const { file, duration } = uploading;
      void startUpload(file, duration);
      return;
    }
    if (uploading.upload) {
      setUploading({ ...uploading, paused: false, failed: false });
      uploading.upload.start();
    }
  }

  function cancelUpload() {
    if (uploading?.upload) uploading.upload.abort();
    setUploading(null);
  }

  async function getPlayUrl(video) {
    // Always generate a fresh signed URL; previously cached links expired.
    try {
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
      setError("Couldn't load that video.");
      return null;
    } catch (err) {
      console.error("Signed URL exception:", err);
      setError(`Couldn't load video: ${err.message || err}`);
      return null;
    }
  }

  async function shareVideo(video, share) {
    if (!isManager || exportingId) return;
    setExportingId(video.id);
    setShareStatusVideoId(video.id);
    setPreparedShare(null);
    setExportNote("");
    setError("");
    try {
      const sb = supabase();
      const blob = await readEvidenceBlob(sb, "shift-videos", video.video_url);
      const label = (video.company_members?.display_name || "WorkTeams") + "-walkthrough";
      const filename = evidenceFilename("video", video.video_url, label, blob.type);
      if (share) {
        setPreparedShare({ blob, filename, id: video.id });
        setExportNote("Video ready. Tap Open phone sharing options below this video, then choose Gmail, email, Drive, or another app.");
      } else {
        const result = await exportEvidence(blob, filename, false);
        if (result === "downloaded") {
          setExportNote("Video copy saved to this device. Attach it to email or upload it to a secure dispute folder.");
        }
      }
    } catch (err) {
      setError(err?.message || "Video could not be shared. Check your connection and retry.");
    } finally {
      setExportingId(null);
    }
  }

  async function openPreparedVideoShare() {
    // Keep the web share operation in a DIRECT tap. Large private files take
    // time to download, so the first tap prepares them and this one opens
    // Android/iOS native sharing without losing the user gesture.
    const prepared = preparedShare;
    if (!prepared) return;
    setExportNote("Opening phone sharing options…");
    try {
      const result = await exportEvidence(prepared.blob, prepared.filename, true);
      if (result === "shared") {
        setExportNote("Your phone handed the video to the selected app. Confirm sending in that app.");
        setPreparedShare(null);
      } else if (result === "cancelled") {
        setExportNote("Sharing was cancelled or the phone closed the share menu. The video is still ready; try Open phone sharing options again, or Save copy.");
      } else {
        setExportNote("The phone could not open a file-sharing menu. A download was requested instead; check Files > Downloads. The video remains ready to retry.");
      }
    } catch (err) {
      setExportNote("The phone did not open the sharing menu. Try again or tap Save copy.");
      setError(err?.message || "Phone sharing failed.");
    }
  }

  async function toggleKeep(video) {
    const sb = supabase();
    await sb.from("shift_videos").update({ keep_video: !video.keep_video }).eq("id", video.id);
    load();
  }

  async function deleteVideo(video) {
    if (!confirm("Delete this video? This can't be undone.")) return;
    const sb = supabase();
    let paths = [video.video_url];
    if (video.video_url?.endsWith(".parts.json")) {
      const { data: raw, error: readError } = await sb.storage.from("shift-videos").download(video.video_url);
      if (readError || !raw) {
        setError("Couldn't verify all parts of this recording. Nothing was deleted.");
        return;
      }
      try {
        const manifest = JSON.parse(await raw.text());
        if (manifest.kind === "workteams-b2-parts") {
          const { data: { session } } = await sb.auth.getSession();
          if (!session) {
            setError("Sign in again to delete this private recording.");
            return;
          }
          const response = await fetch("/api/shift-media/b2", {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + session.access_token,
            },
            body: JSON.stringify({
              action: "delete", companyId: company.id, videoId: video.id,
            }),
          });
          if (!response.ok) {
            setError("Could not safely delete every private Backblaze segment. Nothing was confirmed deleted.");
            return;
          }
          load();
          return;
        }
        const base = video.video_url.slice(0, -".parts.json".length);
        if (manifest.kind !== "workteams-walkthrough-parts" ||
            !Array.isArray(manifest.parts) ||
            manifest.parts.length < 2 || manifest.parts.length > 20 ||
            !manifest.parts.every((part, i) => part === `${base}.part-${String(i).padStart(3, "0")}.bin`)) {
          setError("Invalid part list; nothing was deleted.");
          return;
        }
        paths = [...manifest.parts, video.video_url];
      } catch {
        setError("Invalid recording manifest; nothing was deleted.");
        return;
      }
    }
    const { error: deleteError } = await sb.storage.from("shift-videos").remove(paths);
    if (deleteError) {
      setError("Could not delete all recording pieces: " + deleteError.message);
      return;
    }
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

      {/* Walkthrough overrides — manager review (never shown as videos) */}
      {isManager && videoOverrides.length > 0 && (
        <section className="panel" style={{ marginBottom: 20, border: "2px solid #e0a458", background: "#fffaf2" }}>
          <h2 style={{ marginTop: 0 }}>⚠ Walkthrough overrides — no video uploaded</h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            These employees used the “I can&apos;t upload this” override for the required
            end-of-shift video. The reason they gave is shown with their name and location.
          </p>
          {videoOverrides.map((o) => (
            <div key={o.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
              <strong>{o.company_members?.display_name || "Someone"}</strong>
              {o.locations?.name ? <span> · 📍 {o.locations.name}</span> : null}
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                {" · "}{new Date(o.created_at).toLocaleString()}
              </span>
              <p style={{ margin: "4px 0 0" }}>Reason: “{o.reason}”</p>
            </div>
          ))}
        </section>
      )}

      {/* Video list */}
      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2>Recent videos</h2>
          <button type="button" disabled={listLoading} onClick={() => void load()}>
            {listLoading ? "Refreshing…" : "↻ Refresh videos"}
          </button>
        </div>
        {listError && <p role="alert" style={{ color: "var(--danger)" }}>{listError}</p>}

        {!listLoading && !listError && videos.length === 0 && (
          <p style={{ color: "var(--muted)" }}>No saved walkthrough videos were found for this company.</p>
        )}
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
                      setPlaybackIssue(null);
                      const url = await getPlayUrl(v);
                      if (url) setPlayingId(v.id);
                    }
                  }}
                >
                  {playingId === v.id ? "⏸ Close" : "▶ Play"}
                </button>
                {isManager && (
                  <>
                    <button type="button" disabled={exportingId === v.id} onClick={() => void shareVideo(v, true)}>
                      {exportingId === v.id ? "Preparing…" : "↗ Share (prepare video)"}
                    </button>
                    <button type="button" disabled={exportingId === v.id} onClick={() => void shareVideo(v, false)}>
                      ↓ Save copy
                    </button>
                    <button onClick={() => toggleKeep(v)} title="Save as proof">
                      {v.keep_video ? "📌" : "📍"}
                    </button>
                    <button onClick={() => deleteVideo(v)} style={{ color: "var(--danger)" }}>🗑</button>
                  </>
                )}
              </div>
            </div>
            {isManager && shareStatusVideoId === v.id && (exportingId === v.id || !!exportNote) && (
              <div role="status" style={{ marginTop: 10, padding: 12, border: "2px solid var(--primary)", borderRadius: 10 }}>
                <p style={{ fontWeight: 700, margin: "0 0 8px" }}>
                  {exportingId === v.id ? "Preparing the full private video for sharing…" : exportNote}
                </p>
                {preparedShare?.id === v.id && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => void openPreparedVideoShare()}
                      style={{ padding: "12px 16px", fontWeight: 800, background: "var(--primary)", color: "#fff", borderRadius: 8 }}>
                      ↗ Open phone sharing options
                    </button>
                    <button type="button" onClick={() => void exportEvidence(preparedShare.blob, preparedShare.filename, false)
                      .then(() => setExportNote("Download requested. Check your phone's Downloads folder."))
                      .catch((err) => setError(err?.message || "Could not save the video."))}>
                      ↓ Save copy instead
                    </button>
                    <button type="button" onClick={() => { setPreparedShare(null); setExportNote(""); setShareStatusVideoId(null); }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
            {playingId === v.id && videoUrls[v.id] && (
              <div style={{ marginTop: 8, maxWidth: 640 }}>
                <PrivateWalkthroughPlayer url={videoUrls[v.id]} storagePath={v.video_url} durationSeconds={v.duration_seconds || 0} />
                <p style={{ color: "var(--muted)", fontSize: 12, margin: "4px 0" }}>
                  Tap Play to start. Large protected walkthroughs load their video parts on demand.
                </p>
              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
