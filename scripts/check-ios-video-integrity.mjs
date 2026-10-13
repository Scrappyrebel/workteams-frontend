import assert from "node:assert/strict";
import fs from "node:fs";
import { chooseRecorderMimeType, inspectRecordedMp4 } from "../lib/recording-integrity.mjs";
const supported = () => true;
const playable = () => "probably";
const iosType = chooseRecorderMimeType({isIOS:true,isSupported:supported,canPlay:playable});
assert.equal(iosType,"video/webm;codecs=vp8,opus",
  "iPhone with playable WebM must avoid broken Safari MP4-first encoding");
const androidType = chooseRecorderMimeType({isIOS:false,isSupported:supported,canPlay:playable});
assert.equal(androidType,'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "Android established format remains unchanged");
const iosFallback = chooseRecorderMimeType({isIOS:true,isSupported:supported,canPlay:() => ""});
assert.equal(iosFallback,'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "No unplayable WebM may be recorded when iOS lacks playback support");
const selective = chooseRecorderMimeType({
  isIOS:true,
  isSupported:t=>t==='video/webm',
  canPlay:t=>t==='video/webm'?'maybe':'',
});
assert.equal(selective,'video/webm');

function box(type, payload) {
  const start=Buffer.alloc(8);
  start.writeUInt32BE(8+payload.length);
  start.write(type,4,'ascii');
  return Buffer.concat([start,payload]);
}
function track(type,sec) {
  const mdhd=Buffer.alloc(24);
  mdhd.writeUInt32BE(1000,12);
  mdhd.writeUInt32BE(Math.round(sec*1000),16);
  const hdlr=Buffer.alloc(20);
  hdlr.write(type,8,'ascii');
  return box('trak',box('mdia',Buffer.concat([box('mdhd',mdhd),box('hdlr',hdlr)])));
}
const mp4=(video,audio) => {
  const tracks=[];
  if(video!==null)tracks.push(track('vide',video));
  if(audio!==null)tracks.push(track('soun',audio));
  return new Blob([Buffer.concat([box('ftyp',Buffer.alloc(8)),box('moov',Buffer.concat(tracks)),box('mdat',Buffer.alloc(100))])],{type:'video/mp4'});
};
const defective=await inspectRecordedMp4(mp4(35,317));
assert.equal(defective.status,'warning',"35s picture with 5m17s audio is defective");
assert.equal(defective.reason,'video-ends-before-audio');
assert.equal(defective.videoSeconds,35);
assert.equal(defective.audioSeconds,317);
const good=await inspectRecordedMp4(mp4(310,317));
assert.notEqual(good.status,'warning',"minor audio/video timing differences should not be false alarms");
const absent=await inspectRecordedMp4(mp4(null,317));
assert.equal(absent.status,'warning',"audio-only MP4 is not acceptable video proof");
assert.equal((await inspectRecordedMp4(new Blob(['x'],{type:'video/webm'}))).status,'unchecked',
  "WebM detection cannot falsely claim its full video has been validated");
const app=fs.readFileSync('components/EndShiftProof.js','utf8');
assert.ok(app.includes('chooseRecorderMimeType({') &&
  app.includes('navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1') &&
  app.includes('inspectRecordedMp4(blob)') &&
  app.includes('if (!integrityWarningRef.current) onProofUploaded?.(entryId);') &&
  app.includes('notes: integrityWarningRef.current || null') &&
  app.includes('await uploadVideo(blob)'),
  "Camera capture must inspect audio/video mismatch, preserve and upload original but never auto-approve defective proof");
assert.ok(app.includes("if (isiOS) recorder.start();") &&
  app.includes("else recorder.start(3000);"),
  "iOS should continue recording without Safari timeslice");
console.log("WorkTeams iPhone/iPad video-format and corruption-detection guards passed.");
