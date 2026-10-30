import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/cron/workteams-b2-recover/route.js",import.meta.url),"utf8");
for(const token of [
  'process.env.VERCEL_ENV!=="production"',
  'request.headers.get("authorization")!=="Bearer "+process.env.CRON_SECRET',
  'WORKTEAMS_B2_RECOVERY_ENABLED!=="true"',
  'WORKTEAMS_B2_PRIVATE_MEDIA_ENABLED:"true"',
  'time_entry_id',
  'company_id',
  'member_id',
  'row.keep_video===false',
  'SOURCE_MAX=40*1024*1024',
  'PART_BYTES=20*1024*1024',
  'manifest.kind!=="workteams-walkthrough-parts"',
  'versionId=await b2Head(config,part)',
  'stored.ok',
  'checkIndex(JSON.parse(await existing.text()),config)',
  '.eq("video_url",row.video_url)',
  '.eq("keep_video",false)',
  'recoveredAt:new Date().toISOString()',
  'Date.now()-60*60000',
  '(await b2Head(config,part))!==part.versionId',
  'db.storage.from(STORAGE).remove(unsigned.sourcePaths)',
  'process.env.NEXT_PUBLIC_SUPABASE_URL',
]) assert.ok(route.includes(token),"Missing protected B2 recovery safeguard: "+token);
assert.ok(!route.includes('console.log("Bearer'),'No authentication logging permitted');
const json=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url),"utf8"));
assert.ok(json.crons.some(x=>x.path==="/api/cron/workteams-b2-recover"),"Recovery cron must be scheduled.");
console.log("WorkTeams automatic backup B2 recovery code protections passed (live transfer not verified).");
