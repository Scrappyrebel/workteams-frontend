import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../components/ShiftVideoQuick.js",import.meta.url),"utf8");
const start=source.indexOf("async function startUpload(");
const end=source.indexOf("  if (done)",start);
const upload=source.slice(start,end);
for(const term of ["await uploadShiftVideoSafely(","sb.storage.from(\"shift-videos\").info(path)","sb.from(\"shift_videos\").select(\"id,video_url,file_size_bytes\")","Number(linked.file_size_bytes) !== file.size","setDone(true)"])
 assert.ok(upload.includes(term),"WorkTeams proof receipt check missing: "+term);
assert.ok(upload.indexOf("setDone(true)")>upload.indexOf("Number(linked.file_size_bytes) !== file.size"),"Must not claim success before verifying proof.");
console.log("WorkTeams verified video upload receipt regression passed.");
