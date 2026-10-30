import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readPrivateB2MediaConfig,createPrivateMediaObjectKey,presignPrivateB2Object} from "../lib/workteams-private-b2.mjs";
const company="a005319f-47c8-43bf-a5e5-89cf4b39467d";
const entry="9d790983-cc7a-4854-8a3b-b8fec66ad9c5";
assert.equal(readPrivateB2MediaConfig({}),null,"B2 stays off until separately configured");
const base={WORKTEAMS_B2_PRIVATE_MEDIA_ENABLED:"true",WORKTEAMS_B2_MEDIA_REGION:"us-east-005",WORKTEAMS_B2_MEDIA_BUCKET:"lillybs-workteams-media-2026",WORKTEAMS_B2_MEDIA_KEY_ID:"fake",WORKTEAMS_B2_MEDIA_APPLICATION_KEY:"test_secret"};
assert.throws(()=>readPrivateB2MediaConfig({...base,WORKTEAMS_B2_MEDIA_BUCKET:"lillybs-workforce-media-2026"}),/Recovery buckets/,"Never use Workforce private B2 bucket");
assert.throws(()=>readPrivateB2MediaConfig({...base,WORKTEAMS_B2_MEDIA_BUCKET:"hq-video-recovery-2026"}),/Recovery buckets/);
const config=readPrivateB2MediaConfig(base);
const key=createPrivateMediaObjectKey({productId:"workteams",companyId:company,entryId:entry,kind:"shift_video"});
assert.match(key,/^workteams\//);
assert.throws(()=>createPrivateMediaObjectKey({productId:"workforce",companyId:company,entryId:entry,kind:"shift_video"}),/Invalid tenant/);
const signed=presignPrivateB2Object({config,method:"PUT",objectKey:key,contentType:"video/mp4",at:new Date("2026-10-30T12:00:00Z")});
assert.ok(signed.signedUrl.startsWith("https://s3.us-east-005.backblazeb2.com/"));
assert.ok(!signed.signedUrl.includes(base.WORKTEAMS_B2_MEDIA_APPLICATION_KEY));
assert.ok(!signed.headers.Authorization);
const route=readFileSync(new URL("../app/api/shift-media/b2/route.js",import.meta.url),"utf8");
for(const guard of ["WORKTEAMS_B2_UPLOAD_ENABLED", "company_members", "time_entries", '.eq("member_id",member.id)', "createPrivateMediaObjectKey", "presignPrivateB2Object", "timingSafeEqual", 'action!=="verify"', 'status:"verified-not-attached"', 'method:"HEAD"'])
 assert.ok(route.includes(guard),"Missing authenticated B2 rollout safeguard: "+guard);
assert.ok(!route.includes('from("shift_videos").insert'),"Never attach B2 evidence before private playback is finished");
const access=readFileSync(new URL("../app/api/shift-media/b2-access/route.js",import.meta.url),"utf8");
for(const marker of ['company_members', 'shift_videos', 'video_expires_at', 'timingSafeEqual', 'presignPrivateB2Object', 'method:"GET"'])
 assert.ok(access.includes(marker),"Private video playback protection missing: "+marker);
const player=readFileSync(new URL("../components/PrivateWalkthroughPlayer.js",import.meta.url),"utf8");
assert.ok(player.includes('info?.kind === "workteams-b2-parts"'),"B2 private video manifest must be handled by player");
assert.ok(player.includes("/api/shift-media/b2-access?companyId="),"B2 player must use server-authorized access");
const uploader=readFileSync(new URL("../lib/workteams-b2-client.js",import.meta.url),"utf8");
const endShift=readFileSync(new URL("../components/EndShiftProof.js",import.meta.url),"utf8");
assert.ok(uploader.includes('NEXT_PUBLIC_WORKTEAMS_B2_ENABLED!=="true"'),"B2 must remain opt-in");
assert.ok(uploader.includes('action:"verify"'),"All B2 parts must be verified");
assert.ok(uploader.includes('AbortSignal.timeout(45000)'),"Stalled B2 uploads must terminate");
assert.ok(endShift.includes("await uploadWorkTeamsB2Video({"),"Recorded shift video should try B2 primary");
assert.ok(endShift.includes("catch (primaryError)"),"B2 failures must lead to Supabase");
assert.ok(endShift.includes("} else if (multipart) {"),"Existing multipart fallback must remain intact");
assert.ok(endShift.includes("await uploadTusFile("),"Existing resumable Supabase uploader must remain intact");
const manager=readFileSync(new URL("../app/app/[companyId]/shift-videos/page.js",import.meta.url),"utf8");
const cron=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url),"utf8"));
assert.ok(route.includes("WORKTEAMS_B2_RETENTION_ENABLED"),"Private B2 seven-day cleanup must be guarded");
assert.ok(route.includes('req.headers.get("authorization")!=="Bearer "+process.env.CRON_SECRET'),"Retention cannot run without cron secret");
assert.ok(route.includes('video_expires_at'),"Cleanup must respect the saved expiry");
assert.ok(route.includes('.eq("keep_video",false)'),"Held videos must be exempt from automatic cleanup");
assert.ok(route.includes('method:"DELETE"'),"Cleanup must target exact private versions");
assert.ok(route.includes('versionId:part.versionId'),"Never delete B2 objects without exact version IDs");
assert.ok(route.includes('timingSafeEqual(a,b)'),"Cleanup must authenticate the private manifest");
assert.ok(route.includes('action==="delete"'),"Manager delete must use authenticated server route");
assert.ok(manager.includes('manifest.kind === "workteams-b2-parts"'),"Manager interface must recognize B2 video");
assert.ok(manager.includes('action: "delete"'),"Manager deletion must call server-side version cleanup");
assert.ok(cron.crons.some(x=>x.path==="/api/shift-media/b2"),"Safe B2 cleanup cron must be registered");
const exportSource=readFileSync(new URL("../lib/evidence-export.js",import.meta.url),"utf8");
assert.ok(exportSource.includes('manifest?.kind === "workteams-b2-parts"'),"Owner export must support B2 private manifests");
assert.ok(exportSource.includes("/api/shift-media/b2-access?companyId="),"B2 export must request authorized private playback");
assert.ok(exportSource.includes("bytes !== receipt.totalBytes"),"Owner export must confirm exact original bytes");
assert.ok(exportSource.includes('mimeType === "video/webm" ? "webm"'),"Export must preserve WebM extension");
assert.ok(manager.includes('evidenceFilename("video", video.video_url, label, blob.type)'),"Video share filename must preserve true MIME");
const recovery=readFileSync(new URL("../app/api/cron/workteams-b2-recovery/route.js",import.meta.url),"utf8");
for(const guard of [
  'process.env.WORKTEAMS_B2_RECOVERY_ENABLED!=="true"',
  'request.headers.get("authorization")!=="Bearer "+process.env.CRON_SECRET',
  'verifyScope(index,video)',
  'timingSafeEqual(a,b)',
  'blob.size',
  'video_url:b2IndexPath',
  '.eq("video_url",video.video_url)',
  'SOURCE_PART_BYTES',
  'B2_PART_BYTES',
  'method:"HEAD"',
  'method:"PUT"',
  '.remove(present)',
  'index.migratedAt<60*60000',
])
 assert.ok(recovery.includes(guard),"Private recovery safeguard missing: "+guard);
assert.ok(cron.crons.some(x=>x.path==="/api/cron/workteams-b2-recovery"),
  "Supabase fallback recovery cron must be scheduled");
console.log("WorkTeams private B2 foundation security checks passed; uploads remain disabled.");
