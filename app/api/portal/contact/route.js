import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientIp } from "../../../../lib/rate-limit";
import { appUrlFrom } from "../../../../lib/app-url";

const sb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function validToken(token) {
  if(typeof token!=="string"||!token||token.length>128)return null;
  const client=sb();
  const {data:pt,error:tokenError}=await client
    .from("portal_tokens")
    .select("id, company_id, location_id, expires_at")
    .eq("token",token).maybeSingle();
  if(tokenError)throw new Error("Cannot confirm the customer link.");
  if(!pt||(pt.expires_at&&new Date(pt.expires_at)<=new Date()))return null;
  // A stale token that points at a deleted/moved location cannot submit.
  const {data:location,error:locationError}=await client
    .from("locations").select("id")
    .eq("id",pt.location_id).eq("company_id",pt.company_id).maybeSingle();
  if(locationError)throw new Error("Cannot confirm the service location.");
  return location?pt:null;
}

async function tryEmail({ to, subject, text }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || `WorkTeams <noreply@${process.env.RESEND_FROM_DOMAIN || "lillybsjanitorial.com"}>`;
  if (!key || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const PRIVATE_HEADERS={
  "Cache-Control":"private, no-store, max-age=0",
  "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff"
};
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:PRIVATE_HEADERS});

// A bearer link is scoped to one service location. A copy request is a
// TRACKED request to management, not a file download or signing credential.
export async function POST(req) {
  try {
    const rl=checkRateLimit(`portal-contact:${clientIp(req)}`,{limit:10,windowMs:60_000});
    if(!rl.ok)return reply({error:"Too many requests. Try again shortly."},429);

    const submitted=await req.json();
    const {token,name,subject,body,category}=submitted||{};
    const isCopy=category==="document_copy";
    if(typeof token!=="string"||!token||token.length>128)
      return reply({error:"This location link is not valid."},400);
    if(name!==undefined&&(typeof name!=="string"||name.length>120))
      return reply({error:"Please enter a shorter contact name."},400);
    if(!isCopy&&(
      typeof body!=="string"||!body.trim()||body.length>4000||
      (subject!==undefined&&(typeof subject!=="string"||subject.length>160))
    ))return reply({error:"Enter a message of up to 4000 characters."},400);

    const pt=await validToken(token);
    if(!pt)return reply({error:"This location link is no longer authorized."},404);
    const client=sb();
    let cat=["general","service_problem","callback_request"].includes(category)?category:"general";
    let cleanSubject=String(subject||"").trim();
    let cleanBody=String(body||"").trim();
    if(isCopy){
      const {data:approved,error:contractError}=await client
        .from("contracts").select("id")
        .eq("company_id",pt.company_id).eq("location_id",pt.location_id)
        .eq("status","signed").limit(1).maybeSingle();
      if(contractError)return reply({error:"Signed contract availability could not be verified."},503);
      if(!approved)return reply({error:"No approved signed contract is available for this location. Contact the business."},409);
      const {data:existing,error:openError}=await client
        .from("portal_messages").select("id")
        .eq("company_id",pt.company_id).eq("location_id",pt.location_id)
        .eq("portal_token_id",pt.id).eq("category","document_copy")
        .in("customer_status",["received","in_progress"]).limit(1).maybeSingle();
      if(openError)return reply({error:"Existing document requests could not be verified."},503);
      if(existing)return reply({ok:true,already_pending:true,request_id:existing.id});
      cat="document_copy";
      cleanSubject="Signed contract copy requested";
      cleanBody="Please arrange secure delivery of the approved signed contract for this service location. Verify the intended recipient through a separate trusted channel before sharing any file.";
    }
    const priority=cat==="service_problem"?"urgent":cat==="callback_request"?"high":"normal";
    const {data:msg,error}=await client.from("portal_messages").insert({
      company_id:pt.company_id,
      location_id:pt.location_id,
      portal_token_id:pt.id,
      sender_name:String(name||"").trim()||null,
      subject:cleanSubject||null,
      body:cleanBody,
      category:cat,
      priority
    }).select("id").single();
    if(error?.code==="23505"&&isCopy)
      return reply({error:"A document request is already pending. Refresh the request status before submitting another."},409);
    if(error||!msg)return reply({error:"Could not confirm the request was saved."},503);

    // Notify management when available; the durable request remains in the
    // company inbox even if external mail is disabled or unavailable.
    // The link opens the Client Portal inbox on this exact request's
    // conversation (migration 065 deep link).
    const inboxUrl=`${appUrlFrom(req)}/app/${pt.company_id}/client-portal?message=${msg.id}`;
    const {data:owner}=await client.from("company_members").select("email")
      .eq("company_id",pt.company_id).eq("role","owner").limit(1).maybeSingle();
    const emailed=await tryEmail({
      to:owner?.email,
      subject:isCopy?"Customer requested signed contract copy":`Client message: ${cleanSubject||cat}`,
      text:isCopy?
        `A location-scoped Customer Portal visitor requested a signed contract copy. Open this request in your WorkTeams Client Portal inbox to verify the recipient and arrange secure delivery: ${inboxUrl}\n\nDo not send a document through the shared location link.`:
        `New client portal message${name?` (${name})`:""}:\n\n${cleanBody}\n\nOpen this request in WorkTeams: ${inboxUrl}`
    });
    if(emailed)await client.from("portal_messages")
      .update({emailed_at:new Date().toISOString()}).eq("id",msg.id)
      .eq("company_id",pt.company_id);
    return reply({ok:true,request_id:msg.id,emailed});
  }catch(err){
    console.error("portal contact request failed",err);
    return reply({error:"Request status could not be confirmed. Check with the business before retrying."},503);
  }
}
