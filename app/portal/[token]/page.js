"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { formatTime12h } from "../../../lib/dates";

// Public client portal — no login. Data comes only from the
// get_portal_data() security-definer function, which returns
// whitelisted fields: location info, upcoming visits, recent
// inspection scores, and open work orders. No financial data,
// no employee details.
export default function PortalPage() {
  const params = useParams();
  const [language,setLanguage]=useState("en");
  const t=(en,es)=>language==="es"?es:en;
  const localStatus=(raw)=>{
    const es={received:"Recibida",in_progress:"En proceso",resolved:"Resuelta",
      assigned:"Asignada",completed:"Completada",cancelled:"Cancelada",
      pending:"Pendiente",sent:"Enviada",signed:"Firmada",declined:"Rechazada"};
    const key=String(raw||"").toLowerCase();return language==="es"&&es[key]?es[key]:String(raw||"").replace(/_/g," ");
  };
  useEffect(()=>{
    try{
      const stored=localStorage.getItem("workteams-client-portal-language");
      setLanguage(stored==="es"||(!stored&&navigator.language.toLowerCase().startsWith("es"))?"es":"en");
    }catch{setLanguage(navigator.language.toLowerCase().startsWith("es")?"es":"en")}
  },[]);
  const chooseLanguage=(value)=>{
    setLanguage(value);
    try{localStorage.setItem("workteams-client-portal-language",value)}catch{}
  };
  const token = params.token;
  // Ref updates on route changes so delayed refreshes cannot restore another
  // location link's information after navigation.
  const currentPortalToken=useRef(token);
  currentPortalToken.current=token;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState(null);
  const [contact, setContact] = useState({ name: "", subject: "", body: "", category: "general" });
  const [contactSent, setContactSent] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [copyName,setCopyName]=useState("");
  const [copyBusy,setCopyBusy]=useState(false);
  const [copySubmitted,setCopySubmitted]=useState(false);
  const [copyNotice,setCopyNotice]=useState("");
  const [historyRefreshing,setHistoryRefreshing]=useState(false);
  // Two-way conversation (migration 065): per-request thread + reply form.
  const [conversations,setConversations]=useState({});
  const [openConvo,setOpenConvo]=useState(null);
  const [convoDrafts,setConvoDrafts]=useState({});
  const [convoBusy,setConvoBusy]=useState(null);
  const [convoErrors,setConvoErrors]=useState({});
  const [convoNotices,setConvoNotices]=useState({});
  const [cleanReq, setCleanReq] = useState({ kind: "extra", date: "", notes: "" });
  const [cleanBusy, setCleanBusy] = useState(false);
  const [cleanDone, setCleanDone] = useState(null);
  // Temp staffing (Batch 2): request temps + confirm hours, when enabled.
  const [tempReq, setTempReq] = useState({ serviceType: "commercial", cleanersNeeded: 2, hoursRequested: 4, jobDate: "", siteAddress: "", jobDetails: "" });
  const [tempBusy, setTempBusy] = useState(false);
  const [tempDone, setTempDone] = useState(false);
  const [confirming, setConfirming] = useState({});
  const [confirmBusy, setConfirmBusy] = useState(null);
  const [signingAmend, setSigningAmend] = useState(null);
  const [signName, setSignName] = useState("");
  const [signBusy, setSignBusy] = useState(false);
  const portalAction = useRef("");
  const [actionError, setActionError] = useState("");
  // A shared synchronous guard prevents double clicks and conflicting writes.
  function beginAction(name) {
    if (portalAction.current || loading || data?.ok !== true) return false;
    portalAction.current = name;
    setActionError("");
    return true;
  }
  function finishAction(name) {
    if (portalAction.current === name) portalAction.current = "";
  }


  useEffect(() => {
    let cancelled = false;
    setLoading(true);setData(null);setContract(null);setContactSent(false);
    setCleanDone(null);setTempDone(false);setActionError("");
    setCopySubmitted(false);setCopyNotice("");setCopyName("");
    (async () => {
      try {
        const res = await fetch("/api/portal/lookup", {
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({token}),cache:"no-store",
        });
        const result = await res.json();
        if(cancelled||currentPortalToken.current!==token)return;
        // Never fetch a signed contract until the exact location link is valid.
        if(!res.ok||result?.ok!==true){
          setData({ok:false,error:result?.error||"This location link could not be verified."});
          return;
        }
        setData(result);
        if(result.location_address){
          setTempReq(t=>({...t,siteAddress:t.siteAddress||result.location_address}));
        }
        setLoading(false);
        try{
          // The contract endpoint revalidates token, company, location and expiry.
          const contractRes=await fetch(`/api/portal/service?token=${encodeURIComponent(token)}`,{cache:"no-store"});
          if(!contractRes.ok)return;
          const contractJson=await contractRes.json();
          if(!cancelled&&currentPortalToken.current===token&&contractJson?.contract){
            setContract(contractJson.contract);
          }
        }catch{/* Optional agreement must never fabricate contract data. */}
      }catch{
        if(!cancelled&&currentPortalToken.current===token){
          setData({ok:false,error:"Could not load this page. Please try again later."});
        }
      }finally{
        if(!cancelled&&currentPortalToken.current===token)setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function refreshCustomerRequests(allowPending=false){
    if(historyRefreshing||(!allowPending&&portalAction.current))return;
    setHistoryRefreshing(true);
    try{
      const res=await fetch("/api/portal/lookup",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token}),cache:"no-store"
      });
      const payload=await res.json();
      if(currentPortalToken.current!==token)return;
      if(!res.ok||payload?.ok!==true){
        // A location link can expire, be revoked or be rotated between reads.
        // Deny all previously displayed token-scoped content until a new valid lookup.
        setData({ok:false,error:payload?.error||"This location link could not be verified. Reload a valid invitation."});
        setContract(null);setSigningAmend(null);setContactSent(false);
        return;
      }
      if(payload.customer_requests_error||!Array.isArray(payload.customer_requests)){
        // Link verified, but request history is not trustworthy: hide the
        // previously cached requests instead of showing stale statuses.
        setData(previous=>previous?.ok===true?{...previous,customer_requests:[],
          customer_requests_error:payload.customer_requests_error||"Customer request statuses are unavailable."
        }:previous);
        return;
      }
      setData(previous=>previous?.ok===true?{
        ...previous,customer_requests:payload.customer_requests,customer_requests_error:null
      }:previous);
      // A resolved copy request may be submitted again after verified refresh.
      if(!payload.customer_requests.some(r=>r.category==="document_copy"&&r.status!=="resolved"))
        setCopySubmitted(false);
    }catch(error){
      if(currentPortalToken.current!==token)return;
      // Unknown network failure cannot establish that this bearer link is
      // still authorized. Remove private location-scoped content, fail honest.
      setData({ok:false,error:"Could not reverify this location link. Reload to try again."});
      setContract(null);setSigningAmend(null);setContactSent(false);
    }finally{setHistoryRefreshing(false)}
  }

  async function toggleConversation(request){
    if(openConvo===request.id){setOpenConvo(null);return;}
    setOpenConvo(request.id);
    if(conversations[request.id])return;
    setConvoBusy(request.id);
    try{
      const res=await fetch("/api/portal/conversation",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token,message_id:request.id}),cache:"no-store"
      });
      const payload=await res.json();
      if(currentPortalToken.current!==token)return;
      if(!res.ok||payload?.ok!==true||!Array.isArray(payload.replies)){
        setConvoErrors(p=>({...p,[request.id]:payload?.error||t("Conversation could not be loaded.","No se pudo cargar la conversación.")}));
        return;
      }
      setConversations(p=>({...p,[request.id]:payload.replies}));
    }catch{
      if(currentPortalToken.current===token)
        setConvoErrors(p=>({...p,[request.id]:t("Conversation could not be loaded.","No se pudo cargar la conversación.")}));
    }finally{if(currentPortalToken.current===token)setConvoBusy(null)}
  }

  async function sendPortalReply(request){
    const body=String(convoDrafts[request.id]??"").trim();
    if(!body||body.length>1600){
      setConvoErrors(p=>({...p,[request.id]:t("Write a reply of 1 to 1600 characters.","Escriba una respuesta de 1 a 1600 caracteres.")}));
      return;
    }
    if(!beginAction("reply"))return;
    setConvoBusy(request.id);
    setConvoErrors(p=>({...p,[request.id]:""}));
    setConvoNotices(p=>({...p,[request.id]:""}));
    try{
      const res=await fetch("/api/portal/conversation",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token,message_id:request.id,body})
      });
      const payload=await res.json();
      if(currentPortalToken.current!==token)return;
      if(!res.ok||payload?.ok!==true)
        throw new Error(payload?.error||t("Reply status could not be confirmed.","No se pudo confirmar la respuesta."));
      setConvoDrafts(p=>({...p,[request.id]:""}));
      setConvoNotices(p=>({...p,[request.id]:t("Reply saved. Management has been alerted.","Respuesta guardada. Se avisó a la gerencia.")}));
      // Reload the authoritative thread; a reply on a resolved request
      // reopens it, so refresh the status list too.
      const check=await fetch("/api/portal/conversation",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token,message_id:request.id}),cache:"no-store"
      });
      const thread=await check.json();
      if(currentPortalToken.current===token&&check.ok&&thread?.ok===true&&Array.isArray(thread.replies))
        setConversations(p=>({...p,[request.id]:thread.replies}));
      void refreshCustomerRequests(true);
    }catch(err){
      if(currentPortalToken.current===token)
        setConvoErrors(p=>({...p,[request.id]:err instanceof Error?err.message:t("Reply status unknown. Ask the business before resending.","No se confirmó la respuesta. Consulte a la empresa antes de reenviarla.")}));
    }finally{
      if(currentPortalToken.current===token)setConvoBusy(null);
      finishAction("reply");
    }
  }

  async function sendContact(e) {
    e.preventDefault();
    if (!contact.body.trim()) { setActionError(t("Please write your message first.","Escriba su mensaje antes de enviarlo.")); return; }
    if(!beginAction("contact"))return;
    setContactBusy(true);
    try {
      const res = await fetch("/api/portal/contact", {
        method: "POST",headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...contact }),
      });
      const j = await res.json();
      if (!res.ok || j.ok !== true) throw new Error(j.error || t("Message status could not be confirmed.","No se pudo confirmar el mensaje."));
      setContactSent(true);
      setContact({ name: "", subject: "", body: "", category: "general" });
      // A successful message should appear in the same-token status history.
      // Failure to refresh must never be treated as failed message delivery.
      void refreshCustomerRequests(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("Message status unknown. Ask the business before resending.","No se confirmó el mensaje. Consulte a la empresa antes de reenviarlo."));
    } finally {
      setContactBusy(false);finishAction("contact");
    }
  }

  async function requestContractCopy() {
    if(!beginAction("document"))return;
    setCopyBusy(true);setCopyNotice("");
    try {
      const res=await fetch("/api/portal/contact",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token,category:"document_copy",name:copyName.trim()})
      });
      const result=await res.json();
      if(currentPortalToken.current!==token)return;
      if(!res.ok||result?.ok!==true)
        throw new Error(result?.error||t("Contract copy request could not be confirmed.","No se pudo confirmar la solicitud de copia del contrato."));
      setCopySubmitted(true);
      setCopyNotice(result.already_pending?
        t("A contract copy request is already pending. You can check its status below.","Ya existe una solicitud de copia pendiente. Puede consultar su estado abajo."):
        t("Contract copy requested. Management will verify the recipient and arrange secure delivery outside this link. Follow the status below.","Se solicitó una copia del contrato. La gerencia verificará al destinatario y coordinará una entrega segura fuera de este enlace. Consulte el estado abajo."));
      void refreshCustomerRequests(true);
    }catch(err){
      if(currentPortalToken.current===token)setActionError(err instanceof Error?err.message:
        t("Request status unknown. Check with the business before retrying.","Estado desconocido. Consulte a la empresa antes de intentarlo otra vez."));
    }finally{setCopyBusy(false);finishAction("document")}
  }

  async function signAmendment(e) {
    e.preventDefault();
    if (!signingAmend || !signName.trim()) { setActionError(t("Please type your name to sign.","Escriba su nombre para firmar.")); return; }
    if (portalAction.current || !window.confirm(t("Sign this amendment? This makes the changes part of your contract.","¿Firmar esta modificación? Los cambios pasarán a formar parte de su contrato."))) return;
    if(!beginAction("sign"))return;
    setSignBusy(true);
    try {
      const res = await fetch("/api/amendments/sign", {
        method: "POST",headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sign_token: signingAmend.sign_token, name: signName.trim() }),
      });
      const j = await res.json();
      if (!res.ok || j.ok !== true) throw new Error(j.error || t("Signature status could not be confirmed.","No se pudo confirmar la firma."));
      setSigningAmend(null);
      setSignName("");
      window.location.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("Signature status unknown. Ask the business before signing again.","No se confirmó la firma. Consulte a la empresa antes de firmar de nuevo."));
    } finally {
      setSignBusy(false);finishAction("sign");
    }
  }

  async function requestClean(e) {
    e.preventDefault();
    if (!cleanReq.date) { setActionError(t("Pick a date for the extra service.","Seleccione una fecha para el servicio adicional.")); return; }
    if(!beginAction("service"))return;
    setCleanBusy(true);
    try {
      const res = await fetch("/api/portal/service", {
        method: "POST",headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...cleanReq }),
      });
      const j = await res.json();
      if (!res.ok || j.ok !== true) throw new Error(j.error || t("Service request could not be confirmed.","No se pudo confirmar la solicitud de servicio."));
      setCleanDone({ kind: cleanReq.kind, price: j.price });
      setCleanReq({ kind: "extra", date: "", notes: "" });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("Service status unknown. Check with the business before retrying.","No se confirmó la solicitud. Consulte a la empresa antes de reintentar."));
    } finally { setCleanBusy(false);finishAction("service"); }
  }

  async function requestTemps(e) {
    e.preventDefault();
    if(!beginAction("temp"))return;
    setTempBusy(true);
    try {
      const res = await fetch("/api/portal/temp", {
        method: "POST",headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "request", ...tempReq }),
      });
      const j = await res.json();
      if (!res.ok || j.ok !== true) throw new Error(j.error || t("Temp staffing request could not be confirmed.","No se pudo confirmar la solicitud de personal temporal."));
      setTempDone(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("Temp request status unknown. Contact the business before resending.","No se confirmó la solicitud de personal. Contacte a la empresa antes de reenviarla."));
    } finally { setTempBusy(false);finishAction("temp"); }
  }

  async function confirmHours(e, requestId) {
    e.preventDefault();
    const hours = parseFloat(confirming[requestId]);
    if (!Number.isFinite(hours) || hours < 0) { setActionError(t("Enter the hours worked.","Ingrese las horas trabajadas.")); return; }
    if(!beginAction("hours"))return;
    setConfirmBusy(requestId);
    try {
      const res = await fetch("/api/portal/temp", {
        method: "POST",headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "confirm_hours", requestId, hours }),
      });
      const j = await res.json();
      if (!res.ok || j.ok !== true) throw new Error(j.error || t("Hours confirmation could not be verified.","No se pudo verificar la confirmación de horas."));
      window.location.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Hours confirmation status unknown. Check before retrying.");
    } finally { setConfirmBusy(null);finishAction("hours"); }
  }

  const dueAmendments = Array.isArray(data?.amendments) ? data.amendments.filter(a => a.status === "sent").length : 0;
  const hoursToConfirm = Array.isArray(data?.temp_requests) ? data.temp_requests.filter(r => r.hours_confirmed == null && ["assigned","in_progress","completed"].includes(r.status)).length : 0;
  const money = (n) => (n == null ? "priced on request" : "$" + Number(n).toFixed(2));

  return (
    <div>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(255,255,255,0.96)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div className="site-shell" style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12, paddingBottom: 12 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
            <span className="brand-mark" style={{ width: 40, height: 40, flexBasis: 40, borderRadius: 12, fontSize: "0.95rem" }}>
              WT
            </span>
            <strong>WorkTeams</strong>
          </Link>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
             <span style={{fontSize:"0.82rem",color:"var(--muted)"}}>{t("Client portal","Portal del cliente")}</span>
             <label htmlFor="workteams-client-language" style={{fontSize:"0.82rem"}}>{t("Language","Idioma")}</label>
             <select id="workteams-client-language" aria-label="Client Portal language / Idioma"
               value={language} onChange={e=>chooseLanguage(e.target.value==="es"?"es":"en")}
               style={{padding:"7px 9px",borderRadius:8,border:"1px solid var(--line)"}}>
               <option value="en">English</option><option value="es">Español</option>
             </select>
           </div>
        </div>
      </header>
      <main className="site-shell" style={{ paddingTop: 24, paddingBottom: 40, maxWidth: 640 }}>
        {loading && <p>{t('Loading…','Cargando…')}</p>}
        {!loading && data && !data.ok && (
          <section className="panel" style={{ padding: 30 }}>
            <h2 style={{ marginTop: 0 }}>{t('Link unavailable','Enlace no disponible')}</h2>
            <p style={{ color: "var(--muted)" }}>{data.error}</p>
          </section>
        )}
        {!loading && data && data.ok && (
          <div>
            <p className="eyebrow">{t('SERVICE UPDATES','ACTUALIZACIONES DEL SERVICIO')}</p>
            <h2 style={{ fontSize: "1.8rem", margin: "4px 0" }}>{data.location_name}</h2>
            {data.location_address && <p style={{ color: "var(--muted)" }}>{data.location_address}</p>}
            {data.client_name && <p style={{ color: "var(--muted)" }}>{t("Prepared for","Preparado para")} {data.client_name}</p>}
            <nav className="panel" aria-label="Client Portal quick access" style={{ padding: 18, margin: "18px 0" }}>
              <h3 style={{margin:"0 0 10px"}}>Quick Access / Acceso rápido</h3>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                <a href="#portal-visits">{t("Upcoming visits","Próximas visitas")}</a>
                <a href="#portal-inspections">{t("Published quality reports","Informes de calidad publicados")}</a>
                <a href="#portal-documents">{t("Documents & agreements","Documentos y contratos")}</a>
                <a href="#portal-work">{t("Open work","Trabajos pendientes")}</a>
                {contract && <a href="#portal-contract">{t("Contract & scope","Contrato y alcance")}</a>}
                {data?.amendments?.length > 0 && <a href="#portal-amendments">{t("Contract amendments","Modificaciones del contrato")}{dueAmendments>0? ` (${dueAmendments} ${t("to sign","por firmar")})` : ""}</a>}
                <a href="#portal-extra">{t("Extra service","Servicio adicional")}</a>
                {data.temp_enabled && <a href="#portal-temp">{t("Temp staffing","Personal temporal")}</a>}
                <a href="#portal-contact">{t("Contact us","Contáctenos")}</a>
                <a href="#portal-customer-requests">{t("My request statuses","Estado de mis solicitudes")}</a>
              </div>
              <p style={{fontSize:"0.85rem",color:"var(--muted)",marginBottom:0}}>Amendments awaiting signature: {dueAmendments} · Temp hours to confirm: {hoursToConfirm}. This secure link is for this location only.</p>
            </nav>
            {actionError && <div role="alert" className="panel" style={{padding:16,border:"1px solid #b3261e",margin:"12px 0"}}><strong>{t("Action not confirmed","Acción no confirmada")}</strong><p>{actionError}</p><p style={{fontSize:"0.82rem"}}>{t("If your connection stopped after sending, contact the business before submitting the same request again.","Si se perdió la conexión después del envío, consulte a la empresa antes de enviar la misma solicitud nuevamente.")}</p></div>}

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 id="portal-visits" style={{ marginTop: 0 }}>{t("Upcoming visits","Próximas visitas")}</h3>
              {data.upcoming.length === 0 && <p style={{ color: "var(--muted)" }}>{t("No visits scheduled in the next two weeks.","No hay visitas programadas en las próximas dos semanas.")}</p>}
              <div style={{ display: "grid", gap: 8 }}>
                {data.upcoming.map((s, i) => (
                  <div key={i} className="portal-card" style={{ minHeight: 0, padding: "12px 16px" }}>
                    <strong>{s.shift_date}</strong>
                    <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                      {formatTime12h(s.start_time)} – {formatTime12h(s.end_time)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 id="portal-inspections" style={{ marginTop: 0 }}>{t("Published quality reports","Informes de calidad publicados")}</h3>
              <p style={{fontSize:"0.82rem",color:"var(--muted)"}}>Only quality summaries approved by the business for this location are visible. Inspection notes, photos, internal checklists and employee identities are private.</p>
              {data.inspections.length === 0 && <p style={{ color: "var(--muted)" }}>{t("No quality reports have been approved for customer sharing yet.","Aún no hay informes de calidad aprobados para compartir.")}</p>}
              <div style={{ display: "grid", gap: 8 }}>
                {data.inspections.map((x, i) => (
                  <div key={i} className="portal-card" style={{ minHeight: 0, padding: "12px 16px" }}>
                    <span className="card-kicker">{x.inspection_date} • {"★".repeat(x.score || 0)}</span>
                    {x.customer_summary && <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>{x.customer_summary}</p>}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 id="portal-work" style={{ marginTop: 0 }}>{t("Open work","Trabajos pendientes")}</h3>
              {data.work_orders.length === 0 && <p style={{ color: "var(--muted)" }}>{t("Nothing open right now.","No hay trabajos pendientes.")}</p>}
              <div style={{ display: "grid", gap: 8 }}>
                {data.work_orders.map((w, i) => (
                  <div key={i} className="portal-card" style={{ minHeight: 0, padding: "12px 16px" }}>
                    <span className="card-kicker">
                      {w.status === "in_progress" ? t("In progress","En proceso") : t("Open","Abierto")}
                      {w.priority && w.priority !== "normal" ? ` • ${w.priority}` : ""}
                    </span>
                    <p style={{ margin: "6px 0 0", fontWeight: 700 }}>{w.title}</p>
                    {w.description && <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>{w.description}</p>}
                    {w.due_date && <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>Due {w.due_date}</p>}
                  </div>
                ))}
              </div>
            </section>

            <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Questions about your service? Use the contact form below or reach out directly.
            </p>

            <section className="panel" id="portal-documents" style={{padding:22,margin:"18px 0"}}>
              <h3 style={{marginTop:0}}>{t('Documents & Agreements / Documentos y contratos','Documentos y contratos')}</h3>
              <p style={{fontSize:"0.9rem",color:"var(--muted)"}}>
                This secure location link includes only approved contract details and amendment statuses.
                It does not provide private downloadable company files or account-wide records.
                Use the request button below to ask management for a signed copy. You can track its status on this location link.
              </p>
              <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                {contract?<a href="#portal-contract">Review location contract / Revisar contrato</a>:<span>{t("No contract summary is currently available.","No hay un resumen de contrato disponible.")}</span>}
                {data?.amendments?.length>0&&<a href="#portal-amendments">Review amendments / Revisar modificaciones</a>}
                <div style={{display:"grid",gap:8,minWidth:220,maxWidth:"100%"}}>
                  <label htmlFor="portal-contract-copy-name">{t("Your name (optional, helps verify delivery)","Su nombre (opcional; facilita verificar la entrega)")}</label>
                  <input id="portal-contract-copy-name" type="text" autoComplete="name"
                    value={copyName} onChange={e=>setCopyName(e.target.value)}
                    maxLength={120} style={pInput} disabled={copyBusy}/>
                  <button type="button"
                    disabled={copyBusy||Boolean(portalAction.current)||copySubmitted||
                      data?.customer_requests?.some(r=>r.category==="document_copy"&&r.status!=="resolved")}
                    onClick={()=>void requestContractCopy()}
                    style={{...pButton,padding:"8px 16px",width:"auto"}}>
                    {copyBusy?t("Sending request…","Enviando solicitud…"):t("Request a contract copy","Solicitar copia del contrato")}
                  </button>
                </div>
              </div>
              {copyNotice&&<p role="status" style={{marginTop:10}}>{copyNotice}</p>}
              <p style={{fontSize:"0.82rem",color:"var(--muted)"}}>{t("No private document is sent through this shared link. Management will verify the recipient and deliver it securely outside WorkTeams.","No se envían documentos privados mediante este enlace compartido. La gerencia verificará al destinatario y realizará la entrega de forma segura fuera de WorkTeams.")}</p>
            </section>

            {contract && (
              <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
                <h3 id="portal-contract" style={{ marginTop: 0 }}>{t('My contract','Mi contrato')}</h3>
                <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                  Effective {contract.start_date}
                  {contract.end_date ? ` through ${contract.end_date}` : ""}
                  {contract.visits_per_week ? ` • ${contract.visits_per_week} visit${contract.visits_per_week > 1 ? "s" : ""}/week` : ""}
                  {contract.price_per_visit != null ? ` • $${Number(contract.price_per_visit).toFixed(2)}/visit` : ""}
                </p>
                {Array.isArray(contract.scope_of_work) && contract.scope_of_work.length > 0 && (
                  <>
                    <p style={{ fontWeight: 700, marginBottom: 6 }}>{t('Scope of work','Alcance del trabajo')}</p>
                    <ul style={{ marginTop: 0, paddingLeft: 20 }}>
                      {contract.scope_of_work.map((s, i) => (
                        <li key={i} style={{ fontSize: "0.9rem" }}>{typeof s === "string" ? s : s.task}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  Rate increases {contract.yearly_increase_pct ?? 3}% yearly. Extra clean: {money(contract.extra_clean_price)} •
                  Heavy clean: {money(contract.heavy_clean_price)}.
                </p>
                {contract.terms_text && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "0.9rem", color: "var(--brand-deep)" }}>
                      {t('View full contract terms','Ver los términos completos del contrato')}
                    </summary>
                    <div style={{ whiteSpace: "pre-line", fontSize: "0.85rem", lineHeight: 1.6, marginTop: 10, padding: 14, background: "var(--bg-soft)", borderRadius: 8 }}>
                      {contract.terms_text}
                    </div>
                  </details>
                )}
              </section>
            )}

            {data?.amendments?.length > 0 && (
              <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
                <h3 id="portal-amendments" style={{ marginTop: 0 }}>{t('Contract amendments','Modificaciones del contrato')}</h3>
                {data.amendments.map((a) => (
                  <div key={a.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                    <p style={{ fontWeight: 800, margin: "0 0 6px" }}>{a.title}</p>
                    <p style={{ fontSize: "0.9rem", whiteSpace: "pre-line", margin: "0 0 8px" }}>{a.description}</p>
                    {a.changes && Object.keys(a.changes).length > 0 && (
                      <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 8px" }}>
                        {a.changes.price_per_visit ? `New price: $${Number(a.changes.price_per_visit).toFixed(2)}/visit. ` : ""}
                        {a.changes.visits_per_week ? `New schedule: ${a.changes.visits_per_week}/week. ` : ""}
                        {a.changes.end_date ? `New end date: ${a.changes.end_date}.` : ""}
                      </p>
                    )}
                    {a.status === "signed" ? (
                      <p style={{ color: "#1e8e4d", fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>
                        ✅ Signed by {a.signed_name} on {new Date(a.signed_at).toLocaleDateString()}
                      </p>
                    ) : a.status === "sent" ? (
                      <button disabled={Boolean(portalAction.current)} onClick={() => setSigningAmend(a)} style={{ ...pButton, padding: "10px 20px" }}>
                        Review & sign
                      </button>
                    ) : null}
                  </div>
                ))}
              </section>
            )}

            {signingAmend && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
                <form onSubmit={signAmendment} aria-busy={signBusy} aria-labelledby="portal-sign-amendment-title" style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 480, width: "100%", display: "grid", gap: 12 }}>
                  <h3 id="portal-sign-amendment-title" style={{ margin: 0 }}>{t('Sign amendment','Firmar modificación')}</h3>
                  <p style={{ fontWeight: 800, margin: 0 }}>{signingAmend.title}</p>
                  <p style={{ fontSize: "0.9rem", whiteSpace: "pre-line", margin: 0 }}>{signingAmend.description}</p>
                  <input aria-label={t("Full legal name for signature","Nombre legal completo para la firma")} autoComplete="name" required placeholder={t("Type your full name to sign","Escriba su nombre completo para firmar")} value={signName} onChange={(e) => setSignName(e.target.value)} style={pInput} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" disabled={signBusy} onClick={() => setSigningAmend(null)} style={{ ...pButton, background: "#fff", color: "var(--text)", border: "1px solid var(--line)" }}>{t('Cancel','Cancelar')}</button>
                    <button type="submit" disabled={signBusy || Boolean(portalAction.current)} style={pButton}>{signBusy ? t("Signing…","Firmando…") : t("Sign amendment","Firmar modificación")}</button>
                  </div>
                </form>
              </div>
            )}

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 id="portal-extra" style={{ marginTop: 0 }}>{t('Request extra service','Solicitar servicio adicional')}</h3>
              {cleanDone ? (
                <p style={{ color: "#1e8e4d", fontWeight: 700 }}>
                  ✅ Request received — we'll confirm your {cleanDone.kind} clean shortly
                  {cleanDone.price != null ? ` (${money(cleanDone.price)})` : ""}.
                </p>
              ) : (
                <form onSubmit={requestClean} aria-busy={cleanBusy} aria-label={t("Request extra service","Solicitar servicio adicional")} style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                      Service
                      <select value={cleanReq.kind} onChange={(e) => setCleanReq({ ...cleanReq, kind: e.target.value })} style={pInput}>
                        <option value="extra">Extra clean{contract ? ` — ${money(contract.extra_clean_price)}` : ""}</option>
                        <option value="heavy">Heavy clean{contract ? ` — ${money(contract.heavy_clean_price)}` : ""}</option>
                      </select>
                    </label>
                    <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                      Preferred date
                      <input type="date" required value={cleanReq.date} onChange={(e) => setCleanReq({ ...cleanReq, date: e.target.value })} style={pInput} />
                    </label>
                  </div>
                  <textarea aria-label={t("Additional service notes (optional)","Notas adicionales del servicio (opcional)")} placeholder={t("Notes (optional)","Notas (opcional)")} value={cleanReq.notes} onChange={(e) => setCleanReq({ ...cleanReq, notes: e.target.value })} rows={2} style={pInput} />
                  <button type="submit" disabled={cleanBusy || Boolean(portalAction.current)} style={pButton}>{cleanBusy ? t("Sending…","Enviando…") : t("Request service","Solicitar servicio")}</button>
                </form>
              )}
            </section>

            {data.temp_enabled && (
              <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
                <h3 id="portal-temp" style={{ marginTop: 0 }}>{t('Request temp staff','Solicitar personal temporal')}</h3>
                {tempDone ? (
                  <p role="status" aria-live="polite" style={{ color: "#1e8e4d", fontWeight: 700 }}>✅ Request received — we'll confirm your temp staff shortly.</p>
                ) : (
                  <form onSubmit={requestTemps} aria-busy={tempBusy} aria-label={t("Request temp staff","Solicitar personal temporal")} style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        Service
                        <select value={tempReq.serviceType} onChange={(e) => setTempReq({ ...tempReq, serviceType: e.target.value })} style={pInput}>
                          <option value="commercial">Office & Commercial</option>
                          <option value="residential">Residential</option>
                          <option value="move_in_out">Move In / Move Out</option>
                          <option value="construction_cleanup">Construction Cleanup</option>
                          <option value="day_janitorial">Day Janitorial</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        Temps needed
                        <input type="number" min="1" max="50" required value={tempReq.cleanersNeeded} onChange={(e) => setTempReq({ ...tempReq, cleanersNeeded: e.target.value })} style={pInput} />
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        Hours
                        <input type="number" min="1" max="500" step="0.5" required value={tempReq.hoursRequested} onChange={(e) => setTempReq({ ...tempReq, hoursRequested: e.target.value })} style={pInput} />
                      </label>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        Date needed
                        <input type="date" value={tempReq.jobDate} onChange={(e) => setTempReq({ ...tempReq, jobDate: e.target.value })} style={pInput} />
                      </label>
                    </div>
                    <label style={{ fontSize: "0.85rem", display: "grid", gap: 4 }}>
                      Site address
                      <input required value={tempReq.siteAddress} onChange={(e) => setTempReq({ ...tempReq, siteAddress: e.target.value })} style={pInput} />
                    </label>
                    <textarea aria-label={t("Staffing job details (optional)","Detalles del personal solicitado (opcional)")} placeholder={t("Job details (optional)","Detalles del trabajo (opcional)")} value={tempReq.jobDetails} onChange={(e) => setTempReq({ ...tempReq, jobDetails: e.target.value })} rows={2} style={pInput} />
                    <button type="submit" disabled={tempBusy || Boolean(portalAction.current)} style={pButton}>{tempBusy ? t("Sending…","Enviando…") : t("Request temp staff","Solicitar personal temporal")}</button>
                  </form>
                )}
              </section>
            )}

            {data.temp_enabled && data.temp_requests && data.temp_requests.length > 0 && (
              <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
                <h3 style={{ marginTop: 0 }}>{t('My temp requests','Mis solicitudes de personal temporal')}</h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {data.temp_requests.map((r) => (
                    <div key={r.id} className="portal-card" style={{ minHeight: 0, padding: "12px 16px" }}>
                      <strong>{localStatus(r.service_type)}</strong>
                      <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                        {r.cleaners_needed} temp(s) × {r.hours_requested} hr
                        {r.job_date ? ` · ${r.job_date}` : ""} · {localStatus(r.status)}
                      </div>
                      {r.hours_confirmed != null ? (
                        <p style={{ color: "#1e8e4d", fontWeight: 700, fontSize: "0.9rem", margin: "8px 0 0" }}>
                          ✅ Hours confirmed: {r.hours_confirmed}
                        </p>
                      ) : ["assigned", "in_progress", "completed"].includes(r.status) ? (
                        <form onSubmit={(e) => confirmHours(e, r.id)} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <input
                            aria-label={t("Hours worked to confirm","Horas trabajadas por confirmar")} type="number" min="0" step="0.25" required
                            placeholder={t("Hours worked","Horas trabajadas")}
                            value={confirming[r.id] || ""}
                            onChange={(e) => setConfirming({ ...confirming, [r.id]: e.target.value })}
                            style={{ ...pInput, flex: 1 }}
                          />
                          <button type="submit" disabled={confirmBusy === r.id || Boolean(portalAction.current)} style={{ ...pButton, padding: "11px 18px" }}>
                            {confirmBusy === r.id ? t("Saving…","Guardando…") : t("Confirm hours","Confirmar horas")}
                          </button>
                        </form>
                      ) : (
                        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "8px 0 0" }}>
                          We'll ask you to confirm hours once the job is done.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 id="portal-contact" style={{ marginTop: 0 }}>{t('Contact us','Contáctenos')}</h3>
              {contactSent ? (
                <p role="status" aria-live="polite" style={{ color: "#1e8e4d", fontWeight: 700 }}>✅ Message sent — we'll get back to you soon.</p>
              ) : (
                <form onSubmit={sendContact} aria-busy={contactBusy} aria-label={t("Contact customer service","Contactar al servicio al cliente")} style={{ display: "grid", gap: 10 }}>
                  <div role="radiogroup" aria-label={t("Reason for contacting us","Motivo de la consulta")} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      ["general", "💬 General question"],
                      ["service_problem", "⚠️ Problem with service"],
                      ["callback_request", "📞 Please call me"],
                    ].map(([val, label]) => (
                      <label key={val} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.9rem", fontWeight: contact.category === val ? 800 : 400, cursor: "pointer", padding: "8px 12px", borderRadius: 999, border: contact.category === val ? "2px solid var(--brand)" : "1px solid var(--line)", background: contact.category === val ? "var(--bg-soft)" : "transparent" }}>
                        <input type="radio" name="category" value={val} checked={contact.category === val} onChange={() => setContact({ ...contact, category: val })} style={{ accentColor: "var(--brand)", marginRight: 6 }} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input aria-label={t("Your name","Su nombre")} autoComplete="name" placeholder={t("Your name","Su nombre")} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} style={{ ...pInput, flex: 1 }} />
                    <input aria-label={t("Subject","Asunto")} placeholder={t("Subject","Asunto")} value={contact.subject} onChange={(e) => setContact({ ...contact, subject: e.target.value })} style={{ ...pInput, flex: 1 }} />
                  </div>
                  <textarea aria-label={t("Your message to customer service","Su mensaje al servicio al cliente")} placeholder={contact.category === "service_problem" ? "Tell us what went wrong — we'll make it right." : contact.category === "callback_request" ? "Best number and time to reach you…" : "How can we help?"} required value={contact.body} onChange={(e) => setContact({ ...contact, body: e.target.value })} rows={3} style={pInput} />
                  <button type="submit" disabled={contactBusy || Boolean(portalAction.current)} style={pButton}>{contactBusy ? t("Sending…","Enviando…") : t("Send message","Enviar mensaje")}</button>
                </form>
              )}
            </section>

            <section className="panel" id="portal-customer-requests" style={{padding:22,margin:"18px 0"}}>
              <h3 style={{marginTop:0}}>{t('My Request Status / Estado de mis solicitudes','Estado de mis solicitudes')}</h3>
              <p style={{fontSize:"0.85rem",color:"var(--muted)"}}>
                This link is shared by service location. For privacy, request history shows only
                date, category, status and customer-approved replies. Original personal messages,
                contact details, internal notes and staff information are never displayed here.
              </p>
              {data.customer_requests_error&&<div role="alert" style={{color:"#b3261e"}}>
                Request status could not be confirmed: {data.customer_requests_error}.
                Your prior messages have not been deleted.
              </div>}
              <button type="button" disabled={historyRefreshing||Boolean(portalAction.current)}
                onClick={()=>void refreshCustomerRequests()} style={{...pButton,padding:"8px 14px",width:"auto"}}>
                {historyRefreshing?t("Refreshing…","Actualizando…"):t("Refresh request status / Actualizar estado","Actualizar estado")}
              </button>
              {!data.customer_requests_error&&Array.isArray(data.customer_requests)&&data.customer_requests.length===0&&
                <p style={{color:"var(--muted)"}}>{t("No customer service requests have been submitted through this location link.","No se han enviado solicitudes desde este enlace de ubicación.")}</p>}
              {!data.customer_requests_error&&Array.isArray(data.customer_requests)&&data.customer_requests.map(r=>(
                <article key={r.id} style={{border:"1px solid var(--line)",padding:14,borderRadius:12,marginTop:10}}>
                  <strong>{r.category==="service_problem"?t("Service concern","Problema con el servicio"):r.category==="callback_request"?t("Callback request","Solicitud de llamada"):r.category==="document_copy"?t("Signed contract copy","Copia del contrato firmado"):t("General request","Solicitud general")}</strong>
                  <p style={{margin:"6px 0",fontSize:"0.85rem",color:"var(--muted)"}}>
                    {r.created_at?new Date(r.created_at).toLocaleString(language==="es"?"es-US":"en-US"):t("Date unavailable","Fecha no disponible")} · 
                    {r.status==="resolved"?t(" Resolved / Resuelto"," Resuelto"):r.status==="in_progress"?t(" In progress / En curso"," En curso"):t(" Received / Recibido"," Recibido")}
                  </p>
                  {r.response&&<p style={{whiteSpace:"pre-wrap",margin:"8px 0 0"}}>
                    <strong>{t("Business response / Respuesta:","Respuesta del negocio:")}</strong> {r.response}
                  </p>}
                  <button type="button" disabled={Boolean(portalAction.current)||convoBusy===r.id}
                    onClick={()=>void toggleConversation(r)}
                    style={{...pButton,padding:"8px 14px",width:"auto",marginTop:10}}>
                    {openConvo===r.id?t("Hide conversation","Ocultar conversación"):t("View conversation & reply","Ver conversación y responder")}
                  </button>
                  {openConvo===r.id&&(
                    <div style={{marginTop:10,borderTop:"1px dashed var(--line)",paddingTop:10}}>
                      <p style={{fontSize:"0.82rem",color:"var(--muted)",margin:"0 0 8px"}}>
                        {t("Replies written here are visible on this location link. Please do not include private phone numbers or personal details.","Las respuestas escritas aquí son visibles en este enlace de ubicación. No incluya números de teléfono privados ni datos personales.")}
                      </p>
                      {convoErrors[r.id]&&<p role="alert" style={{color:"#b3261e"}}>{convoErrors[r.id]}</p>}
                      {convoNotices[r.id]&&<p role="status" style={{color:"#1e8e4d",fontWeight:700}}>{convoNotices[r.id]}</p>}
                      {convoBusy===r.id&&!conversations[r.id]&&<p role="status">{t("Loading conversation…","Cargando conversación…")}</p>}
                      <div style={{display:"grid",gap:8}}>
                        {(conversations[r.id]||[]).map((entry,idx)=>(
                          <div key={entry.id||`legacy-${idx}`} style={{borderLeft:entry.sender_role==="business"?"3px solid var(--brand)":"3px solid var(--line)",paddingLeft:10}}>
                            <p style={{margin:0,fontSize:"0.8rem",color:"var(--muted)"}}>
                              <strong>{entry.sender_role==="business"?t("Business reply","Respuesta del negocio"):t("Your reply","Su respuesta")}</strong>
                              {" • "}{entry.created_at?new Date(entry.created_at).toLocaleString(language==="es"?"es-US":"en-US"):t("Date unavailable","Fecha no disponible")}
                            </p>
                            <p style={{margin:"2px 0 0",whiteSpace:"pre-wrap"}}>{entry.body}</p>
                          </div>
                        ))}
                      </div>
                      <form onSubmit={e=>{e.preventDefault();void sendPortalReply(r);}} style={{display:"grid",gap:8,marginTop:10}}>
                        <label htmlFor={`portal-reply-${r.id}`} style={{fontWeight:700,fontSize:"0.9rem"}}>{t("Reply to the business","Responder al negocio")}</label>
                        <textarea id={`portal-reply-${r.id}`} rows={3} maxLength={1600}
                          value={convoDrafts[r.id]??""}
                          onChange={e=>setConvoDrafts(p=>({...p,[r.id]:e.target.value}))}
                          placeholder={t("Write a follow-up about this request.","Escriba un seguimiento sobre esta solicitud.")}
                          style={pInput}/>
                        <button type="submit" disabled={Boolean(portalAction.current)||convoBusy===r.id||!(convoDrafts[r.id]??"").trim()}
                          style={{...pButton,padding:"10px 16px",width:"auto"}}>
                          {convoBusy===r.id?t("Sending…","Enviando…"):t("Send reply","Enviar respuesta")}
                        </button>
                      </form>
                    </div>
                  )}
                </article>
              ))}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

const pInput = { padding: "11px 13px", borderRadius: 12, border: "1px solid var(--line)", fontSize: "1rem", width: "100%" };
const pButton = { padding: "12px", borderRadius: 999, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 800, cursor: "pointer" };
