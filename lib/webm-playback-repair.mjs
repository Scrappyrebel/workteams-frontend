// Read-only playback repair for browser-created WebM files.
// Never write a repaired blob to the server: the original recording is evidence.
const idBytes = (id) => {
  const bytes = [];
  for (let shift = 24; shift >= 0; shift -= 8) {
    const b = (id >>> shift) & 255;
    if (b || bytes.length) bytes.push(b);
  }
  return new Uint8Array(bytes);
};
const vint = (value, fixedWidth) => {
  const width = fixedWidth || Array.from({ length: 8 }, (_, i) => i + 1)
    .find((n) => value < 2 ** (7 * n) - 1);
  if (!width || value < 0 || !Number.isSafeInteger(value)) throw Error('Invalid WebM length.');
  const out = new Uint8Array(width);
  let number = value;
  for (let i = width - 1; i >= 0; i--) { out[i] = number % 256; number = Math.floor(number / 256); }
  out[0] |= 1 << (8 - width);
  return out;
};
const uint64 = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid WebM offset.');
  const out = new Uint8Array(8);
  let n = value;
  for (let i = 7; i >= 0; i--) { out[i] = n % 256; n = Math.floor(n / 256); }
  return out;
};
const ebml = (id, data) => new Uint8Array([...idBytes(id), ...vint(data.length), ...data]);
const join = (parts) => {
  const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let pos = 0; for (const part of parts) { result.set(part, pos); pos += part.length; }
  return result;
};
const read = (data, off, sizeField = false) => {
  if (off < 0 || off >= data.length) throw Error('WebM element out of range.');
  const first = data[off];
  let width = 1;
  while (width <= (sizeField ? 8 : 4) && !(first & (0x80 >> (width - 1)))) width++;
  if (width > (sizeField ? 8 : 4) || off + width > data.length) throw Error('Invalid WebM element header.');
  let n = sizeField ? first & ((1 << (8 - width)) - 1) : first;
  for (let i = 1; i < width; i++) n = n * 256 + data[off + i];
  return { value: sizeField && n === 2 ** (width * 7) - 1 ? Infinity : n, width };
};
const element = (data, off) => {
  const id = read(data, off);
  const size = read(data, off + id.width, true);
  const start = off + id.width + size.width;
  const end = size.value === Infinity ? Infinity : start + size.value;
  if (end > data.length && end !== Infinity) throw Error('Truncated WebM element.');
  return { id: id.value, offset: off, start, end, size: size.value, sizeWidth: size.width };
};
const readUInt = (data, start, end) => {
  if (end - start > 8 || start >= end) return 0;
  let n = 0;
  for (let i = start; i < end; i++) n = n * 256 + data[i];
  return n;
};
const readSigned16 = (a, off) => {
  const n = a[off] * 256 + a[off + 1];
  return n > 32767 ? n - 65536 : n;
};
const float64 = (number) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, number); return b; };

