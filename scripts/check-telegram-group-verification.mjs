import test from "node:test";
import assert from "node:assert/strict";
import { expectedGroupTitle, verificationCommand,
  discoverVerifiedGroup, bindingDecision, checkLivePrivateWorkTeamsGroup } from "../lib/telegram-group-verification.server.mjs";

const BOT_TOKEN = "123456:" + "A".repeat(36);
const BOT_USER = "LillyBsWorkTeamsEvidenceBot";
const JANITORIAL = "de0d50e7-cfa5-4866-befe-9838f0b32a84";
const TEMP = "8e941f44-4b79-4ddb-a54a-64d7d960b9a2";
const DAY = "2026-10-19";
const make = (companyId, dateUTC = DAY) =>
 verificationCommand({botToken:BOT_TOKEN,botUsername:BOT_USER,companyId,dateUTC});
const update = (id,title,text,type="supergroup")=>({
  update_id: Math.abs(id), message: {text,chat:{id,title,type}} });

test("only approved WorkTeams companies have discovery titles",()=>{
  assert.equal(expectedGroupTitle("Lilly B’s Janitorial"),"WorkTeams Message App");
  assert.equal(expectedGroupTitle("Lilly B's Temp Cleaning Staffing"),"WorkTeams Temp Agency");
  assert.equal(expectedGroupTitle("Other Company"),null);
  assert.equal(expectedGroupTitle(""),null);
});
test("company and date challenges are unique, signed and never contain tokens",()=>{
  assert.match(make(JANITORIAL), /^\/wtverify_[a-f0-9]{18}@LillyBsWorkTeamsEvidenceBot$/);
  assert.notEqual(make(JANITORIAL),make(TEMP));
  assert.notEqual(make(JANITORIAL),make(JANITORIAL,"2026-10-20"));
  assert.equal(make("invalid"),null);
  assert.equal(verificationCommand({botToken:"bad",botUsername:BOT_USER,companyId:JANITORIAL}),null);
  assert.equal(verificationCommand({botToken:BOT_TOKEN,botUsername:"bad",companyId:JANITORIAL}),null);
});
test("Janitorial and Temp Agency commands can NEVER cross-verify",()=>{
  const updates=[
    update(-1001234567890,"WorkTeams Message App",make(JANITORIAL)),
    update(-1009876543210,"WorkTeams Temp Agency",make(TEMP))
  ];
  assert.deepEqual(discoverVerifiedGroup({
    updates,command:make(JANITORIAL),expectedTitle:"WorkTeams Message App"}),
    {status:"verified_candidate",chatId:"-1001234567890",title:"WorkTeams Message App"});
  assert.deepEqual(discoverVerifiedGroup({
    updates,command:make(TEMP),expectedTitle:"WorkTeams Temp Agency"}),
    {status:"verified_candidate",chatId:"-1009876543210",title:"WorkTeams Temp Agency"});
  assert.deepEqual(discoverVerifiedGroup({
    updates,command:make(JANITORIAL),expectedTitle:"WorkTeams Temp Agency"}),
    {status:"command_not_found"});
  assert.deepEqual(discoverVerifiedGroup({
    updates,command:make(TEMP),expectedTitle:"WorkTeams Message App"}),
    {status:"command_not_found"});
});
test("non-private, forged, wrong-day, unrelated and ambiguous groups fail closed",()=>{
  const cmd=make(JANITORIAL);
  const title="WorkTeams Message App";
  assert.deepEqual(discoverVerifiedGroup({updates:[],command:cmd,expectedTitle:title}),
    {status:"command_not_found"});
  assert.deepEqual(discoverVerifiedGroup({
    updates:[update(-1001234567890,title,make(JANITORIAL,"2026-10-18"))],
    command:cmd,expectedTitle:title}),{status:"command_not_found"});
  assert.deepEqual(discoverVerifiedGroup({
    updates:[update(123456789,title,cmd,"private")],
    command:cmd,expectedTitle:title}),{status:"command_not_found"});
  assert.deepEqual(discoverVerifiedGroup({
    updates:[update(-1001234567890,title,cmd),update(-1009876543210,title,cmd)],
    command:cmd,expectedTitle:title}),{status:"ambiguous_group"});
  assert.deepEqual(discoverVerifiedGroup({
    updates:[update(-1001234567890,"Other",cmd)],
    command:cmd,expectedTitle:title}),{status:"command_not_found"});
  assert.deepEqual(discoverVerifiedGroup({
    updates:[{ message: { text: cmd, chat: { id: -1001234567890,
      type: "supergroup", title, username: "public_group" } } }],
    command:cmd,expectedTitle:title}),{status:"command_not_found"});
  assert.deepEqual(discoverVerifiedGroup({updates:[{}],command:"/start",expectedTitle:title}),
    {status:"invalid_discovery"});
});

test("saved company binding is first-write only, idempotent, never reassigned",()=>{
  assert.equal(bindingDecision({candidateChatId:"-1001234567890"}),"insert");
  assert.equal(bindingDecision({existingChatId:"-1001234567890",
    candidateChatId:"-1001234567890"}),"already_verified");
  assert.equal(bindingDecision({existingChatId:"-1001234567890",
    candidateChatId:"-1009876543210"}),"conflicting_existing_group");
  assert.equal(bindingDecision({candidateChatId:"@public"}),"invalid_candidate");
});

test("future WorkTeams tenants can verify a signed command without hardcoded names",()=>{
  const name="Any Future Customer LLC";
  assert.equal(expectedGroupTitle(name),null);
  const cmd=make("33333333-3333-4333-8333-333333333333");
  const entry=update(-1002223334445,"Custom Private Evidence",cmd);
  const candidate=discoverVerifiedGroup({
    updates:[entry],command:cmd,expectedTitle:null
  });
  assert.deepEqual(candidate,{
    status:"verified_candidate",chatId:"-1002223334445",title:"Custom Private Evidence"
  });
  assert.deepEqual(checkLivePrivateWorkTeamsGroup(candidate,entry.message.chat,null),{
    status:"verified_current_private_group",
    chatId:"-1002223334445",title:"Custom Private Evidence"
  });
  assert.equal(checkLivePrivateWorkTeamsGroup(candidate,{
    ...entry.message.chat,username:"public"
  },null).status,"invalid_live_group");
});

test("signup lets any owner opt into instructions, not forced Telegram account",()=>{
  const fs = await import("node:fs");
  const url = new URL("../app/app/page.js",import.meta.url);
  const page=fs.readFileSync(url,"utf8");
  assert.match(page,/telegramSetup/);
  assert.match(page,/employees.*do not need Telegram/i);
  assert.match(page,/You will not need to enter any code in Vercel/);
  assert.match(page,/telegram_setup=1/);
});
