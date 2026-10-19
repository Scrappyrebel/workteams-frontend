import test from "node:test";
import assert from "node:assert/strict";
import { assessTelegramEvidence, privateTelegramConfig,
  sendEvidenceToPrivateTelegram, TELEGRAM_FREE_BOT_MAX_BYTES } from "../lib/telegram-evidence.server.mjs";

const environment = { TELEGRAM_EVIDENCE_ENABLED: "true",
  TELEGRAM_EVIDENCE_BOT_TOKEN: "123456:" + "A".repeat(36),
  TELEGRAM_EVIDENCE_CHAT_ID: "-1001234567890" };
const blob = (size = 128, type = "image/jpeg") => new Blob([new Uint8Array(size)], { type });
test("feature is disabled by default and requires a private destination", async () => {
  assert.equal(privateTelegramConfig({}), null);
  assert.equal(privateTelegramConfig({ ...environment,
    TELEGRAM_EVIDENCE_CHAT_ID: "@public" }), null);
  assert.equal(privateTelegramConfig({ ...environment,
    TELEGRAM_EVIDENCE_BOT_TOKEN: "bad" }), null);
  const r = await sendEvidenceToPrivateTelegram({
    kind: "book_photo", media: blob(), environment: {},
    fetcher: () => { throw new Error("must never send"); } });
  assert.deepEqual(r, { ok: false, reason: "telegram_disabled_or_unconfigured" });
});
test("original photos are preserved as documents and MP4 uses video", () => {
  assert.equal(assessTelegramEvidence({kind:"book_photo",media:blob()}).method,"sendDocument");
  assert.equal(assessTelegramEvidence({kind:"shift_video",
    media:blob(100,"video/mp4")}).method,"sendVideo");
  assert.equal(assessTelegramEvidence({kind:"shift_video",
    media:blob(100,"video/webm")}).method,"sendDocument");
  assert.equal(assessTelegramEvidence({kind:"book_photo",
    media:blob(100,"text/html")}).eligible,false);
  assert.equal(assessTelegramEvidence({kind:"shift_video",
    media:{size:TELEGRAM_FREE_BOT_MAX_BYTES+1,type:"video/mp4"}}).eligible,false);
});
test("only verified private channel receipt counts as provider accepted",async()=>{
  let calls=0;
  const ok=await sendEvidenceToPrivateTelegram({
    kind:"book_photo",media:blob(),environment,
    fetcher:async(url,options)=>{
      calls++;
      assert.match(url,/^https:\/\/api\.telegram\.org\/bot123456:/);
      assert.equal(options.method,"POST");
      assert.equal(options.body.get("chat_id"),environment.TELEGRAM_EVIDENCE_CHAT_ID);
      assert.equal(options.body.get("allow_paid_broadcast"),"false");
      assert.equal(options.body.get("protect_content"),"true");
      assert.equal(options.body.get("document").size,128);
      return {ok:true,json:async()=>({ok:true,result:{
        message_id:14,chat:{id:-1001234567890}}})};
    }});
  assert.equal(calls,1);
  assert.equal(ok.ok,true);
  assert.equal(ok.humanReceiptVerified,false);
  const wrong=await sendEvidenceToPrivateTelegram({
    kind:"book_photo",media:blob(),environment,
    fetcher:async()=>({ok:true,json:async()=>({ok:true,result:{
      message_id:99,chat:{id:-1009999999999}}})})});
  assert.equal(wrong.ok,false);
  assert.equal(wrong.reason,"telegram_receipt_unverified");
});
test("provider failure and rate limits never cause paid retries",async()=>{
  let sends=0;
  const refused=await sendEvidenceToPrivateTelegram({
    kind:"book_photo",media:blob(),environment,
    fetcher:async()=>{sends++;return {ok:false,status:429};}});
  assert.equal(sends,1);
  assert.deepEqual(refused,{ok:false,reason:"telegram_rate_limited"});
  const network=await sendEvidenceToPrivateTelegram({
    kind:"book_photo",media:blob(),environment,
    fetcher:async()=>{throw Error("network");}});
  assert.deepEqual(network,{ok:false,reason:"telegram_transport_failed"});
});
