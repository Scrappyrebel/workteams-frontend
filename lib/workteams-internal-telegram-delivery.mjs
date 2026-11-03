// Server-only. Internal Lilly B's WorkTeams evidence delivery; NEVER a subscriber feature.
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readPrivateB2MediaConfig, presignPrivateB2Object } from "./workteams-private-b2.mjs";

const INTERNAL_COMPANY_ID = "de0d50e7-cfa5-4866-befe-9838f0b32a84";
const PRODUCT = "workteams";
// Photos and videos remain in separate private WorkTeams buckets.
const MAX_VIDEO = 45 * 1024 * 1024; // standard Telegram Bot API is limited to 50 MB
const MAX_PHOTO = 9 * 1024 * 1024;
const TYPES = {
  video: "video_url",
  book_photo: "photo_url",
};
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const CHAT_ID = /^-[0-9]{7,20}$/;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
}
function validPath(path) {
  return typeof path === "string" && path.startsWith(INTERNAL_COMPANY_ID + "/") &&
    !path.includes("..") && !path.startsWith("/") && path.length < 350;
}
function mac(data, key) {
  const signingKey = createHmac("sha256", key)
    .update("workteams-b2-grants-v1").digest();
  return createHmac("sha256", signingKey).update(data).digest("base64url");
}
async function checkedB2File(index, proof, maxBytes) {
  if (index?.kind !== "workteams-b2-parts" ||
      index.companyId !== INTERNAL_COMPANY_ID ||
      index.memberId !== proof.member_id || !UUID.test(index.entryId) ||
      !Array.isArray(index.parts) || index.parts.length < 1 || index.parts.length > 25 ||
      !Number.isSafeInteger(index.bytes) || index.bytes < 1 ||
      !["video/mp4", "video/webm", "video/quicktime"].includes(index.mimeType))
    throw Error("bad_private_receipt");
  if (index.bytes > maxBytes) return { tooLarge: true };
  const config = readPrivateB2MediaConfig({...process.env, WORKTEAMS_B2_PRIVATE_MEDIA_ENABLED: "true"});
  const { signature, ...unsigned } = index;
  if (!config || typeof signature !== "string") throw Error("untrusted_private_receipt");
  const expected = mac(Buffer.from(JSON.stringify(unsigned)).toString("base64url"), config.appKey);
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a,b)) throw Error("untrusted_private_receipt");
  const clips = [];
  let bytes = 0;
  for (const part of index.parts) {
    if (typeof part?.key !== "string" ||
        !part.key.startsWith("workteams/" + INTERNAL_COMPANY_ID + "/" + index.entryId + "/video/") ||
        !Number.isSafeInteger(part.bytes) || part.bytes < 1 || part.bytes > 20*1024*1024 ||
        typeof part.versionId !== "string" || !part.versionId)
      throw Error("bad_private_part");
    const url = presignPrivateB2Object({
      config, method: "GET", objectKey: part.key, expiresSeconds: 120,
    }).signedUrl;
    const response = await fetch(url, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error("private_part_unavailable");
    const clip = await response.blob();
    if (clip.size !== part.bytes) throw Error("private_part_incomplete");
    bytes += clip.size; clips.push(clip);
  }
  if (bytes !== index.bytes) throw Error("private_video_incomplete");
  return { blob: new Blob(clips, {type:index.mimeType}), tooLarge:false };
}
async function readProofFile(sb, path, proof, kind) {
  if (!validPath(path)) throw Error("invalid_internal_evidence_path");
  const maxBytes = kind === "video" ? MAX_VIDEO : MAX_PHOTO;
  const bucket = kind === "video" ? "shift-videos" : "inspection-photos";
  const { data: info, error: infoError } = await sb.storage.from(bucket).info(path);
  if (infoError || !info) throw Error("private_evidence_missing");
  if (!path.endsWith(".parts.json") && Number(info.size) > maxBytes)
    return { tooLarge:true };
  const { data: source, error } = await sb.storage.from(bucket).download(path);
  if (error || !source || source.size < 1) throw Error("private_evidence_unavailable");
  if (!path.endsWith(".parts.json")) return { blob:source, tooLarge:source.size > maxBytes };
  if (kind !== "video" || source.size > 18000) throw Error("invalid_video_index");
  const manifest = JSON.parse(await source.text());
  if (manifest?.kind === "workteams-b2-parts")
    return checkedB2File(manifest, proof, maxBytes);
  const base = path.slice(0, -".parts.json".length);
  if (manifest?.kind !== "workteams-walkthrough-parts" ||
      manifest.version !== 1 || !Number.isSafeInteger(manifest.bytes) ||
      !Array.isArray(manifest.parts) || manifest.parts.length < 2 || manifest.parts.length > 20 ||
      !["video/mp4", "video/webm"].includes(manifest.mimeType))
    throw Error("untrusted_private_index");
  if (manifest.bytes > maxBytes) return { tooLarge:true };
  let bytes = 0;
  const clips = [];
  for (let i=0; i<manifest.parts.length; i++) {
    const item = base + ".part-" + String(i).padStart(3,"0") + ".bin";
    if (manifest.parts[i] !== item) throw Error("invalid_private_part_reference");
    const {data:part,error:partError}=await sb.storage.from(bucket).download(item);
    if (partError||!part||part.size<1||part.size>40*1024*1024)
      throw Error("private_part_missing");
    clips.push(part); bytes += part.size;
  }
  if (bytes !== manifest.bytes) throw Error("private_video_incomplete");
  return { blob:new Blob(clips,{type:manifest.mimeType}), tooLarge:false };
}
async function telegram(method, bot, formOrBody, isForm=false) {
  const response = await fetch("https://api.telegram.org/bot" + bot + "/" + method,{
    method:"POST", cache:"no-store", redirect:"error",
    ...(isForm ? {body:formOrBody} : {
      headers:{"Content-Type":"application/json"}, body:JSON.stringify(formOrBody),
    }),
    signal:AbortSignal.timeout(25000),
  });
  const result = await response.json().catch(()=>null);
  if (!response.ok || result?.ok !== true) throw Error("telegram_transport_" + response.status);
  return result.result;
}
async function verifiedGroup(bot, chatId, title) {
  const chat = await telegram("getChat", bot, {chat_id:chatId});
  return chat && String(chat.id) === chatId &&
    ["group","supergroup"].includes(chat.type) && chat.title === title;
}
function evidenceReady(row, kind) {
  const path = row[TYPES[kind]];
  if (!validPath(path)) return false;
  if (kind === "video" && !row.keep_video && row.video_expires_at &&
      Date.parse(row.video_expires_at) <= Date.now()) return false;
  return true;
}
async function deliverOne(sb, row, kind, bot, chatId) {
  const path = row[TYPES[kind]];
  const { blob, tooLarge } = await readProofFile(sb,path,row,kind);
  const heading = kind === "video" ? "Walkthrough video" :
    "Communication Book photo";
  // Never send a public/signed storage URL or file content to a commercial subscriber.
  if (tooLarge) {
    const message = await telegram("sendMessage",bot,{
      chat_id:chatId, text:"Lilly B's WorkTeams: " + heading +
        " is saved but exceeds Telegram's supported file size. Sign in to WorkTeams to view or export the original.",
      link_preview_options:{is_disabled:true},
    });
    return { messageId: message.message_id, linkOnly:true };
  }
  const mime=blob.type || (kind==="video"?"video/mp4":"image/jpeg");
  const name="LillyBs-WorkTeams-"+kind+"-"+row.id+
    (mime==="video/webm"?".webm":mime==="video/quicktime"?".mov":
      kind==="video"?".mp4":mime==="image/png"?".png":".jpg");
  const form = new FormData();
  form.set("chat_id",chatId);
  form.set("caption","Lilly B's internal • WorkTeams • "+heading);
  // Forwarding is permitted because the owner explicitly needs to forward copies.
  form.set("protect_content","false");
  const field = kind==="video" && mime==="video/mp4" ? "video" :
    kind!=="video" && ["image/jpeg","image/png"].includes(mime) ? "photo" : "document";
  form.set(field,blob,name);
  const sent=await telegram(field==="video"?"sendVideo":field==="photo"?"sendPhoto":"sendDocument",
    bot,form,true);
  if (!Number.isSafeInteger(sent?.message_id) || String(sent.chat?.id)!==chatId)
    throw Error("telegram_receipt_invalid");
  return {messageId:sent.message_id, linkOnly:false};
}
export async function deliverInternalWorkTeamsProofs() {
  if (process.env.WORKTEAMS_INTERNAL_TELEGRAM_ENABLED!=="true") return {state:"disabled"};
  const bot=process.env.TELEGRAM_EVIDENCE_BOT_TOKEN || "";
  const chatId=process.env.WORKTEAMS_INTERNAL_TELEGRAM_CHAT_ID || "";
  const title=process.env.WORKTEAMS_INTERNAL_TELEGRAM_GROUP_TITLE || "";
  const started=process.env.WORKTEAMS_INTERNAL_TELEGRAM_STARTED_AT || "";
  const since=Date.parse(started);
  if (!/^\d{5,15}:[A-Za-z0-9_-]{30,100}$/.test(bot) ||
      !CHAT_ID.test(chatId) || !title.trim() ||
      !Number.isFinite(since) || since > Date.now() ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return {state:"not_configured"};
  const sb=admin();
  if (!await verifiedGroup(bot,chatId,title)) return {state:"group_unverified"};
  const [videosR,booksR]=await Promise.all([
    sb.from("shift_videos")
      .select("id,company_id,member_id,video_url,keep_video,video_expires_at,created_at")
      .eq("company_id",INTERNAL_COMPANY_ID)
      .gte("created_at",new Date(since).toISOString())
      .order("created_at",{ascending:false}).limit(80),
    sb.from("comm_book")
      .select("id,company_id,member_id,photo_url,created_at")
      .eq("company_id",INTERNAL_COMPANY_ID)
      .not("photo_url","is",null)
      .gte("created_at",new Date(since).toISOString())
      .order("created_at",{ascending:false}).limit(80),
  ]);
  if (videosR.error || booksR.error) throw Error("internal_proof_scan_failed");
  let queued=0;
  for(const [kind,records] of [["video",videosR.data],["book_photo",booksR.data]]) {
    for (const proof of records||[]) {
      if (proof.company_id!==INTERNAL_COMPANY_ID || !UUID.test(proof.id) ||
          !evidenceReady(proof,kind)) continue;
      const {error}=await sb.from("internal_telegram_evidence_delivery").upsert({
        product:PRODUCT,company_id:INTERNAL_COMPANY_ID,evidence_id:proof.id,kind,
      },{onConflict:"product,company_id,evidence_id,kind",ignoreDuplicates:true});
      if (error) throw Error("telegram_outbox_unavailable");
      queued++;
    }
  }
  const now=new Date().toISOString();
  const {data:jobs,error:jobsError}=await sb.from("internal_telegram_evidence_delivery")
    .select("evidence_id,kind,status,attempts")
    .eq("product",PRODUCT).eq("company_id",INTERNAL_COMPANY_ID)
    .in("status",["pending","retry","sending"]).lte("next_attempt_at",now)
    .order("created_at",{ascending:true}).limit(1);
  if(jobsError)throw Error("telegram_queue_read_failed");
  let sent=0,linked=0,failed=0;
  for (const job of jobs||[]) {
    if (!Object.hasOwn(TYPES,job.kind)) continue;
    const attempts=job.attempts+1;
    const key={product:PRODUCT,company_id:INTERNAL_COMPANY_ID,evidence_id:job.evidence_id,kind:job.kind};
    let q=sb.from("internal_telegram_evidence_delivery").update({
      status:"sending", attempts, next_attempt_at:new Date(Date.now()+20*60000).toISOString(),
    }).match(key).eq("status",job.status).eq("attempts",job.attempts)
      .select("evidence_id").maybeSingle();
    const {data:claimed,error:claimError}=await q;
    if(claimError||!claimed)continue;
    try {
      const table=job.kind==="video"?"shift_videos":"comm_book";
      const fields=job.kind==="video"
        ?"id,company_id,member_id,video_url,keep_video,video_expires_at,created_at"
        :"id,company_id,member_id,photo_url,created_at";
      const {data:proof,error:proofError}=await sb.from(table).select(fields)
        .eq("id",job.evidence_id).eq("company_id",INTERNAL_COMPANY_ID).maybeSingle();
      if(proofError||!proof||!evidenceReady(proof,job.kind)){
        await sb.from("internal_telegram_evidence_delivery").update({status:"skipped",last_error_code:"proof_missing_or_expired"}).match(key);
        continue;
      }
      const result=await deliverOne(sb,proof,job.kind,bot,chatId);
      await sb.from("internal_telegram_evidence_delivery").update({
        status:result.linkOnly?"link_only":"sent",sent_at:new Date().toISOString(),
        telegram_message_id:result.messageId,last_error_code:null,
      }).match(key).eq("status","sending");
      if(result.linkOnly)linked++;else sent++;
    } catch (error) {
      failed++;
      await sb.from("internal_telegram_evidence_delivery").update({
        status:attempts>=5?"failed":"retry",
        next_attempt_at:new Date(Date.now()+15*60000).toISOString(),
        last_error_code:"delivery_failed",
      }).match(key).eq("status","sending");
      console.warn("WorkTeams private evidence delivery failed without exposing media.");
    }
  }
  return {state:"processed",queued,files_sent:sent,large_link_only:linked,failed};
}
