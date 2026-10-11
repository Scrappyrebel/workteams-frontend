"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// Handles both regular videos and private multipart video manifests.
export default function PrivateWalkthroughPlayer({ url, storagePath }) {
  const multipart = storagePath?.endsWith(".parts.json");
  const [playUrl, setPlayUrl] = useState(multipart ? "" : url);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const objectUrlRef = useRef("");

  useEffect(() => {
    setPlayUrl(multipart ? "" : url);
    setError("");
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    };
  }, [url, multipart]);

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
      const tempUrl = URL.createObjectURL(blob);
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
          <video
            key={playUrl}
            src={playUrl}
            controls
            playsInline
            preload="metadata"
            style={{ width: "100%", maxHeight: 380, borderRadius: 8, background: "#111" }}
            onError={() => setError("This device couldn't play the recording. Open the original in another browser.")}
          />
          <a href={playUrl} target="_blank" rel="noopener noreferrer">Open original recording</a>
        </>
      )}
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