// Checks only container structure and timestamps. Never changes encoded A/V payload.
export async function repairWebmPlayback(blob, durationHint = null) {
  if (!blob || blob.size < 128 || blob.size > 70 * 1024 * 1024 ||
      !/webm/i.test(blob.type)) return null;
  try {
    const data = new Uint8Array(await blob.arrayBuffer());
    let at = 0;
    const header = element(data, at);
    if (header.id !== 0x1A45DFA3 || !Number.isFinite(header.end)) return null;
    at = header.end;
    const segment = element(data, at);
    if (segment.id !== 0x18538067) return null;
    const segmentStart = segment.start;
    let info = null, cuesExist = false, scale = 1000000, videoTrackNumber = 1;
    const oldSeekHeads = [];
    let maxTicks = 0;
    const clusters = [];
    const topEnd = Math.min(data.length, Number.isFinite(segment.end) ? segment.end : data.length);
    let guard = 0;
    at = segmentStart;
    while (at < topEnd && guard++ < 100000) {
      let item = element(data, at);
      if (item.id === 0x1549A966) {
        info = item;
        let pos = item.start;
        while (pos < item.end) {
          const child = element(data, pos);
          if (child.id === 0x2AD7B1) scale = readUInt(data, child.start, child.end) || scale;
          pos = child.end;
        }
      }
      if (item.id === 0x1654AE6B && Number.isFinite(item.end)) {
        let trackPos = item.start;
        while (trackPos < item.end) {
          const entry = element(data, trackPos);
          if (entry.id === 0xAE) {
            let type = 0, number = 0, field = entry.start;
            while (field < entry.end) {
              const sub = element(data, field);
              if (sub.id === 0x83) type = readUInt(data, sub.start, sub.end);
              if (sub.id === 0xD7) number = readUInt(data, sub.start, sub.end);
              field = sub.end;
            }
            if (type === 1 && number > 0) videoTrackNumber = number;
          }
          trackPos = entry.end;
        }
      }
      if (item.id === 0x1C53BB6B) cuesExist = true;
      if (item.id === 0x114D9B74) oldSeekHeads.push(item);
      if (item.id === 0x1F43B675) {
        let clusterTime = 0, maxOffset = 0, keyframe = false;
        const stop = Math.min(Number.isFinite(item.end) ? item.end : topEnd, topEnd);
        let pos = item.start;
        let nestedCount = 0;
        while (pos < stop && nestedCount++ < 250000) {
          const child = element(data, pos);
          // A new level-1 element ends an unknown-sized MediaRecorder cluster.
          if ((child.id === 0x1F43B675 || child.id === 0x1C53BB6B || child.id === 0x1549A966 || child.id === 0x1654AE6B)
              && item.end === Infinity) break;
          if (!Number.isFinite(child.end) || child.end > stop || child.end <= pos) return null;
          if (child.id === 0xE7) clusterTime = readUInt(data, child.start, child.end);
          if (child.id === 0xA3 && child.end - child.start >= 4) {
            try {
              const track = read(data, child.start, true);
              const offsetAt = child.start + track.width;
              if (offsetAt + 3 <= child.end) {
                maxOffset = Math.max(maxOffset, readSigned16(data, offsetAt));
                if (track.value === videoTrackNumber && (data[offsetAt + 2] & 0x80)) keyframe = true;
              }
            } catch { /* keep last reliable timestamp */ }
          }
          pos = child.end;
        }
        clusters.push({ offset: item.offset, time: clusterTime, keyframe });
        maxTicks = Math.max(maxTicks, clusterTime + maxOffset);
        if (item.end === Infinity) { at = pos; continue; }
      }
      if (item.end === Infinity || item.end <= at) return null;
      at = item.end;
    }
    if (!info || !clusters.length || cuesExist || !Number.isFinite(info.end)) return null;
    const inferred = ((maxTicks * scale) / 1e9) + 0.04;
    const hint = Number(durationHint);
    // Accept verified recorded-active-time metadata if close to container timestamps.
    const duration = hint > 0 && hint <= 600 && Math.abs(hint - inferred) < 15 ? hint : inferred;
    if (!Number.isFinite(duration) || duration < 1 || duration > 610) return null;
    let pos = info.start;
    const infoParts = [];
    while (pos < info.end) {
      const child = element(data, pos);
      if (!Number.isFinite(child.end) || child.end <= pos || child.end > info.end) return null;
      if (child.id !== 0x4489) infoParts.push(data.slice(pos, child.end));
      pos = child.end;
    }
    const replacementInfo = ebml(0x1549A966, join([...infoParts, ebml(0x4489, float64(duration * 1e9 / scale))]));
    // Fixed-width 8-byte CueClusterPosition values avoid offsets changing as the index grows.
    // Compute the cue length and SeekHead length first, then update all relative positions.
    const seekEntry = (pos) => ebml(0x4DBB, join([
      ebml(0x53AB, idBytes(0x1C53BB6B)), ebml(0x53AC, uint64(pos)),
    ]));
    const seekHeadStub = ebml(0x114D9B74, seekEntry(0));
    const extraInfo = replacementInfo.length - (info.end - info.offset);
    const bytesRemoved = oldSeekHeads.reduce((n, h) => n + h.end - h.offset, 0);
    const removedBefore = (offset) => oldSeekHeads.reduce((n, h) =>
      n + (h.offset < offset ? h.end - h.offset : 0), 0);
    const newClusterPosition = (c) => c.offset - segmentStart + seekHeadStub.length +
      (c.offset >= info.end ? extraInfo : 0) - removedBefore(c.offset);
    const indexedClusters = clusters.filter(c => c.keyframe);
    if (!indexedClusters.length) return null;
    const cues = ebml(0x1C53BB6B, join(indexedClusters.map(c => ebml(0xBB, join([
      ebml(0xB3, uint64(c.time)),
      ebml(0xB7, join([ebml(0xF7, new Uint8Array([videoTrackNumber])), ebml(0xF1, uint64(newClusterPosition(c)))])),
    ])))));
    const segmentBodySize = topEnd - segmentStart - bytesRemoved + seekHeadStub.length + extraInfo + cues.length;
    const cuePosition = segmentBodySize - cues.length;
    const seekHead = ebml(0x114D9B74, seekEntry(cuePosition));
    if (seekHead.length !== seekHeadStub.length) return null;
    const segmentSize = segment.size === Infinity
      ? data.slice(segment.offset + 4, segment.start)
      : vint(segmentBodySize, segment.sizeWidth);
    const head = data.slice(0, segment.offset);
    const splicePoints = [...oldSeekHeads.map(h => ({ from: h.offset, to: h.end, bytes: null })),
      { from: info.offset, to: info.end, bytes: replacementInfo }]
      .sort((a, b) => a.from - b.from);
    const parts = [head, idBytes(0x18538067), segmentSize, seekHead];
    let copyFrom = segmentStart;
    for (const point of splicePoints) {
      if (point.from < copyFrom || point.to > topEnd) return null;
      parts.push(blob.slice(copyFrom, point.from));
      if (point.bytes) parts.push(point.bytes);
      copyFrom = point.to;
    }
    parts.push(blob.slice(copyFrom, topEnd), cues, blob.slice(topEnd));
    const repaired = new Blob(parts, { type: blob.type });
    return { blob: repaired, durationSeconds: duration, clusters: clusters.length };
  } catch {
    return null; // original remains playable if metadata is unusual or corrupt.
  }
}
