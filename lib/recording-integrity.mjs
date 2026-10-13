// Browser-independent recording format selection and best-effort MP4 health.
// WorkTeams records on Android, iPhone and iPad, including iPads that identify
// as desktop Macintosh. The video must be playable as well as storable.
export function chooseRecorderMimeType({ isIOS, isSupported, canPlay }) {
  // WebKit has had regressions where recorded MP4 video abruptly ends but its
  // audio continues. Prefer WebM on Apple devices ONLY when this exact browser
  // both RECORDS and PLAYS it; otherwise retain MP4/H.264 + AAC fallback.
  const mp4 = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs="avc1.42E01E"',
    "video/mp4",
  ];
  const webm = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const ordered = isIOS ? [...webm, ...mp4] : [...mp4, ...webm];
  return ordered.find((t) => {
    try {
      return !!isSupported(t) && (!isIOS || !t.startsWith("video/webm") || !!canPlay(t));
    } catch {
      return false;
    }
  }) || "";
}

const ascii = (view, pos, count) => {
  let s = "";
  for (let i = 0; i < count; i++) s += String.fromCharCode(view.getUint8(pos + i));
  return s;
};

function boxes(view, begin, until) {
  const result = [];
  let cursor = begin;
  while (cursor + 8 <= until) {
    let bytes = view.getUint32(cursor);
    const type = ascii(view, cursor + 4, 4);
    let header = 8;
    if (bytes === 1) {
      if (cursor + 16 > until) break;
      const big = view.getBigUint64(cursor + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) break;
      bytes = Number(big);
      header = 16;
    } else if (bytes === 0) {
      bytes = until - cursor;
    }
    if (bytes < header || cursor + bytes > until) break;
    result.push({ type, start: cursor + header, end: cursor + bytes });
    cursor += bytes;
  }
  return result;
}

function trackDuration(view, track) {
  const mdia = boxes(view, track.start, track.end).find((box) => box.type === "mdia");
  if (!mdia) return null;
  const mdiaParts = boxes(view, mdia.start, mdia.end);
  const handler = mdiaParts.find((box) => box.type === "hdlr");
  const header = mdiaParts.find((box) => box.type === "mdhd");
  if (!handler || !header || handler.start + 12 > handler.end ||
      header.start + 20 > header.end) return null;
  const type = ascii(view, handler.start + 8, 4);
  const version = view.getUint8(header.start);
  let timescale;
  let ticks;
  if (version === 0) {
    timescale = view.getUint32(header.start + 12);
    ticks = view.getUint32(header.start + 16);
  } else if (version === 1 && header.start + 32 <= header.end) {
    timescale = view.getUint32(header.start + 20);
    const value = view.getBigUint64(header.start + 24);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    ticks = Number(value);
  } else return null;
  if (!timescale || !ticks || !Number.isFinite(ticks / timescale)) return null;
  return { type, seconds: ticks / timescale };
}

// This cannot prove that every frame is moving. It DOES catch MP4s whose video
// track stops at ~35 s while audio continues to ~5 min, without confusing
// successful network/storage upload with complete captured picture.
// If metadata is unavailable, report "unchecked" rather than a false pass.
export async function inspectRecordedMp4(blob) {
  if (!String(blob?.type || "").includes("mp4")) return { status: "unchecked", reason: "non-mp4" };
  if (!blob.size || blob.size > 50 * 1024 * 1024) return { status: "unchecked", reason: "large" };
  try {
    const view = new DataView(await blob.arrayBuffer());
    const moov = boxes(view, 0, view.byteLength).find((box) => box.type === "moov");
    if (!moov) return { status: "unchecked", reason: "no-moov" };
    const tracks = boxes(view, moov.start, moov.end)
      .filter((box) => box.type === "trak")
      .map((box) => trackDuration(view, box)).filter(Boolean);
    const video = tracks.filter((t) => t.type === "vide").reduce((m, t) => Math.max(m, t.seconds), 0);
    const audio = tracks.filter((t) => t.type === "soun").reduce((m, t) => Math.max(m, t.seconds), 0);
    if (!video) return { status: "warning", reason: "no-video-track", videoSeconds: video, audioSeconds: audio };
    if (audio >= 30 && audio - video >= 8 && video < audio * 0.85) {
      return { status: "warning", reason: "video-ends-before-audio", videoSeconds: video, audioSeconds: audio };
    }
    return { status: "unchecked", reason: audio ? "no-obvious-duration-mismatch" : "no-audio-duration", videoSeconds: video, audioSeconds: audio };
  } catch {
    return { status: "unchecked", reason: "metadata-unreadable" };
  }
}
