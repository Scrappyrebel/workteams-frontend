"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { repairWebmPlayback } from "../lib/webm-playback-repair.mjs";

function formatSeconds(value) {
  if (!Number.isFinite(value) || value < 0) return "—";
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Handles both regular videos and private multipart video manifests.
export default function PrivateWalkthroughPlayer({ url, storagePath, durationSeconds = 0 }) {
  const multipart = storagePath?.endsWith(".parts.json");
  const [playUrl, setPlayUrl] = useState(multipart ? "" : url);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(null);
  const [timelineRepaired, setTimelineRepaired] = useState(false);
  const objectUrlRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    setPlayUrl(multipart ? "" : url);
    setCurrentSeconds(0);
    setPlayerDuration(null);
    setTimelineRepaired(false);
    setError("");
    if (!multipart && storagePath?.toLowerCase().endsWith(".webm")) {
      // Prepare only a temporary local playback copy; never touch stored proof.
      setPlayUrl("");
      setLoading(true);
      setProgress("Preparing seekable video timeline…");
      (async () => {
        try {
          const { data, error: downloadError } = await supabase().storage.from("shift-videos").download(storagePath);
          if (downloadError || !data) throw Error("Recording unavailable for timeline repair.");
          const fixed = await repairWebmPlayback(new Blob([data], { type: "video/webm" }), durationSeconds);
          if (cancelled) return;
          if (fixed) {
            const repairedUrl = URL.createObjectURL(fixed.blob);
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = repairedUrl;
            setTimelineRepaired(true);
            setPlayerDuration(fixed.durationSeconds);
            setPlayUrl(repairedUrl);
            setProgress("");
          } else {
            setPlayUrl(url);
            setProgress("Original video available. Seeking may be limited for this recording.");
          }
        } catch {
          if (!cancelled) {
            setPlayUrl(url);
            setProgress("Original video available. The full timeline could not be reconstructed.");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }
    return () => {
      cancelled = true;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    };
  }, [url, multipart, storagePath, durationSeconds]);

  async function loadAllParts() {
    if (!multipart || loading) return;
    setLoading(true);
    setError("");
    setProgress("Opening protected walkthrough…");
    try {
      const sb = supabase();
      // Fetch the manifest with the viewer's logged-in identity, not a public URL.
      const { data, error: readError } = await sb.storage.from("shift-videos").download(storagePath);
      if (readError || !data) throw new Error("Cannot load the walkthrough description. Try signing in again.");
      const info = JSON.parse(await data.text());
      if (info?.kind !== "workteams-walkthrough-parts" || info.version !== 1 ||
          !Array.isArray(info.parts) || info.parts.length < 2 || info.parts.length > 20 ||
          !Number.isSafeInteger(info.bytes) || info.bytes <= 0 || info.bytes > 500 * 1024 * 1024 ||
          !["video/mp4", "video/webm"].includes(info.mimeType)) {
        throw new Error("This recording has an invalid part list.");
      }
      const base = storagePath.slice(0, -".parts.json".length);
      const chunks = [];
      let size = 0;
      for (let i = 0; i < info.parts.length; i++) {
        const part = info.parts[i];
        if (typeof part !== "string" || part !== `${base}.part-${String(i).padStart(3, "0")}.bin`) {
          throw new Error("The recording has an invalid private part address.");
        }
        setProgress(`Loading video part ${i + 1} of ${info.parts.length}…`);
        const { data: payload, error: partError } = await sb.storage.from("shift-videos").download(part);
        if (partError || !payload || !payload.size || payload.size > 40 * 1024 * 1024) {
          throw new Error(`Recording part ${i + 1} could not be loaded. Refresh and try again.`);
        }
        chunks.push(payload);
        size += payload.size;
      }
      if (size !== info.bytes) throw new Error("This recording is incomplete. Contact your manager.");
      const blob = new Blob(chunks, { type: info.mimeType });
      const fixed = await repairWebmPlayback(blob, durationSeconds);
      const tempUrl = URL.createObjectURL(fixed?.blob || blob);
      setTimelineRepaired(!!fixed);
      if (fixed) setPlayerDuration(fixed.durationSeconds);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = tempUrl;
      setPlayUrl(tempUrl);
      setProgress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Video could not be opened.");
      setProgress("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {multipart && !playUrl && (
        <button onClick={loadAllParts} disabled={loading} style={{ fontWeight: 700 }}>
          {loading ? "Loading video…" : "▶ Load full walkthrough"}
        </button>
      )}
      {progress && <p aria-live="polite">{progress}</p>}
      {playUrl && (
        <>
          <p style={{ fontVariantNumeric: "tabular-nums", margin: "8px 0" }}>
            <strong>Video: {formatSeconds(currentSeconds)} / {formatSeconds(playerDuration ?? durationSeconds)}</strong>
            {timelineRepaired ? " · Seekable timeline prepared" : ""}
          </p>
          <video
            key={playUrl}
            src={playUrl}
            controls
            playsInline
            preload="metadata"
            style={{ width: "100%", maxHeight: 380, borderRadius: 8, background: "#111" }}
            onLoadedMetadata={e => {
              const reported = e.currentTarget.duration;
              if (Number.isFinite(reported) && reported > 0 && !timelineRepaired && !durationSeconds) setPlayerDuration(reported);
            }}
            onDurationChange={e => {
              const reported = e.currentTarget.duration;
              if (Number.isFinite(reported) && reported > 0 && !timelineRepaired && !durationSeconds) setPlayerDuration(reported);
            }}
            onTimeUpdate={e => setCurrentSeconds(e.currentTarget.currentTime)}
            onSeeked={e => setCurrentSeconds(e.currentTarget.currentTime)}
            onError={() => setError("This device couldn't play the recording. Open the original in another browser.")}
          />
          <a href={playUrl} target="_blank" rel="noopener noreferrer">Open original recording</a>
        </>
      )}
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
