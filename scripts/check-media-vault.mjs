// Media vault — offline proof capture (Wendy, 2026-11-18: the
// walkthrough video and book picture must capture offline and upload
// on reconnect, and the saved-offline state must be unmistakable).
//
// The design pinned here:
//   * lib/media-vault.mjs is a durable IndexedDB store (one item per
//     entry per kind). It stores Blobs and uploads NOTHING itself.
//   * EndShiftProof writes every capture to the vault BEFORE the
//     first upload attempt (video after its integrity inspection,
//     photo when chosen) and removes the item only after its own
//     verified upload succeeds. The existing upload code — B2
//     primary, TUS fallback, multipart manifest, read-back
//     verification — is untouched; the vault drains through it.
//   * On mount and on reconnect, EndShiftProof restores a vaulted
//     item for its entry and runs it through that same upload path.
//   * The time page shows a saved-on-this-phone banner with the
//     waiting count, so vaulted proof is never invisible.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("vault lib is a durable blob store that uploads nothing itself", async () => {
  const lib = await import("../lib/media-vault.mjs");
  assert.equal(lib.MEDIA_VAULT_DB_NAME, "workteams-media-vault");
  assert.equal(lib.vaultKey("e1", "video"), "e1:video");
  const src = read("lib/media-vault.mjs");
  assert.ok(src.includes("indexedDB.open"), "IndexedDB-backed");
  assert.ok(!src.includes("fetch("), "the vault never uploads");
  // Memory fallback round-trip (no IndexedDB in this environment).
  const item = { kind: "photo", companyId: "c1", entryId: "e1", memberId: "m1", blob: { size: 3 }, mime: "image/jpeg", fileName: "b.jpg" };
  assert.equal(await lib.vaultPut(item), true);
  assert.equal(await lib.vaultCountFor({ companyId: "c1", memberId: "m1" }), 1);
  assert.equal((await lib.vaultGet("e1", "photo")).fileName, "b.jpg");
  assert.equal(await lib.vaultCountFor({ companyId: "c1", memberId: "other" }), 0);
  await lib.vaultRemove("e1", "photo");
  assert.equal(await lib.vaultCountFor({ companyId: "c1", memberId: "m1" }), 0);
});

test("EndShiftProof vaults captures before upload and removes them only on success", () => {
  const src = read("components/EndShiftProof.js");
  for (const needle of [
    'import { vaultPut, vaultGet, vaultRemove } from "../lib/media-vault.mjs";',
    'kind: "video", companyId, entryId, memberId,',
    'kind: "photo", companyId, entryId, memberId,',
    'void vaultRemove(entryId, "video");',
    'void vaultRemove(entryId, "photo");',
    "📴 Saved on this phone — it will upload itself when you have signal.",
  ]) {
    assert.ok(src.includes(needle), `EndShiftProof keeps: ${needle}`);
  }
  // The vault-put for the video sits before the first upload attempt.
  const putAt = src.indexOf('kind: "video", companyId, entryId, memberId,');
  const uploadAt = src.indexOf("await uploadVideo(blob);");
  assert.ok(putAt > -1 && uploadAt > putAt, "video is vaulted before uploadVideo runs");
});

test("EndShiftProof drains its entry's vault through the same upload path", () => {
  const src = read("components/EndShiftProof.js");
  for (const needle of [
    'await vaultGet(entryId, "video")',
    'await vaultGet(entryId, "photo")',
    "await uploadVideo(item.blob);",
    "await uploadPhoto(file);",
    'window.addEventListener("online", onOnline);',
    "This recording was saved on this phone",
    "This book photo was saved on this phone",
  ]) {
    assert.ok(src.includes(needle), `drain keeps: ${needle}`);
  }
});

test("time page banner makes saved-offline proof unmistakable", () => {
  const page = read("app/app/[companyId]/time/page.js");
  for (const needle of [
    'import { vaultCountFor } from "../../../../lib/media-vault.mjs";',
    "vaultCountFor({ companyId: company.id, memberId: member.id })",
    "proof item{vaultCount === 1 ? \"\" : \"s\"} saved on this phone, waiting to upload.",
  ]) {
    assert.ok(page.includes(needle), `time page keeps: ${needle}`);
  }
});
