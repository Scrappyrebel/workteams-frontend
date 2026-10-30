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
  // Ref-mirror of the language (same pattern as the authenticated customer
  // portal's tr): async continuations localize with the settled language,
  // not the language captured when the fetch started.
  const latestLanguage=useRef(language);
  latestLanguage.current=language;
  const tr=(en,es)=>latestLanguage.current==="es"?es:en;
  const localStatus=(raw)=>{
    const es={received:"Recibida",in_progress:"En proceso",resolved:"Resuelta",
      assigned:"Asignada",completed:"Completada",cancelled:"Cancelada",
      pending:"Pendiente",sent:"Enviada",signed:"Firmada",declined:"Rechazada",
      commercial:"Oficinas y comercios",residential:"Residencial",
      move_in_out:"Mudanzas (entrada/salida)",construction_cleanup:"Limpieza de construcción",
      day_janitorial:"Limpieza diurna",other:"Otro",
      urgent:"Urgente",high:"Alta",low:"Baja"};
    const key=String(raw||"").toLowerCase();return language==="es"&&es[key]?es[key]:String(raw||"").replace(/_/g," ");
  };
  // The portal API routes answer with a closed, customer-safe English error
  // vocabulary. A known string renders in the selected language only; any
  // unrecognized server text (or a browser fetch failure) falls back to the
  // caller's own translated message — raw server text never reaches the
  // customer in either language.
  const SERVER_ERROR_ES={
    "Too many requests. Try again shortly.":"Demasiadas solicitudes. Inténtelo de nuevo en un momento.",
    "Too many replies. Try again shortly.":"Demasiadas respuestas. Inténtelo de nuevo en un momento.",
    "This link is not valid.":"Este enlace no es válido.",
    "This location link is not valid.":"Este enlace de ubicación no es válido.",
    "This location link is no longer authorized.":"Este enlace de ubicación ya no está autorizado.",
    "Could not load this page. Please try again later.":"No se pudo cargar esta página. Inténtelo de nuevo más tarde.",
    "Request status is temporarily unavailable. Please try again.":"El estado de las solicitudes no está disponible temporalmente. Inténtelo de nuevo.",
    "A document request is already pending. Refresh the request status before submitting another.":"Ya hay una solicitud de documento pendiente. Actualice el estado de la solicitud antes de enviar otra.",
    "Could not confirm the request was saved.":"No se pudo confirmar que la solicitud se guardó.",
    "Enter a message of up to 4000 characters.":"Ingrese un mensaje de hasta 4000 caracteres.",
    "Existing document requests could not be verified.":"No se pudieron verificar las solicitudes de documentos existentes.",
    "No approved signed contract is available for this location. Contact the business.":"No hay un contrato firmado y aprobado disponible para esta ubicación. Contacte a la empresa.",
    "Please enter a shorter contact name.":"Ingrese un nombre de contacto más corto.",
    "Request status could not be confirmed. Check with the business before retrying.":"No se pudo confirmar el estado de la solicitud. Consulte a la empresa antes de reintentar.",
    "Signed contract availability could not be verified.":"No se pudo verificar la disponibilidad del contrato firmado.",
    "Conversation could not be loaded. Try again.":"No se pudo cargar la conversación. Inténtelo de nuevo.",
    "Conversation could not be updated.":"No se pudo actualizar la conversación.",
    "Conversation status could not be confirmed.":"No se pudo confirmar el estado de la conversación.",
    "This request is not available on this link.":"Esta solicitud no está disponible en este enlace.",
    "Write a reply of 1 to 1600 characters.":"Escriba una respuesta de 1 a 1600 caracteres.",
    "A valid service, date and note (up to 2000 characters) are required.":"Se requieren un servicio válido, una fecha y una nota (de hasta 2000 caracteres).",
    "Contract access could not be verified.":"No se pudo verificar el acceso al contrato.",
    "Contract pricing could not be verified.":"No se pudieron verificar los precios del contrato.",
    "Could not submit request.":"No se pudo enviar la solicitud.",
    "Invalid location link":"Enlace de ubicación no válido",
    "Invalid location link.":"Enlace de ubicación no válido.",
    "Location access could not be verified.":"No se pudo verificar el acceso a la ubicación.",
    "No signed contract rate is available for this service. Contact the business for a quote.":"No hay una tarifa de contrato firmado disponible para este servicio. Contacte a la empresa para solicitar una cotización.",
    "Not found":"No encontrado",
    "Not found.":"No encontrado.",
    "This link has expired.":"Este enlace ha vencido.",
    "Choose a service type.":"Seleccione un tipo de servicio.",
    "Could not confirm hours.":"No se pudieron confirmar las horas.",
    "Could not process request.":"No se pudo procesar la solicitud.",
    "Enter the hours worked.":"Ingrese las horas trabajadas.",
    "Hours can't be confirmed yet.":"Las horas aún no se pueden confirmar.",
    "Hours must be between 1 and 500.":"Las horas deben estar entre 1 y 500.",
    "Hours were not confirmed. Refresh the request before trying again.":"Las horas no se confirmaron. Actualice la solicitud antes de intentarlo de nuevo.",
    "Invalid request.":"Solicitud no válida.",
    "Location is no longer available.":"La ubicación ya no está disponible.",
    "Number of temps must be between 1 and 50.":"El número de temporales debe estar entre 1 y 50.",
    "Request status could not be verified.":"No se pudo verificar el estado de la solicitud.",
    "Service location access could not be verified.":"No se pudo verificar el acceso a la ubicación del servicio.",
    "Site address is required.":"La dirección del sitio es obligatoria.",
    "Temp staffing availability could not be verified.":"No se pudo verificar la disponibilidad de personal temporal.",
    "Temp staffing is not available.":"El personal temporal no está disponible.",
    "Unknown action.":"Acción desconocida.",
    "Amendment not found.":"No se encontró la modificación.",
    "Could not sign the amendment.":"No se pudo firmar la modificación.",
    "Signature name is required.":"El nombre de la firma es obligatorio.",
    "This amendment is already signed.":"Esta modificación ya está firmada.",
    "This amendment was declined.":"Esta modificación fue rechazada."
  };
  const localError=(raw,fallbackEn,fallbackEs)=>{
    const key=String(raw||"").trim();
    if(key&&Object.prototype.hasOwnProperty.call(SERVER_ERROR_ES,key))
      return latestLanguage.current==="es"?SERVER_ERROR_ES[key]:key;
    return tr(fallbackEn,fallbackEs);
  };
  // Throws an already-localized error the catches may display as-is; any
  // other error (fetch failures included) shows the catch's own fallback.
  // The fallback arrives as the caller's own t() pair, evaluated in the
  // selected language; a known server string wins over it.
  const localThrow=(raw,fallback)=>{
    const key=String(raw||"").trim();
    const known=Boolean(key)&&Object.prototype.hasOwnProperty.call(SERVER_ERROR_ES,key);
    const err=new Error(known?(latestLanguage.current==="es"?SERVER_ERROR_ES[key]:key):fallback);
    err.portalLocal=true;
    return err;
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
          setData({ok:false,error:localError(result?.error,"This location link could not be verified.","No se pudo verificar este enlace de ubicación.")});
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
          setData({ok:false,error:tr("Could not load this page. Please try again later.","No se pudo cargar esta página. Inténtelo de nuevo más tarde.")});
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
        setData({ok:false,error:localError(payload?.error,"This location link could not be verified. Reload a valid invitation.","No se pudo verificar este enlace de ubicación. Recargue una invitación válida.")});
        setContract(null);setSigningAmend(null);setContactSent(false);
        return;
      }
      if(payload.customer_requests_error||!Array.isArray(payload.customer_requests)){
        // Link verified, but request history is not trustworthy: hide the
        // previously cached requests instead of showing stale statuses.
        setData(previous=>previous?.ok===true?{...previous,customer_requests:[],
          customer_requests_error:localError(payload.customer_requests_error,"Customer request statuses are unavailable.","El estado de las solicitudes no está disponible.")
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
      setData({ok:false,error:tr("Could not reverify this location link. Reload to try again.","No se pudo volver a verificar este enlace de ubicación. Recargue para intentarlo de nuevo.")});
      setContract(null);setSigningAmend(null);setContactSent(false);
    }finally{setHistoryRefreshing(false)}
  }

  // Migration 071: opening a conversation clears its "new reply" flag.
  // Best-effort — if the mark fails (or 071 has not run yet) the flag
  // simply stays for the next open; nothing else depends on it.
  async function markConversationSeen(request){
    try{
      const res=await fetch("/api/portal/conversation",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token,message_id:request.id,mark_seen:true}),cache:"no-store"
      });
      const payload=await res.json().catch(()=>null);
      if(currentPortalToken.current!==token||!res.ok||payload?.ok!==true)return;
      setData(p=>p?.ok===true?{...p,customer_requests:(p.customer_requests||[]).map(x=>x.id===request.id?{...x,has_unseen_reply:false}:x)}:p);
    }catch{/* the flag clears on a later open */}
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
        setConvoErrors(p=>({...p,[request.id]:localError(payload?.error,"Conversation could not be loaded.","No se pudo cargar la conversación.")}));
        return;
      }
      setConversations(p=>({...p,[request.id]:payload.replies}));
      void markConversationSeen(request);
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
        throw localThrow(payload?.error,t("Reply status could not be confirmed.","No se pudo confirmar la respuesta."));
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
      void markConversationSeen(request);
      void refreshCustomerRequests(true);
    }catch(err){
      if(currentPortalToken.current===token)
        setConvoErrors(p=>({...p,[request.id]:err?.portalLocal?err.message:t("Reply status unknown. Ask the business before resending.","No se confirmó la respuesta. Consulte a la empresa antes de reenviarla.")}));
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
      if (!res.ok || j.ok !== true) throw localThrow(j.error,t("Message status could not be confirmed.","No se pudo confirmar el mensaje."));
      setContactSent(true);
      setContact({ name: "", subject: "", body: "", category: "general" });
      // A successful message should appear in the same-token status history.
      // Failure to refresh must never be treated as failed message delivery.
      void refreshCustomerRequests(true);
    } catch (err) {
      setActionError(err?.portalLocal ? err.message : t("Message status unknown. Ask the business before resending.","No se confirmó el mensaje. Consulte a la empresa antes de reenviarlo."));
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
        throw localThrow(result?.error,t("Contract copy request could not be confirmed.","No se pudo confirmar la solicitud de copia del contrato."));
      setCopySubmitted(true);
      setCopyNotice(result.already_pending?
        t("A contract copy request is already pending. You can check its status below.","Ya existe una solicitud de copia pendiente. Puede consultar su estado abajo."):
        t("Contract copy requested. Management will verify the recipient and arrange secure delivery outside this link. Follow the status below.","Se solicitó una copia del contrato. La gerencia verificará al destinatario y coordinará una entrega segura fuera de este enlace. Consulte el estado abajo."));
      void refreshCustomerRequests(true);
    }catch(err){
      if(currentPortalToken.current===token)setActionError(err?.portalLocal?err.message:
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
      if (!res.ok || j.ok !== true) throw localThrow(j.error,t("Signature status could not be confirmed.","No se pudo confirmar la firma."));
      setSigningAmend(null);
      setSignName("");
      window.location.reload();
    } catch (err) {
      setActionError(err?.portalLocal ? err.message : t("Signature status unknown. Ask the business before signing again.","No se confirmó la firma. Consulte a la empresa antes de firmar de nuevo."));
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
      if (!res.ok || j.ok !== true) throw localThrow(j.error,t("Service request could not be confirmed.","No se pudo confirmar la solicitud de servicio."));
      setCleanDone({ kind: cleanReq.kind, price: j.price });
      setCleanReq({ kind: "extra", date: "", notes: "" });
    } catch (err) {
      setActionError(err?.portalLocal ? err.message : t("Service status unknown. Check with the business before retrying.","No se confirmó la solicitud. Consulte a la empresa antes de reintentar."));
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
      if (!res.ok || j.ok !== true) throw localThrow(j.error,t("Temp staffing request could not be confirmed.","No se pudo confirmar la solicitud de personal temporal."));
      setTempDone(true);
    } catch (err) {
      setActionError(err?.portalLocal ? err.message : t("Temp request status unknown. Contact the business before resending.","No se confirmó la solicitud de personal. Contacte a la empresa antes de reenviarla."));
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
      if (!res.ok || j.ok !== true) throw localThrow(j.error,t("Hours confirmation could not be verified.","No se pudo verificar la confirmación de horas."));
      window.location.reload();
    } catch (err) {
      setActionError(err?.portalLocal ? err.message : t("Hours confirmation status unknown. Check before retrying.","Estado de la confirmación de horas desconocido. Verifique antes de reintentar."));
    } finally { setConfirmBusy(null);finishAction("hours"); }
  }

  const dueAmendments = Array.isArray(data?.amendments) ? data.amendments.filter(a => a.status === "sent").length : 0;
  const hoursToConfirm = Array.isArray(data?.temp_requests) ? data.temp_requests.filter(r => r.hours_confirmed == null && ["assigned","in_progress","completed"].includes(r.status)).length : 0;
  const money = (n) => (n == null ? t("priced on request","precio a solicitud") : "$" + Number(n).toFixed(2));

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
            <nav className="panel" aria-label={t("Client Portal quick access","Acceso rápido al portal del cliente")} style={{ padding: 18, margin: "18px 0" }}>
              <h3 style={{margin:"0 0 10px"}}>{t("Quick Access","Acceso rápido")}</h3>
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
              <p style={{fontSize:"0.85rem",color:"var(--muted)",marginBottom:0}}>{t("Amendments awaiting signature","Modificaciones en espera de firma")}: {dueAmendments} · {t("Temp hours to confirm","Horas de personal temporal por confirmar")}: {hoursToConfirm}. {t("This secure link is for this location only.","Este enlace seguro es solo para esta ubicación.")}</p>
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
              <p style={{fontSize:"0.82rem",color:"var(--muted)"}}>{t("Only quality summaries approved by the business for this location are visible. Inspection notes, photos, internal checklists and employee identities are private.","Solo son visibles los resúmenes de calidad aprobados por la empresa para esta ubicación. Las notas de inspección, las fotos, las listas de verificación internas y las identidades de los empleados son privadas.")}</p>
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
                      {w.priority && w.priority !== "normal" ? ` • ${localStatus(w.priority)}` : ""}
                    </span>
                    <p style={{ margin: "6px 0 0", fontWeight: 700 }}>{w.title}</p>
                    {w.description && <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>{w.description}</p>}
                    {w.due_date && <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>{t("Due","Vence")} {w.due_date}</p>}
                  </div>
                ))}
              </div>
            </section>

            <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              {t("Questions about your service? Use the contact form below or reach out directly.","¿Preguntas sobre su servicio? Use el formulario de contacto a continuación o comuníquese directamente.")}
            </p>

            <section className="panel" id="portal-documents" style={{padding:22,margin:"18px 0"}}>
              <h3 style={{marginTop:0}}>{t('Documents & Agreements','Documentos y contratos')}</h3>
              <p style={{fontSize:"0.9rem",color:"var(--muted)"}}>
                {t("This secure location link includes only approved contract details and amendment statuses. It does not provide private downloadable company files or account-wide records. Use the request button below to ask management for a signed copy. You can track its status on this location link.","Este enlace seguro de ubicación incluye solo los detalles aprobados del contrato y los estados de las modificaciones. No proporciona archivos privados descargables de la empresa ni registros de toda la cuenta. Use el botón de solicitud a continuación para pedir a la gerencia una copia firmada. Puede seguir su estado en este enlace de ubicación.")}
              </p>
              <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                {contract?<a href="#portal-contract">{t("Review location contract","Revisar el contrato de la ubicación")}</a>:<span>{t("No contract summary is currently available.","No hay un resumen de contrato disponible.")}</span>}
                {data?.amendments?.length>0&&<a href="#portal-amendments">{t("Review amendments","Revisar modificaciones")}</a>}
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
                  {t("Effective","Vigente desde")} {contract.start_date}
                  {contract.end_date ? ` ${t("through","hasta")} ${contract.end_date}` : ""}
                  {contract.visits_per_week ? ` • ${contract.visits_per_week} ${contract.visits_per_week > 1 ? t("visits","visitas") : t("visit","visita")}/${t("week","semana")}` : ""}
                  {contract.price_per_visit != null ? ` • $${Number(contract.price_per_visit).toFixed(2)}/${t("visit","visita")}` : ""}
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
                  {t("Rate increases","La tarifa aumenta")} {contract.yearly_increase_pct ?? 3}% {t("yearly","al año")}. {t("Extra clean","Limpieza adicional")}: {money(contract.extra_clean_price)} •
                  {t("Heavy clean","Limpieza profunda")}: {money(contract.heavy_clean_price)}.
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
                        {a.changes.price_per_visit ? `${t("New price","Nuevo precio")}: $${Number(a.changes.price_per_visit).toFixed(2)}/${t("visit","visita")}. ` : ""}
                        {a.changes.visits_per_week ? `${t("New schedule","Nuevo horario")}: ${a.changes.visits_per_week}/${t("week","semana")}. ` : ""}
                        {a.changes.end_date ? `${t("New end date","Nueva fecha de finalización")}: ${a.changes.end_date}.` : ""}
                      </p>
                    )}
                    {a.status === "signed" ? (
                      <p style={{ color: "#1e8e4d", fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>
                        ✅ {t("Signed by","Firmado por")} {a.signed_name} {t("on","el")} {new Date(a.signed_at).toLocaleDateString(language==="es"?"es-US":"en-US")}
                      </p>
                    ) : a.status === "sent" ? (
                      <button disabled={Boolean(portalAction.current)} onClick={() => setSigningAmend(a)} style={{ ...pButton, padding: "10px 20px" }}>
                        {t("Review & sign","Revisar y firmar")}
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
                  ✅ {t("Request received — we'll confirm your","Solicitud recibida — confirmaremos su")} {cleanDone.kind === "heavy" ? t("heavy clean","limpieza profunda") : t("extra clean","limpieza adicional")} {t("shortly","en breve")}
                  {cleanDone.price != null ? ` (${money(cleanDone.price)})` : ""}.
                </p>
              ) : (
                <form onSubmit={requestClean} aria-busy={cleanBusy} aria-label={t("Request extra service","Solicitar servicio adicional")} style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                      {t("Service","Servicio")}
                      <select value={cleanReq.kind} onChange={(e) => setCleanReq({ ...cleanReq, kind: e.target.value })} style={pInput}>
                        <option value="extra">{t("Extra clean","Limpieza adicional")}{contract ? ` — ${money(contract.extra_clean_price)}` : ""}</option>
                        <option value="heavy">{t("Heavy clean","Limpieza profunda")}{contract ? ` — ${money(contract.heavy_clean_price)}` : ""}</option>
                      </select>
                    </label>
                    <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                      {t("Preferred date","Fecha preferida")}
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
                  <p role="status" aria-live="polite" style={{ color: "#1e8e4d", fontWeight: 700 }}>✅ {t("Request received — we'll confirm your temp staff shortly.","Solicitud recibida — confirmaremos su personal temporal en breve.")}</p>
                ) : (
                  <form onSubmit={requestTemps} aria-busy={tempBusy} aria-label={t("Request temp staff","Solicitar personal temporal")} style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        {t("Service","Servicio")}
                        <select value={tempReq.serviceType} onChange={(e) => setTempReq({ ...tempReq, serviceType: e.target.value })} style={pInput}>
                          <option value="commercial">{t("Office & Commercial","Oficinas y comercios")}</option>
                          <option value="residential">{t("Residential","Residencial")}</option>
                          <option value="move_in_out">{t("Move In / Move Out","Mudanzas (entrada/salida)")}</option>
                          <option value="construction_cleanup">{t("Construction Cleanup","Limpieza de construcción")}</option>
                          <option value="day_janitorial">{t("Day Janitorial","Limpieza diurna")}</option>
                          <option value="other">{t("Other","Otro")}</option>
                        </select>
                      </label>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        {t("Temps needed","Temporales necesarios")}
                        <input type="number" min="1" max="50" required value={tempReq.cleanersNeeded} onChange={(e) => setTempReq({ ...tempReq, cleanersNeeded: e.target.value })} style={pInput} />
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        {t("Hours","Horas")}
                        <input type="number" min="1" max="500" step="0.5" required value={tempReq.hoursRequested} onChange={(e) => setTempReq({ ...tempReq, hoursRequested: e.target.value })} style={pInput} />
                      </label>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        {t("Date needed","Fecha necesaria")}
                        <input type="date" value={tempReq.jobDate} onChange={(e) => setTempReq({ ...tempReq, jobDate: e.target.value })} style={pInput} />
                      </label>
                    </div>
                    <label style={{ fontSize: "0.85rem", display: "grid", gap: 4 }}>
                      {t("Site address","Dirección del sitio")}
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
                        {r.cleaners_needed} {t("temp(s)","temporal(es)")} × {r.hours_requested} {t("hr","h")}
                        {r.job_date ? ` · ${r.job_date}` : ""} · {localStatus(r.status)}
                      </div>
                      {r.hours_confirmed != null ? (
                        <p style={{ color: "#1e8e4d", fontWeight: 700, fontSize: "0.9rem", margin: "8px 0 0" }}>
                          ✅ {t("Hours confirmed","Horas confirmadas")}: {r.hours_confirmed}
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
                          {t("We'll ask you to confirm hours once the job is done.","Le pediremos que confirme las horas cuando el trabajo esté terminado.")}
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
                <p role="status" aria-live="polite" style={{ color: "#1e8e4d", fontWeight: 700 }}>✅ {t("Message sent — we'll get back to you soon.","Mensaje enviado — le responderemos pronto.")}</p>
              ) : (
                <form onSubmit={sendContact} aria-busy={contactBusy} aria-label={t("Contact customer service","Contactar al servicio al cliente")} style={{ display: "grid", gap: 10 }}>
                  <div role="radiogroup" aria-label={t("Reason for contacting us","Motivo de la consulta")} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      ["general", `💬 ${t("General question","Consulta general")}`],
                      ["service_problem", `⚠️ ${t("Problem with service","Problema con el servicio")}`],
                      ["callback_request", `📞 ${t("Please call me","Por favor, llámeme")}`],
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
                  <textarea aria-label={t("Your message to customer service","Su mensaje al servicio al cliente")} placeholder={contact.category === "service_problem" ? t("Tell us what went wrong — we'll make it right.","Cuéntenos qué salió mal — lo resolveremos.") : contact.category === "callback_request" ? t("Best number and time to reach you…","El mejor número y horario para contactarle…") : t("How can we help?","¿Cómo podemos ayudarle?")} required value={contact.body} onChange={(e) => setContact({ ...contact, body: e.target.value })} rows={3} style={pInput} />
                  <button type="submit" disabled={contactBusy || Boolean(portalAction.current)} style={pButton}>{contactBusy ? t("Sending…","Enviando…") : t("Send message","Enviar mensaje")}</button>
                </form>
              )}
            </section>

            <section className="panel" id="portal-customer-requests" style={{padding:22,margin:"18px 0"}}>
              <h3 style={{marginTop:0}}>{t('My Request Status','Estado de mis solicitudes')}</h3>
              <p style={{fontSize:"0.85rem",color:"var(--muted)"}}>
                {t("This link is shared by service location. For privacy, request history shows only date, category, status and customer-approved replies. Original personal messages, contact details, internal notes and staff information are never displayed here.","Este enlace se comparte por ubicación de servicio. Por privacidad, el historial de solicitudes muestra solo la fecha, la categoría, el estado y las respuestas aprobadas por la empresa. Los mensajes personales originales, los datos de contacto, las notas internas y la información del personal nunca se muestran aquí.")}
              </p>
              {data.customer_requests_error&&<div role="alert" style={{color:"#b3261e"}}>
                {t("Request status could not be confirmed","No se pudo confirmar el estado de la solicitud")}: {data.customer_requests_error}.
                {t("Your prior messages have not been deleted.","Sus mensajes anteriores no se han eliminado.")}
              </div>}
              <button type="button" disabled={historyRefreshing||Boolean(portalAction.current)}
                onClick={()=>void refreshCustomerRequests()} style={{...pButton,padding:"8px 14px",width:"auto"}}>
                {historyRefreshing?t("Refreshing…","Actualizando…"):t("Refresh request status","Actualizar estado")}
              </button>
              {!data.customer_requests_error&&Array.isArray(data.customer_requests)&&data.customer_requests.length===0&&
                <p style={{color:"var(--muted)"}}>{t("No customer service requests have been submitted through this location link.","No se han enviado solicitudes desde este enlace de ubicación.")}</p>}
              {!data.customer_requests_error&&Array.isArray(data.customer_requests)&&data.customer_requests.map(r=>(
                <article key={r.id} style={{border:"1px solid var(--line)",padding:14,borderRadius:12,marginTop:10}}>
                  <strong>{r.category==="service_problem"?t("Service concern","Problema con el servicio"):r.category==="callback_request"?t("Callback request","Solicitud de llamada"):r.category==="document_copy"?t("Signed contract copy","Copia del contrato firmado"):t("General request","Solicitud general")}</strong>
                  <p style={{margin:"6px 0",fontSize:"0.85rem",color:"var(--muted)"}}>
                    {r.created_at?new Date(r.created_at).toLocaleString(language==="es"?"es-US":"en-US"):t("Date unavailable","Fecha no disponible")} · 
                    {r.status==="resolved"?t(" Resolved"," Resuelto"):r.status==="in_progress"?t(" In progress"," En curso"):t(" Received"," Recibido")}
                  </p>
                  {r.response&&<p style={{whiteSpace:"pre-wrap",margin:"8px 0 0"}}>
                    <strong>{t("Business response:","Respuesta del negocio:")}</strong> {r.response}
                  </p>}
                  {r.has_unseen_reply===true&&<p role="status" style={{margin:"8px 0 0",fontWeight:800,color:"var(--brand)"}}>
                    ● {t("New reply from the business","Nueva respuesta del negocio")}
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
