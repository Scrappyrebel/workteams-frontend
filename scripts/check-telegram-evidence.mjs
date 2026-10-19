import test from "node:test";
import assert from "node:assert/strict";
import { assessTelegramEvidence, privateTelegramConfig,
  sendEvidenceToPrivateTelegram, TELEGRAM_FREE_BOT_MAX_BYTES } from "../lib/telegram-evidence.server.mjs";

const APP_LABEL = "WorkTeams";
const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const CHAT_A = "-1001234567890";
const CHAT_B = "-1009876543210";
const environment = { TELEGRAM_EVIDENCE_ENABLED: "true",
  TELEGRAM_EVIDENCE_BOT_TOKEN: "123456:" + "A".repeat(36),
  TELEGRAM_EVIDENCE_COMPANY_GROUPS_JSON: JSON.stringify({
    [COMPANY_A]: CHAT_A, [COMPANY_B]: CHAT_B,
  }),
};
const blob = (size = 128, type = "image/jpeg") => new Blob([new Uint8Array(size)], { type });
const config = (verifiedCompanyId, env = environment) =>
  privateTelegramConfig({ verifiedCompanyId, environment: env });
const deliver = (verifiedCompanyId, fetcher, env = environment) =>
  sendEvidenceToPrivateTelegram({verifiedCompanyId,kind:"book_photo",media:blob(),
    environment:env,fetcher});

test("feature is OFF until independently configured for a verified company", async () => {
  assert.equal(config(COMPANY_A, {}), null);
  assert.equal(config(COMPANY_A, { ...environment,
    TELEGRAM_EVIDENCE_ENABLED: "false" }), null);
  assert.equal(config(COMPANY_A, { ...environment,
    TELEGRAM_EVIDENCE_BOT_TOKEN: "bad" }), null);
  assert.equal(config(undefined), null);
  assert.equal(config("company-not-registered"), null);
  const r = await deliver(COMPANY_A, () => { throw Error("not called"); }, {});
  assert.deepEqual(r, {ok:false,reason:"telegram_disabled_or_unconfigured"});
});
test("every company gets only its OWN Telegram group", async () => {
  assert.equal(config(COMPANY_A).chatId, CHAT_A);
  assert.equal(config(COMPANY_B).chatId, CHAT_B);
  const seen = [];
  const sendMock = async (_url, options) => {
    const chatId = options.body.get("chat_id");
    seen.push(chatId);
    return {ok:true,json:async()=>({ok:true,result:{
      message_id:13,chat:{id:Number(chatId)}}})};
  };
  assert.equal((await deliver(COMPANY_A, sendMock)).ok, true);
  assert.equal((await deliver(COMPANY_B, sendMock)).ok, true);
  assert.deepEqual(seen, [CHAT_A, CHAT_B]);
});
test("invalid, duplicate or public group mapping fails CLOSED for all companies", async () => {
  for (const groups of [
    { [COMPANY_A]: CHAT_A, [COMPANY_B]: CHAT_A },
    { [COMPANY_A]: "@public" },
    { [COMPANY_A]: "123456789" },
    { [COMPANY_A]: CHAT_A, "bad company": CHAT_B },
    [],
  ]) {
    const env = { ...environment, TELEGRAM_EVIDENCE_COMPANY_GROUPS_JSON: JSON.stringify(groups) };
    assert.equal(config(COMPANY_A, env), null);
    const result = await deliver(COMPANY_A, () => {throw Error("must not send");}, env);
    assert.equal(result.ok, false);
  }
  assert.equal(config(COMPANY_A,{...environment,
    TELEGRAM_EVIDENCE_COMPANY_GROUPS_JSON:"not json"}),null);
  // The old single global destination MUST NOT be used as a fallback.
  const legacyOnly = {TELEGRAM_EVIDENCE_ENABLED:"true",
    TELEGRAM_EVIDENCE_BOT_TOKEN:environment.TELEGRAM_EVIDENCE_BOT_TOKEN,
    TELEGRAM_EVIDENCE_CHAT_ID:CHAT_A};
  assert.equal(config(COMPANY_A,legacyOnly),null);
});
test("photos stay original documents; video caps avoid paid fallback", () => {
  assert.equal(assessTelegramEvidence({kind:"book_photo",media:blob()}).method,"sendDocument");
  assert.equal(assessTelegramEvidence({kind:"book_photo",media:blob()}).caption,
    APP_LABEL+" — communication book photo");
  assert.equal(assessTelegramEvidence({kind:"shift_video",media:blob(100,"video/mp4")}).caption,
    APP_LABEL+" — shift video");
  assert.equal(assessTelegramEvidence({kind:"shift_video",
    media:blob(100,"video/mp4")}).method,"sendVideo");
  assert.equal(assessTelegramEvidence({kind:"shift_video",
    media:blob(100,"video/webm")}).method,"sendDocument");
  assert.equal(assessTelegramEvidence({kind:"book_photo",media:blob(100,"text/html")}).eligible,false);
  assert.equal(assessTelegramEvidence({kind:"shift_video",
    media:{size:TELEGRAM_FREE_BOT_MAX_BYTES+1,type:"video/mp4"}}).eligible,false);
});
test("receipt must match that company's private destination",async()=>{
  let calls=0;
  const ok=await deliver(COMPANY_A,async(url,options)=>{
    calls++;
    assert.match(url,/^https:\/\/api\.telegram\.org\/bot123456:/);
    assert.equal(options.method,"POST");
    assert.equal(options.body.get("chat_id"),CHAT_A);
    assert.equal(options.body.get("allow_paid_broadcast"),"false");
    assert.equal(options.body.get("protect_content"),"true");
    assert.equal(options.body.get("document").size,128);
    return {ok:true,json:async()=>({ok:true,result:{message_id:14,chat:{id:Number(CHAT_A)}}})};
  });
  assert.equal(calls,1);
  assert.equal(ok.ok,true);
  assert.equal(ok.humanReceiptVerified,false);
  const wrong=await deliver(COMPANY_A,async()=>({ok:true,json:async()=>({
    ok:true,result:{message_id:99,chat:{id:Number(CHAT_B)}}})}));
  assert.equal(wrong.ok,false);
  assert.equal(wrong.reason,"telegram_receipt_unverified");
  const noCompany=await deliver(undefined,()=>{throw Error("must never send");});
  assert.equal(noCompany.ok,false);
});
test("provider failure and rate limits never cause paid retries",async()=>{
  let sends=0;
  const refused=await deliver(COMPANY_A,async()=>{sends++;return {ok:false,status:429};});
  assert.equal(sends,1);
  assert.deepEqual(refused,{ok:false,reason:"telegram_rate_limited"});
  const network=await deliver(COMPANY_A,async()=>{throw Error("network");});
  assert.deepEqual(network,{ok:false,reason:"telegram_transport_failed"});
});
