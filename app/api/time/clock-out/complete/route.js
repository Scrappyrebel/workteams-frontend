import { createHmac, timingSafeEqual } from "node:crypto";
import { readPrivateB2MediaConfig, presignPrivateB2Object } from "../../../../../lib/workteams-private-b2.mjs";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../../lib/rate-limit";
import { NO_COMMUNICATION_BOOK_NOTE } from "../../../../../lib/no-book-proof";
import { proofRequired } from "../../../../../lib/proof-policy";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

async function authedUser(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/, "");
  if (!token) return null;
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser();
  return user || null;
}

// Confirm actual private storage before trusting a client-created proof row.
// This verifies transport/container identity, not moving frames or notebook content.
async function savedProofExists(sb,kind,path,companyId,memberId,entryId,expectedBytes){
 const prefix=companyId+"/"+entryId+"/";
 const b2=kind==="walkthrough"&&typeof path==="string"&&path.startsWith(companyId+"/"+memberId+"/b2-")&&path.endsWith(".parts.json");
 if(typeof path!=="string"||path.length>500||path.includes("..")||(!b2&&!path.startsWith(prefix)))return false;
 const bucket=sb.storage.from(kind==="walkthrough"?"shift-videos":"inspection-photos");
 const info=await bucket.info(path);
 if(info.error||!Number.isSafeInteger(Number(info.data?.size))||Number(info.data.size)<1)return false;
 async function header(objectPath){
  const {data,error}=await bucket.createSignedUrl(objectPath,60);if(error||!data?.signedUrl)throw Error("Private proof could not be read.");
  return headerAt(data.signedUrl);
 }
 async function headerAt(url){
  const response=await fetch(url,{headers:{Range:"bytes=0-262143"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error("Private proof is missing.");
  const reader=response.body?.getReader();if(!reader)throw Error("Private proof is empty.");
  const chunks=[];let length=0;
  try{while(length<262144){const next=await reader.read();if(next.done)break;const part=next.value.subarray(0,262144-length);chunks.push(part);length+=part.length;}}
  finally{await reader.cancel();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
 }
 const isVideo=(bytes,mime)=>mime==="video/webm"
   ? bytes.length>=4&&bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3
   : ["video/mp4","video/quicktime"].includes(mime)&&bytes.length>=12&&String.fromCharCode(...bytes.subarray(4,8))==="ftyp";
 if(kind==="book"){
  const bytes=await header(path),tag=String.fromCharCode(...bytes.subarray(0,16));
  return (bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)||
    (bytes[0]===0x89&&tag.slice(1,4)==="PNG")||
    (tag.slice(0,4)==="RIFF"&&tag.slice(8,12)==="WEBP")||
    (tag.slice(4,8)==="ftyp"&&/heic|heix|hevc|hevx|mif1|msf1|avif/.test(tag.slice(8,16)));
 }
 if(!Number.isSafeInteger(Number(expectedBytes))||Number(expectedBytes)<1||Number(expectedBytes)>500*1024*1024)return false;
 if(!path.endsWith(".parts.json")){
  const ext=/\.(webm|mp4|mov)$/i.exec(path)?.[1]?.toLowerCase();
  const mime=ext==="webm"?"video/webm":ext==="mov"?"video/quicktime":ext==="mp4"?"video/mp4":null;
  return Number(info.data.size)===Number(expectedBytes)&&isVideo(await header(path),mime);
 }
 if(Number(info.data.size)>18000)return false;
 const {data:file,error}=await bucket.download(path);if(error||!file||file.size>18000)return false;
 const index=JSON.parse(await file.text());
 if(index.version!==1||Number(index.bytes)!==Number(expectedBytes)||!Array.isArray(index.parts)||!["video/mp4","video/webm","video/quicktime"].includes(index.mimeType))return false;
 if(b2){
  const config=readPrivateB2MediaConfig();if(!config||index.kind!=="workteams-b2-parts"||index.companyId!==companyId||index.memberId!==memberId||index.entryId!==entryId||index.parts.length<1||index.parts.length>25)return false;
  const {signature:mac,...unsigned}=index;if(typeof mac!=="string")return false;
  const key=createHmac("sha256",config.appKey).update("workteams-b2-grants-v1").digest();
  const expected=createHmac("sha256",key).update(Buffer.from(JSON.stringify(unsigned)).toString("base64url")).digest("base64url");
  const a=Buffer.from(mac),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return false;
  let total=0;
  for(const part of index.parts){
   if(typeof part?.key!=="string"||!part.key.startsWith("workteams/"+companyId+"/"+entryId+"/video/")||part.key.includes("..")||!Number.isSafeInteger(part.bytes)||part.bytes<1||part.bytes>20*1024*1024||typeof part.versionId!=="string"||!part.versionId)return false;
   const signed=presignPrivateB2Object({config,method:"HEAD",objectKey:part.key,expiresSeconds:60});
   const response=await fetch(signed.signedUrl,{method:"HEAD",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
   if(!response.ok||Number(response.headers.get("content-length"))!==part.bytes||response.headers.get("x-amz-version-id")!==part.versionId)return false;
   if(total===0){const get=presignPrivateB2Object({config,method:"GET",objectKey:part.key,expiresSeconds:60});if(!isVideo(await headerAt(get.signedUrl),index.mimeType))return false;}
   total+=part.bytes;
  }return total===Number(expectedBytes);
 }
 if(index.kind!=="workteams-walkthrough-parts"||index.parts.length<2||index.parts.length>13)return false;
 const base=path.slice(0,-".parts.json".length);let total=0;
 for(let i=0;i<index.parts.length;i++){
  const part=index.parts[i];if(part!==base+".part-"+String(i).padStart(3,"0")+".bin")return false;
  const saved=await bucket.info(part),size=Math.min(40*1024*1024,Number(expectedBytes)-i*40*1024*1024);
  if(saved.error||size<1||Number(saved.data?.size)!==size)return false;
  if(i===0&&!isVideo(await header(part),index.mimeType))return false;total+=size;
 }return total===Number(expectedBytes);
}

// POST { companyId, entryId }
// Finalizes end-of-shift proof server-side:
// 1. Authenticates the user and verifies the entry belongs to them.
// 2. Reads the COMPANY's proof requirements server-side (never trusts the client).
// 3. Confirms required proof exists — a real proof row, the persisted
//    no-communication-book report, or a persisted employee override with a
//    reason (shift_proof_overrides, migration 052) each satisfy their kind.
// 4. Clears upload_pending and flags the entry when an override was used.
export async function POST(req) {
  try {
    const rl = checkRateLimit(`clock-out-complete:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const user = await authedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { companyId, entryId } = await req.json();
    if (!companyId || !entryId) {
      return NextResponse.json({ error: "companyId and entryId are required" }, { status: 400 });
    }

    const sb = admin();

    const { data: member } = await sb
      .from("company_members")
      .select("id, company_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "No access to this company" }, { status: 403 });

    const { data: entry } = await sb
      .from("time_entries")
      .select("id, member_id, company_id, location_id, clock_out, upload_pending")
      .eq("id", entryId)
      .maybeSingle();
    if (!entry || entry.company_id !== companyId || entry.member_id !== member.id) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Company proof policy — read server-side, never from the client.
    // This release requires its policy migration before deployment.
    // Failed policy reads cannot waive a cleaning company's required book.
    // Feature and requirement switches remain independent of saved time.
    const { data: company, error: companyError } = await sb
      .from("companies")
      .select("industry_key, require_walkthrough_video, require_book_photo, enable_shift_videos, enable_comm_book")
      .eq("id", companyId)
      .maybeSingle();
    if (companyError || !company) throw companyError || new Error("Company proof policy could not be verified.");
    if (!entry.clock_out) return NextResponse.json({error:"Finishing time has not synchronized yet.",pending:"time"},{status:409});
    const {data: location,error: locationError} = await sb.from("locations").select("require_walkthrough_video,require_book_photo").eq("id",entry.location_id).eq("company_id",companyId).maybeSingle();
    if (locationError) throw locationError;
    const requireVideo = proofRequired(company, "walkthrough", location);
    const requirePhoto = proofRequired(company, "book", location);

    // Persisted employee overrides for this entry (migration 052). One row
    // per proof kind; a row satisfies its kind exactly like a proof row.
    // Tolerant: before the migration runs the table is absent — treat as
    // no overrides rather than failing clock-out.
    let overrideKinds = new Set();
    {
      const { data: rows, error: overrideError } = await sb
        .from("shift_proof_overrides")
        .select("proof_kind,reason")
        .eq("company_id", companyId)
        .eq("member_id", member.id)
        .eq("time_entry_id", entryId);
      if (!overrideError) overrideKinds = new Set((rows || []).filter(r=>typeof r.reason==="string"&&r.reason.trim().length>0).map((r) => r.proof_kind));
    }

    if (requireVideo) {
      const { data: vid } = await sb
        .from("shift_videos")
        .select("id,notes,video_url,file_size_bytes")
        .eq("time_entry_id", entryId)
        .eq("company_id", companyId)
        .eq("member_id", member.id)
        .limit(1)
        .maybeSingle();
      let videoStored=false;
      if(vid?.video_url&&Number(vid.file_size_bytes)>0&&!String(vid.notes||"").startsWith("VIDEO PROOF NEEDS REVIEW:")){
        try{videoStored=await savedProofExists(sb,"walkthrough",vid.video_url,companyId,member.id,entryId,Number(vid.file_size_bytes));}catch{videoStored=false;}
      }
      if (!videoStored && !overrideKinds.has("walkthrough")) {
        return NextResponse.json(
          { error: "Required walkthrough video has not finished uploading.", pending: "walkthrough" },
          { status: 409 }
        );
      }
    }

    if (requirePhoto) {
      // Accept a real photo OR an authenticated no-communication-book report,
      // tied to this company, worker and time entry. Never trust a bare
      // checkbox/body flag as a substitute for persisted proof.
      const { data: book, error: bookError } = await sb
        .from("comm_book")
        .select("id,photo_url")
        .eq("company_id", companyId)
        .eq("member_id", member.id)
        .eq("time_entry_id", entryId)
        .not("photo_url", "is", null)
        .limit(1)
        .maybeSingle();
      if (bookError) throw bookError;
      let bookStored=false;
      if(book?.photo_url){try{bookStored=await savedProofExists(sb,"book",book.photo_url,companyId,member.id,entryId);}catch{bookStored=false;}}
      if (!bookStored) {
        const { data: noBook, error: noBookError } = await sb
          .from("comm_book")
          .select("id")
          .eq("company_id", companyId)
          .eq("member_id", member.id)
          .eq("time_entry_id", entryId)
          .eq("category", "note")
          .eq("message", NO_COMMUNICATION_BOOK_NOTE)
          .is("photo_url", null)
          .limit(1)
          .maybeSingle();
        if (noBookError) throw noBookError;
        if (!noBook) {
          // A persisted employee override with a reason also satisfies the
          // book requirement (migration 052) — same acceptance pattern.
          if (!overrideKinds.has("book")) {
            return NextResponse.json(
              { error: "Required book proof is pending: upload a book photo or save the No communication book report.", pending: "book" },
              { status: 409 }
            );
          }
        }
      }
    }

    // Finalize: clear pending and stamp the override flag from the persisted
    // override rows, so the entry is visibly flagged wherever managers
    // review it. Tolerant: if the flag column is not served yet (migration
    // 052 not run), fall back to clearing pending only.
    const { error: finalError } = await sb
      .from("time_entries")
      .update({ upload_pending: false, proof_override_used: overrideKinds.size > 0 })
      .eq("id", entryId)
      .eq("company_id", companyId);
    if (finalError) throw finalError;
    const {data: finalEntry,error: verifyError}=await sb.from("time_entries").select("id,clock_out,upload_pending,proof_override_used").eq("id",entryId).eq("company_id",companyId).eq("member_id",member.id).maybeSingle();
    if(verifyError || !finalEntry?.clock_out || finalEntry.upload_pending !== false) throw verifyError || new Error("Proof completion could not be verified.");

    return NextResponse.json({ ok: true, overrideUsed: overrideKinds.size > 0 });
  } catch (e) {
    console.error("clock-out complete error", e);
    return NextResponse.json({ error: "Failed to finalize proof." }, { status: 500 });
  }
}

