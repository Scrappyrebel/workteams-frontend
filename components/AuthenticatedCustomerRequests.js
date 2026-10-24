"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";

// An authenticated contact receives only requests from their *own* approved
// company + location; the database rechecks the identity on every RPC.
export default function AuthenticatedCustomerRequests({companyId,locationId,language,onAuthorizationLost}){
 const [items,setItems]=useState([]);
 const [category,setCategory]=useState("general");
 const [message,setMessage]=useState("");
 const [loading,setLoading]=useState(true);
 const [sending,setSending]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const pendingKey=useRef(null);
 const t=(en,es)=>language==="es"?es:en;
 const key=companyId+":"+locationId;
 const categories=[
  {value:"general",en:"General question",es:"Consulta general"},
  {value:"service_problem",en:"Report a service issue",es:"Reportar un problema del servicio"},
  {value:"callback_request",en:"Request a callback",es:"Solicitar una llamada"},
  {value:"document_copy",en:"Request a contract copy",es:"Solicitar copia del contrato"}
 ];
 const statuses={
  received:t("Received","Recibida"),
  in_progress:t("In progress","En proceso"),
  resolved:t("Resolved","Resuelta")
 };
 async function refresh(isCurrent=()=>true){
  setLoading(true);setError("");
  const {data,error:failure}=await supabase().rpc("get_workteams_authenticated_customer_requests",{
   p_company_id:companyId,p_location_id:locationId
  });
  if(!isCurrent())return;
  if(failure||data?.ok!==true||!Array.isArray(data.requests)){
   setItems([]);
   setError(t("Customer service history could not be verified. Your access may have been changed. Recheck your account.",
    "No se pudo verificar el historial. Es posible que hayan cambiado sus permisos. Verifique su cuenta."));
   onAuthorizationLost?.();
  }else setItems(data.requests);
  setLoading(false);
 }
 useEffect(()=>{
  let active=true;
  setItems([]);setMessage("");setNotice("");pendingKey.current=null;
  void refresh(()=>active);
  return ()=>{active=false};
 },[key]);
 async function submit(e){
  e.preventDefault();
  if(sending||loading||!companyId||!locationId)return;
  if(message.trim().length<10||message.trim().length>1600){
   setError(t("Message must contain 10 to 1600 characters.",
    "El mensaje debe tener entre 10 y 1600 caracteres."));
   return;
  }
  setSending(true);setError("");setNotice("");
  try{
   if(!pendingKey.current){
    if(!globalThis.crypto?.randomUUID)throw new Error("Secure request identifiers are unavailable on this device.");
    pendingKey.current=globalThis.crypto.randomUUID();
   }
   const {data,error:failure}=await supabase().rpc("submit_workteams_authenticated_customer_request",{
    p_company_id:companyId,p_location_id:locationId,
    p_category:category,p_message:message.trim(),p_request_key:pendingKey.current
   });
   if(failure||data?.ok!==true||!data.request_id)
    throw new Error(failure?.message||"The request was not confirmed. Nothing should be assumed submitted.");
   pendingKey.current=null;
   setMessage("");
   setNotice(t(
    "Your service request was received. You can see its progress below.",
    "Se recibió su solicitud. Puede ver el progreso a continuación."
   ));
   await refresh();
  }catch(err){
   setError(err instanceof Error?err.message:
    t("Could not confirm the request. Please retry.","No se pudo confirmar la solicitud. Inténtelo de nuevo."));
  }finally{setSending(false)}
 }
 return <section style={{borderTop:"1px solid var(--line,#aaa)",paddingTop:12,marginTop:12}}>
  <h3>{t("Customer Service & requests","Servicio al cliente y solicitudes")}</h3>
  <p style={{fontSize:13}}>{t(
   "Messages go to this company's manager for this one service location. Contract-copy requests require separate verified delivery; files are never displayed in a forwarded location link.",
   "Los mensajes se envían al responsable de esta ubicación. Las copias de contratos se entregan por un medio seguro después de verificar al destinatario."
  )}</p>
  {error&&<p role="alert" style={{color:"#b3261e"}}>{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  <form onSubmit={e=>void submit(e)} style={{display:"grid",gap:10}}>
   <label htmlFor={"reqcat-"+locationId}>{t("Request type","Tipo de solicitud")}</label>
   <select id={"reqcat-"+locationId} value={category}
    onChange={e=>{setCategory(e.target.value);pendingKey.current=null}}>
    {categories.map(c=><option key={c.value} value={c.value}>
      {language==="es"?c.es:c.en}
    </option>)}
   </select>
   <label htmlFor={"reqmsg-"+locationId}>{t("Message (10–1600 characters)","Mensaje (10–1600 caracteres)")}</label>
   <textarea id={"reqmsg-"+locationId} rows={3} maxLength={1600}
    value={message}
    onChange={e=>{setMessage(e.target.value);pendingKey.current=null}}
    placeholder={t("Describe what you need for this location.",
     "Describa lo que necesita para esta ubicación.")}/>
   <button type="submit" disabled={loading||sending||message.trim().length<10}>
    {sending?t("Sending…","Enviando…"):t("Send service request","Enviar solicitud")}
   </button>
  </form>
  <h4>{t("Request history","Historial de solicitudes")}</h4>
  <button type="button" disabled={loading||sending} onClick={()=>void refresh()}>
   {t("Refresh request statuses","Actualizar estados")}
  </button>
  {loading&&<p role="status">{t("Checking requests…","Verificando solicitudes…")}</p>}
  {!loading&&!error&&items.length===0&&<p>{t("No requests submitted here yet.","Aún no hay solicitudes.")}</p>}
  {!loading&&items.map(item=><article key={item.id}
    style={{borderTop:"1px solid var(--line,#ddd)",marginTop:8,paddingTop:9}}>
    <strong>{categories.find(c=>c.value===item.category)?.[language==="es"?"es":"en"]||item.category}</strong>
    {" · "}{statuses[item.status]||item.status}
    <p style={{fontSize:13}}>{item.submitted_at?new Date(item.submitted_at).toLocaleDateString(language==="es"?"es":"en-US"):""}</p>
    <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{item.message}</p>
    {item.response&&<p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
     <strong>{t("Manager response","Respuesta del responsable")}:</strong> {item.response}
    </p>}
  </article>)}
 </section>;
}
