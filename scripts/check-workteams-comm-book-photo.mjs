import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=readFileSync(new URL("../app/app/[companyId]/comm-book/page.js",import.meta.url),"utf8");
const start=file.indexOf("async function handleSave()");
const end=file.indexOf("async function handleRespond(",start);
const source=file.slice(start,end);
assert.ok(source.length>500,"Communication Book write handler must exist");
for(const token of [
 'sb.storage.from("inspection-photos").info(path)',
 'Number(photoReceipt.size) !== photo.size',
 '.select("id,company_id,member_id,photo_url").single()',
 'savedEntry.company_id !== company.id',
 'savedEntry.member_id !== member.id',
 'savedEntry.photo_url !== photoUrl',
]) assert.ok(source.includes(token),"Missing verified Communication Book receipt: "+token);
assert.ok(source.indexOf('Number(photoReceipt.size) !== photo.size')<
 source.indexOf('sb.from("comm_book").insert'),"Verify photo object before saving record");
assert.ok(source.indexOf('savedEntry.photo_url !== photoUrl')<
 source.indexOf('setPhoto(null)'),"Do not release original photo before receipt check");
console.log("WorkTeams Communication Book photo and database receipt safeguards passed.");
