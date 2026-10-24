"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUseWithRole } from "../../../../lib/tiers";
import ClientIdentityContactManager from "../../../../components/ClientIdentityContactManager";
import CustomerDocumentManager from "../../../../components/CustomerDocumentManager";
import PublishedServiceScheduleManager from "../../../../components/PublishedServiceScheduleManager";

export default function ClientPortalPage() {
  const { company, member, loading } = useCompany();
  const [locations, setLocations] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [invitationLanguage,setInvitationLanguage]=useState("en");
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [responseDrafts,setResponseDrafts]=useState({});
  const [statusDrafts,setStatusDrafts]=useState({});
  const [deliveryConfirmed,setDeliveryConfirmed]=useState({});
  const [responseError,setResponseError]=useState("");
  const [responseNotice,setResponseNotice]=useState("");
  const responseInFlight=useRef(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "portal", member?.role);

  const [messages, setMessages] = useState([]);
  const [pilotRequested,setPilotRequested]=useState(null);
  const [pilotEnabled,setPilotEnabled]=useState(null);
  const [pilotCanActivate,setPilotCanActivate]=useState(false);
  const [pilotBusy,setPilotBusy]=useState(false);
  const [pilotError,setPilotError]=useState("");
  const [pilotNotice,setPilotNotice]=useState("");
  const livePilotCompany=useRef(company?.id);
  livePilotCompany.current=company?.id;

  async function loadPilot(){
    const companyId=company?.id;
    if(!companyId||!isManager)return;
    setPilotError("");
    const {data,error}=await supabase().rpc("get_workteams_client_portal_pilot_status",{
      p_company_id:companyId
    });
    if(livePilotCompany.current!==companyId)return;
    if(error||data?.ok!==true||typeof data.pilot_requested!=="boolean"||
      typeof data.customer_login_enabled!=="boolean"||
      typeof data.can_activate!=="boolean"){
      setPilotRequested(null);setPilotEnabled(null);setPilotCanActivate(false);
      setPilotError("Authenticated customer pilot status could not be confirmed. Refresh before making changes.");
      return;
    }
    setPilotRequested(data.pilot_requested);
    setPilotEnabled(data.customer_login_enabled);
    setPilotCanActivate(data.can_activate);
  }
  async function updatePilot(requested){
    const companyId=company?.id;
    if(!companyId||!isManager||pilotBusy||pilotRequested===null||pilotEnabled===null||
       (!requested&&pilotEnabled))return;
    const question=requested?
      "Request the authenticated customer portal pilot for this company? This does not activate logins or share records.":
      "Withdraw this company from the authenticated customer portal pilot?";
    if(!window.confirm(question))return;
    setPilotBusy(true);setPilotError("");setPilotNotice("");
    try{
      const {data,error}=await supabase().rpc("set_workteams_client_portal_pilot_request",{
        p_company_id:companyId,p_requested:requested
      });
      if(livePilotCompany.current!==companyId)return;
      if(error||data?.ok!==true||data.pilot_requested!==requested||
        typeof data.customer_login_enabled!=="boolean")
        throw new Error(error?.message||"The pilot preference could not be verified.");
      setPilotRequested(requested);
      setPilotEnabled(data.customer_login_enabled);
      setPilotNotice(requested?
        "Pilot request saved. Login is only activated with a separate owner confirmation.":
        "Pilot request withdrawn. Existing location links and customer data are unchanged.");
    }catch(err){
      if(livePilotCompany.current===companyId){
        setPilotRequested(null);
        setPilotError(err instanceof Error?err.message:"Pilot request status is unknown. Please refresh.");
      }
    }finally{setPilotBusy(false)}
  }

  async function changeCustomerLogin(nextEnabled){
    const companyId=company?.id;
    if(!companyId||!pilotCanActivate||!pilotRequested||pilotBusy||
       pilotEnabled===null||pilotEnabled===nextEnabled)return;
    const phrase=nextEnabled?"ACTIVATE":"DISABLE";
    const typed=window.prompt(nextEnabled?
      "Customer logins will be available only to previously approved verified emails and locations. No private files, contracts or billing are released. Type ACTIVATE to enable this company's customer location list.":
      "All existing customer account sessions will immediately lose location access. Type DISABLE to switch off customer logins.", "");
    if(typed!==phrase)return;
    setPilotBusy(true);setPilotError("");setPilotNotice("");
    try{
      const {data,error}=await supabase().rpc("set_workteams_customer_login_activation",{
        p_company_id:companyId,p_enabled:nextEnabled,p_confirmation:typed
      });
      if(livePilotCompany.current!==companyId)return;
      if(error||data?.ok!==true||data.customer_login_enabled!==nextEnabled)
        throw new Error(error?.message||"Could not verify customer login activation.");
      setPilotEnabled(nextEnabled);
      setPilotNotice(nextEnabled?
        "Verified customer login activated for this company. Only approved contacts and locations can be listed. Private records remain unavailable.":
        "Customer login disabled immediately for this company. Previously shared location links remain unchanged.");
    }catch(err){
      if(livePilotCompany.current===companyId){
        setPilotEnabled(null);setPilotError(err instanceof Error?err.message:
          "Activation result is unknown. Refresh before making any other changes.");
      }
    }finally{setPilotBusy(false)}
  }

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
    if (!loading && company && allowed && isManager){
      load();
      setPilotRequested(null);setPilotEnabled(null);setPilotCanActivate(false);setPilotNotice("");
      void loadPilot();
    }else{setPilotRequested(null);setPilotEnabled(null);setPilotCanActivate(false);}
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

  async function copyLink(link,format="url") {
    if(working||!isManager||!allowed||!company?.id||!link||
      !tokens.some(row=>row.id===link.id&&row.token===link.token)||
      (!!link.expires_at&&new Date(link.expires_at).getTime()<=Date.now())){
      setLoadError("Link is expired or no longer verified. Refresh or rotate it before sharing.");
      return;
    }
    // Check the live company-scoped record before copying a bearer credential.
    const checked=await supabase().from("portal_tokens")
      .select("id,token,location_id,expires_at")
      .eq("company_id",company.id).eq("id",link.id).maybeSingle();
    if(checked.error||!checked.data||checked.data.token!==link.token||
       checked.data.location_id!==link.location_id||
       (!!checked.data.expires_at&&new Date(checked.data.expires_at).getTime()<=Date.now())){
      setLoadError("The link was revoked, rotated or expired. Refresh the portal links before sharing.");
      return;
    }
    const url=`${window.location.origin}/portal/${checked.data.token}`;
    const name=locations.find(l=>l.id===link.location_id)?.name||(
      invitationLanguage==="es"?"su ubicación":"your location");
    const payload=format==="invitation"?(invitationLanguage==="es"?
      `Hola, este es el enlace privado del portal de servicio de ${name}: ${url}\nEl enlace permite ver información de servicio de esa ubicación. No lo reenvíe. Solicite un enlace nuevo si deja de funcionar.`:
      `Hello, here is the private service portal link for ${name}: ${url}\nThis link shows service information for this location. Please do not forward it. Ask the business for a new link if it stops working.`):url;
    try{
      await navigator.clipboard.writeText(payload);
      alert(format==="invitation"?"Invitation message copied. Share it only with an authorized customer contact.":"Link copied. Share it only with an authorized customer contact.");
    }catch{
      window.prompt(format==="invitation"?"Copy this customer invitation:":"Copy this private location link:",payload);
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
    if(message.category==="document_copy"&&status==="resolved"&&
       (!deliveryConfirmed[message.id]||!reply)){
      setResponseError("Verify the recipient and deliver the document privately before marking a contract copy request resolved. Add a customer-safe confirmation message.");return;
    }
    if(message.category==="document_copy"&&(
       reply.toLowerCase().includes("://")||
       reply.toLowerCase().includes("www.")||
       /[.]pdf|[.]docx?|[.]zip/i.test(reply))){
      setResponseError("Do not paste document links, file paths or attachments into a customer-visible reply.");return;
    }
    if(reply&& (reply.length<10||reply.length>1200)){
      setResponseError("Write a customer-safe response of 10–1200 characters, or leave it blank.");return;
    }
    if(!window.confirm(message.customer_contact_id?
      "Save this status and response for the verified customer who submitted this request? Never include private staff information, unrelated locations or sensitive details.":
      "Save this status and response for anyone holding this location's secure customer link? Do not include private staff information or sensitive details."))return;
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
      if(message.category==="document_copy")setDeliveryConfirmed(p=>({...p,[message.id]:false}));
      setResponseNotice(message.customer_contact_id?
        "Response saved. Only this verified contact can view the authenticated request history.":
        "Customer-safe status and response saved. The exact location link can now show the update.");
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
      <section className="panel" id="portal-identity-pilot"
        style={{padding:22,margin:"18px 0",border:"1px solid var(--line)"}}>
        <h3 style={{marginTop:0}}>Authenticated Customer Portal pilot / Prueba del portal con inicio de sesión</h3>
        <p style={{fontSize:"0.9rem",color:"var(--muted)"}}>
          WorkTeams currently uses private links for individual locations. A separate,
          verified customer-account system is being built. Requesting the pilot does
          not create accounts, invite customers, enable downloads, share invoices or
          change the access available through existing location links.
        </p>
        <p role="status"><strong>Authenticated customer login:
         {pilotEnabled===true?" enabled / Activado":pilotEnabled===false?
         " disabled / Desactivado":" checking / Verificando"}</strong></p>
        {pilotError&&<p role="alert" style={{color:"#b3261e"}}>{pilotError}</p>}
        {pilotNotice&&<p role="status">{pilotNotice}</p>}
        {pilotRequested===null?
          <button type="button" style={button} disabled={pilotBusy}
            onClick={()=>void loadPilot()}>Recheck pilot status / Revisar estado</button>:
          <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:12}}>
            <span><strong>{pilotRequested?
              "Pilot requested / Prueba solicitada":
              "Not requested / No solicitado"}</strong></span>
            <button type="button" style={button} disabled={pilotBusy||working||(pilotRequested&&pilotEnabled===true)}
              onClick={()=>void updatePilot(!pilotRequested)}>
              {pilotBusy?"Saving…":pilotRequested?
                "Withdraw pilot request / Cancelar solicitud":
                "Request pilot / Solicitar prueba"}
            </button>
          </div>}
        {pilotRequested===true&&pilotCanActivate&&pilotEnabled!==null&&
          <div style={{borderTop:"1px solid var(--line)",marginTop:16,paddingTop:12}}>
            <p style={{fontSize:"0.85rem"}}>
              Owner-only / Solo propietario. Activating opens only the verified
              company's assigned location-name list. Private billing, contracts,
              documents, signatures and staff remain inaccessible.
            </p>
            <button type="button" disabled={pilotBusy||working}
              style={button} onClick={()=>void changeCustomerLogin(!pilotEnabled)}>
              {pilotEnabled?
                "Disable customer logins now / Desactivar accesos":
                "Activate verified customer logins / Activar accesos verificados"}
            </button>
          </div>}
      </section>
      {pilotRequested===true&&<CustomerDocumentManager
        companyId={company?.id} locations={locations} pilotRequested={pilotRequested}/>}
      {pilotRequested===true&&<ClientIdentityContactManager
        companyId={company?.id} locations={locations}
        pilotRequested={pilotRequested} pilotEnabled={pilotEnabled}/>}
      {pilotRequested===true&&<PublishedServiceScheduleManager companyId={company?.id}/>}
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
            {m.category==="document_copy"&&<p style={{fontWeight:700,color:"var(--brand-deep)",margin:"8px 0"}}>
              Signed contract copy request — verify recipient and deliver privately
            </p>}
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
              {m.category==="document_copy"&&<p style={{fontSize:"0.84rem",color:"var(--muted)"}}>
                Never attach the signed contract or paste a download URL into this shared-link reply.
                Verify the actual intended recipient through a separately trusted channel, deliver the document securely outside WorkTeams,
                then record the customer-safe confirmation and mark this request resolved.
              </p>}
              {m.category==="document_copy"&&(statusDrafts[m.id]??m.customer_status)==="resolved"&&
                <label style={{display:"flex",gap:8,alignItems:"flex-start",margin:"10px 0"}}>
                  <input type="checkbox" checked={deliveryConfirmed[m.id]===true}
                    disabled={working} onChange={e=>setDeliveryConfirmed(p=>({...p,[m.id]:e.target.checked}))}/>
                  <span>I verified the recipient and securely delivered this copy outside the shared client link.</span>
                </label>}
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
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",margin:"8px 0 12px"}}>
        <label htmlFor="client-invitation-language">Customer invitation language / Idioma</label>
        <select id="client-invitation-language" value={invitationLanguage}
          onChange={e=>setInvitationLanguage(e.target.value==="es"?"es":"en")}
          style={{padding:"9px 12px",borderRadius:8,border:"1px solid var(--line)"}}>
          <option value="en">English</option><option value="es">Español</option>
        </select>
      </div>
      <p style={{ color: "var(--muted)" }}>
        Share a location-scoped link per site. Clients may request approved contract copies and see upcoming visits, recent inspection
        scores, and open work orders — no login needed, no financial or staff details. Treat each location link as a private access credential. Share only with an authorized contact, never publicly; rotate expired links.
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
                    <button type="button" disabled={working||linkExpired(t)||Boolean(loadError)} onClick={()=>void copyLink(t)} style={button}>Copy link</button>
                     <button type="button" disabled={working||linkExpired(t)||Boolean(loadError)} onClick={()=>void copyLink(t,"invitation")} style={button}>Copy customer invitation</button>
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
