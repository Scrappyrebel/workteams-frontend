"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUseWithRole } from "../../../../lib/tiers";

export default function ClientPortalPage() {
  const { company, member, loading } = useCompany();
  const [locations, setLocations] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [responseDrafts,setResponseDrafts]=useState({});
  const [statusDrafts,setStatusDrafts]=useState({});
  const [responseError,setResponseError]=useState("");
  const [responseNotice,setResponseNotice]=useState("");
  const responseInFlight=useRef(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "portal", member?.role);

  const [messages, setMessages] = useState([]);

  async function load() {
    setLoadError("");
    const sb = supabase();
    const { data: locs, error: locError } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    if(locError){setLoadError("Could not confirm service locations. Try refreshing.");return}
    setLocations(locs || []);
    const { data: toks, error: tokenError } = await sb
      .from("portal_tokens")
      .select("id, location_id, token, client_name, expires_at, created_at")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    if(tokenError){setLoadError("Could not confirm active client links. Try refreshing.");setTokens([]);return}
    setTokens(toks || []);
    const { data: msgs, error: messageError } = await sb
      .from("portal_messages")
      .select("*, locations(name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if(messageError){setLoadError("Client messages are temporarily unavailable. This does not mean there are no messages.");setMessages([]);return}
    setMessages(msgs || []);
    setResponseDrafts(previous=>{
      const next={...previous};
      for(const m of msgs||[])if(next[m.id]===undefined)next[m.id]=m.customer_response||"";
      return next;
    });
    setStatusDrafts(previous=>{
      const next={...previous};
      for(const m of msgs||[])if(next[m.id]===undefined)next[m.id]=m.customer_status||"received";
      return next;
    });
  }

  useEffect(() => {
    if (!loading && company && allowed && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  // 256-bit token from the platform CSPRNG. No Math.random() fallback:
  // if secure randomness is unavailable the link is not generated.
  function makeToken() {
    if (typeof crypto === "undefined" || !crypto.getRandomValues) {
      throw new Error("Secure random generation is not available in this browser.");
    }
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function generate(locationId, locationName) {
    setWorking(true);
    try {
      const token = makeToken();
      // Link lives for the contract when one exists: tied to the signed
      // contract's end date (or long-lived for open-ended contracts).
      // Otherwise the previous 90-day default applies.
      const sb = supabase();
      const { data: contract } = await sb
        .from("contracts")
        .select("end_date")
        .eq("company_id", company.id)
        .eq("location_id", locationId)
        .eq("status", "signed")
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let expiresAt;
      if (contract?.end_date) {
        expiresAt = new Date(contract.end_date + "T23:59:59").toISOString();
      } else if (contract) {
        expiresAt = new Date(Date.now() + 5 * 365 * 24 * 3600 * 1000).toISOString();
      } else {
        expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
      }
      const { error } = await sb.from("portal_tokens").insert({
        company_id: company.id,
        location_id: locationId,
        token,
        client_name: locationName,
        expires_at: expiresAt,
      });
      if (error) throw error;
      load();
    } catch (err) {
      alert("Could not generate link: " + err.message);
    }
    setWorking(false);
  }

  // Rotate: revoke the old token and mint a fresh one (new expiry).
  async function regenerate(t) {
    if (!confirm("Generate a new link? The old link will stop working immediately.")) return;
    setWorking(true);
    try {
      const token = makeToken();
      const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
      const { error } = await supabase()
        .from("portal_tokens")
        .update({ token, expires_at: expiresAt })
        .eq("id", t.id);
      if (error) throw error;
      load();
    } catch (err) {
      alert("Could not regenerate link: " + err.message);
    }
    setWorking(false);
  }

  async function revoke(id) {
    if(working || !confirm("Revoke this client link? It will stop working immediately.")) return;
    setWorking(true);
    try {
      const { error } = await supabase().from("portal_tokens").delete().eq("id", id).eq("company_id", company.id);
      if (error) throw error;
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The client link could not be revoked.");
    } finally {
      setWorking(false);
    }
  }

  async function copyLink(token) {
    const url = `${window.location.origin}/portal/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Link copied — send it to your client.");
    } catch {
      prompt("Copy this link:", url);
    }
  }

  async function markRead(id) {
    if(working||responseInFlight.current)return;
    const {error}=await supabase().from("portal_messages")
      .update({read_at:new Date().toISOString()}).eq("id",id).eq("company_id",company.id);
    if(error)setResponseError("Could not confirm that message was marked read.");
    else await load();
  }

  async function saveCustomerResponse(message){
    if(responseInFlight.current||working||!isManager||!company?.id)return;
    const status=statusDrafts[message.id]||message.customer_status||"received";
    const reply=String(responseDrafts[message.id]??message.customer_response??"").trim();
    if(!["received","in_progress","resolved"].includes(status)){
      setResponseError("Choose a valid customer request status.");return;
    }
    if(reply&& (reply.length<10||reply.length>1200)){
      setResponseError("Write a customer-safe response of 10–1200 characters, or leave it blank.");return;
    }
    if(!window.confirm("Save this status and response for anyone holding this location's secure customer link? Do not include private staff information or sensitive details."))return;
    responseInFlight.current=true;setWorking(true);setResponseError("");setResponseNotice("");
    try{
      const saved=await supabase().from("portal_messages").update({
        customer_status:status,customer_response:reply||null,
        customer_responded_at:reply?new Date().toISOString():null
      }).eq("id",message.id).eq("company_id",company.id)
      .select("id,customer_status,customer_response,customer_responded_at").single();
      if(saved.error||!saved.data||saved.data.customer_status!==status||
        (saved.data.customer_response||"")!==reply)
        throw new Error(saved.error?.message||"The customer response could not be verified.");
      await load();
      setResponseNotice("Customer-safe status and response saved. The location link can now show the update.");
    }catch(error){
      setResponseError(error instanceof Error?error.message:"Customer response status unknown. Check history before resending.");
    }finally{
      responseInFlight.current=false;setWorking(false);
    }
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed || !isManager) {
    const roleBlocked = allowed && !isManager;
    return (
      <div>
        <p className="eyebrow">CLIENT PORTAL</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Client portal</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          {roleBlocked ? (
            <p>The client portal is for owners and managers.</p>
          ) : (
            <>
              <p>The client portal is a <strong>Pro</strong> feature.</p>
              <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
                See plans →
              </Link>
            </>
          )}
        </section>
      </div>
    );
  }

  const tokenByLocation = {};
  for (const t of tokens) if(!tokenByLocation[t.location_id]) tokenByLocation[t.location_id] = t;
  const now = Date.now();
  const linkExpired = (t) => !!t?.expires_at && new Date(t.expires_at).getTime() <= now;
  const activeLinks = locations.filter(l => tokenByLocation[l.id] && !linkExpired(tokenByLocation[l.id])).length;
  const expiredLinks = locations.filter(l => tokenByLocation[l.id] && linkExpired(tokenByLocation[l.id])).length;
  const missingLinks = locations.filter(l => !tokenByLocation[l.id]).length;
  const unreadMessages = messages.filter(m => !m.read_at).length;

  return (
    <div>
      <p className="eyebrow">CLIENT PORTAL</p>
      <h2 style={{ fontSize: "1.8rem" }}>Client messages</h2>
      <nav className="panel" aria-label="Client Portal management quick access" style={{padding:16,margin:"16px 0"}}>
        <strong>Quick Access / Acceso rápido</strong>
        <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:8}}>
          <a href="#portal-management-messages">Client messages</a>
          <a href="#portal-management-links">Location links</a>
        </div>
        <p style={{fontSize:"0.85rem",marginBottom:0}}>Unread messages: {loadError?"Unavailable":unreadMessages} · Active links: {activeLinks} · Expired: {expiredLinks} · Not generated: {missingLinks}</p>
      </nav>
      {loadError&&<section className="panel" role="alert" style={{padding:16,border:"1px solid #b3261e",margin:"12px 0"}}>
        <strong>Portal status incomplete</strong><p>{loadError}</p><button type="button" disabled={working} style={button} onClick={() => void load()}>Retry customer portal status</button>
      </section>}
      <h3 id="portal-management-messages">Customer Service inbox &amp; responses</h3>
      {responseError&&<p role="alert" style={{color:"#b3261e"}}>{responseError}</p>}
      {responseNotice&&<p role="status">{responseNotice}</p>}
      <p style={{fontSize:"0.85rem",color:"var(--muted)"}}>Customers holding a location link can see only request category, date, status and the approved response—not private original messages or sender names. Do not enter internal notes, sensitive details or employee information.</p>
      <div style={{ display: "grid", gap: 10, margin: "18px 0 28px" }}>
        {!loadError && messages.length === 0 && <p style={{ color: "var(--muted)" }}>No client messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className="portal-card" style={{ minHeight: 0, padding: "14px 18px", opacity: m.read_at ? 0.75 : 1 }}>
            <span className="card-kicker">
              {!m.read_at && <strong style={{ color: "var(--brand-deep)" }}>NEW • </strong>}
              {m.sender_name || "Client"}{m.locations?.name ? ` • ${m.locations.name}` : ""}
              {" • "}{new Date(m.created_at).toLocaleString()}
              {m.emailed_at ? " • emailed ✅" : ""}
            </span>
            {m.subject && <p style={{ fontWeight: 700, margin: "6px 0 0" }}>{m.subject}</p>}
            <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{m.body}</p>
            <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--line)"}}>
              <label htmlFor={`status-${m.id}`} style={{display:"block",fontWeight:700,marginBottom:6}}>Customer-facing request status</label>
              <select id={`status-${m.id}`} value={statusDrafts[m.id]??m.customer_status??"received"}
                onChange={e=>setStatusDrafts(p=>({...p,[m.id]:e.target.value}))}
                disabled={working} style={{width:"100%",padding:10,borderRadius:8}}>
                <option value="received">Received / Recibido</option>
                <option value="in_progress">In progress / En curso</option>
                <option value="resolved">Resolved / Resuelto</option>
              </select>
              <label htmlFor={`response-${m.id}`} style={{display:"block",fontWeight:700,margin:"10px 0 6px"}}>Reply visible to the customer link (optional)</label>
              <textarea id={`response-${m.id}`} rows={3} maxLength={1200}
                value={responseDrafts[m.id]??m.customer_response??""}
                onChange={e=>setResponseDrafts(p=>({...p,[m.id]:e.target.value}))}
                disabled={working} placeholder="Write only customer-safe follow-up information." 
                style={{width:"100%",padding:10,borderRadius:8,resize:"vertical"}} />
              <button type="button" disabled={working} onClick={()=>void saveCustomerResponse(m)}
                style={{...button,marginTop:8}}>Save customer update</button>
              {m.customer_responded_at&&<p style={{fontSize:"0.8rem",color:"var(--muted)"}}>Last customer reply: {new Date(m.customer_responded_at).toLocaleString()}</p>}
            </div>
            {!m.read_at && (
              <button onClick={() => markRead(m.id)} style={{ ...button, marginTop: 8, fontSize: "0.85rem", padding: "7px 14px" }}>
                Mark as read
              </button>
            )}
          </div>
        ))}
      </div>

      <h2 id="portal-management-links" style={{ fontSize: "1.8rem" }}>Client portal links</h2>
      <p style={{ color: "var(--muted)" }}>
        Share a read-only link per location. Clients see upcoming visits, recent inspection
        scores, and open work orders — no login needed, no financial or staff details.
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        {locations.length === 0 && <p style={{ color: "var(--muted)" }}>Add a location first.</p>}
        {locations.map((l) => {
          const t = tokenByLocation[l.id];
          return (
            <div key={l.id} className="portal-card" style={{ minHeight: 0, padding: "16px 20px" }}>
              <strong>{l.name}</strong>
              {t ? (
                <div style={{ marginTop: 10 }}>
                  <p style={{ color: "var(--success-ink)", fontWeight: 700, fontSize: "0.9rem" }}>
                    {linkExpired(t) ? "⚠️ Link expired — rotate before sharing" : "✅ Link active"}
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "var(--muted)", wordBreak: "break-all" }}>
                    {typeof window !== "undefined" ? `${window.location.origin}/portal/${t.token}` : ""}
                  </p>
                  {t.expires_at && (
                    <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      Expires {new Date(t.expires_at).toLocaleDateString()}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button onClick={() => copyLink(t.token)} style={button}>Copy link</button>
                    <button onClick={() => regenerate(t)} disabled={working} style={button}>New link</button>
                    <button onClick={() => revoke(t.id)} disabled={working} style={dangerButton}>Revoke</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => generate(l.id, l.name)} disabled={working} style={button}>
                    {working ? "Generating…" : "Generate client link"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const button = {
  padding: "10px 20px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const dangerButton = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "10px 20px",
  fontWeight: 700,
  cursor: "pointer",
};
