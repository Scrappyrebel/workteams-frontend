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
 // Two-way conversation (migration 065): the thread on one request, with
 // replies appended through RPCs — never a new unlinked request.
 const [openThread,setOpenThread]=useState(null);
 const [threads,setThreads]=useState({});
 const [replyDrafts,setReplyDrafts]=useState({});
 const [replyBusy,setReplyBusy]=useState(null);
 const [threadError,setThreadError]=useState("");
 const threadSequence=useRef(0);
 const replySequence=useRef(0);
 // Reject older RPC completions after location changes, refreshes, logout,
 // revocation or unmount. Authorization remains checked by the server.
 const requestSequence=useRef(0);
 const submissionSequence=useRef(0);
 const scopeRef=useRef("");
 const t=(en,es)=>language==="es"?es:en;
 const key=companyId+":"+locationId;
 scopeRef.current=key;
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
  const request=++requestSequence.current;
  setLoading(true);setItems([]);setError("");
  try{
   const {data,error:failure}=await supabase().rpc("get_workteams_authenticated_customer_requests",{
    p_company_id:companyId,p_location_id:locationId
   });
   if(!isCurrent()||request!==requestSequence.current||scopeRef.current!==key)return;
   if(failure||data?.ok!==true||!Array.isArray(data.requests)){
    setItems([]);
    setError(t("Customer service history could not be verified. Your access may have been changed. Recheck your account.",
     "No se pudo verificar el historial. Es posible que hayan cambiado sus permisos. Verifique su cuenta."));
    onAuthorizationLost?.();
   }else setItems(data.requests);
  }catch{
   if(!isCurrent()||request!==requestSequence.current||scopeRef.current!==key)return;
   setItems([]);
   setError(t("Request history could not be verified. Please recheck your account.",
    "No se pudo verificar el historial. Vuelva a comprobar su cuenta."));
  }finally{
   if(isCurrent()&&request===requestSequence.current&&scopeRef.current===key)
    setLoading(false);
  }
 }
 useEffect(()=>{
  let active=true;
  setItems([]);setMessage("");setNotice("");setError("");pendingKey.current=null;
  setOpenThread(null);setThreads({});setReplyDrafts({});setThreadError("");
  const {data:listener}=supabase().auth.onAuthStateChange((event)=>{
   if(!active||event!=="SIGNED_OUT")return;
   requestSequence.current++;
   submissionSequence.current++;
   threadSequence.current++;
   replySequence.current++;
   pendingKey.current=null;
   setItems([]);setMessage("");setNotice("");setError("");setLoading(false);setSending(false);
   setOpenThread(null);setThreads({});setReplyDrafts({});setThreadError("");
   onAuthorizationLost?.();
  });
  void refresh(()=>active);
  return ()=>{
   active=false;
   requestSequence.current++;
   submissionSequence.current++;
   threadSequence.current++;
   replySequence.current++;
   pendingKey.current=null;
   listener?.subscription?.unsubscribe();
  };
 },[key]);
 async function submit(e){
  e.preventDefault();
  if(sending||loading||!companyId||!locationId)return;
  if(message.trim().length<10||message.trim().length>1600){
   setError(t("Message must contain 10 to 1600 characters.",
    "El mensaje debe tener entre 10 y 1600 caracteres."));
   return;
  }
  const operation=++submissionSequence.current;
  const submittedScope=key;
  const submittedCategory=category;
  const submittedMessage=message.trim();
  const stillCurrent=()=>operation===submissionSequence.current&&scopeRef.current===submittedScope;
  setSending(true);setError("");setNotice("");
  try{
   if(!pendingKey.current){
    if(!globalThis.crypto?.randomUUID)throw Error("secure-id-unavailable");
    pendingKey.current=globalThis.crypto.randomUUID();
   }
   const {data,error:failure}=await supabase().rpc("submit_workteams_authenticated_customer_request",{
    p_company_id:companyId,p_location_id:locationId,
    p_category:submittedCategory,p_message:submittedMessage,p_request_key:pendingKey.current
   });
   if(!stillCurrent())return;
   if(failure||data?.ok!==true||!data.request_id){
    if(failure?.code==="42501"||data?.error==="not_authorized")onAuthorizationLost?.();
    throw Error("request-not-confirmed");
   }
   pendingKey.current=null;
   setMessage("");
   setNotice(t(
    "Your service request was received. You can see its progress below.",
    "Se recibió su solicitud. Puede ver el progreso a continuación."
   ));
   await refresh(()=>stillCurrent());
  }catch{
   if(!stillCurrent())return;
   // Do not expose internal RPC, SQL or server error messages to customers.
   // Retain the idempotency key so a retry cannot create a duplicate request.
   setError(t("Could not confirm your request. Check its history or retry.",
    "No se pudo confirmar su solicitud. Revise el historial o vuelva a intentar."));
  }finally{
   if(stillCurrent())setSending(false);
  }
 }
 async function loadConversation(messageId,isCurrent=()=>true){
  const request=++threadSequence.current;
  try{
   const {data,error:failure}=await supabase().rpc("get_workteams_authenticated_customer_conversation",{
    p_company_id:companyId,p_location_id:locationId,p_message_id:messageId
   });
   if(!isCurrent()||request!==threadSequence.current||scopeRef.current!==key)return;
   if(failure||data?.ok!==true||!Array.isArray(data.replies)){
    if(failure?.code==="42501")onAuthorizationLost?.();
    setThreadError(t("Conversation could not be verified. Please recheck your account.",
     "No se pudo verificar la conversación. Vuelva a comprobar su cuenta."));
    return;
   }
   setThreads(previous=>({...previous,[messageId]:data.replies}));
   // Migration 071: opening the conversation clears its "new reply"
   // flag. Best-effort — a failed mark (or 071 not yet run) leaves the
   // flag for the next open and changes nothing else.
   try{
    await supabase().rpc("mark_workteams_authenticated_customer_conversation_seen",{
     p_company_id:companyId,p_location_id:locationId,p_message_id:messageId
    });
    if(isCurrent()&&request===threadSequence.current&&scopeRef.current===key)
     setItems(previous=>previous.map(x=>x.id===messageId?{...x,has_unseen_reply:false}:x));
   }catch{/* the flag clears on a later open */}
  }catch{
   if(!isCurrent()||request!==threadSequence.current||scopeRef.current!==key)return;
   setThreadError(t("Conversation could not be verified. Please recheck your account.",
    "No se pudo verificar la conversación. Vuelva a comprobar su cuenta."));
  }
 }
 function toggleConversation(item){
  setThreadError("");
  if(openThread===item.id){setOpenThread(null);return;}
  setOpenThread(item.id);
  if(!threads[item.id])void loadConversation(item.id);
 }
 async function sendReply(item){
  if(replyBusy||sending||loading)return;
  const body=String(replyDrafts[item.id]??"").trim();
  if(body.length<1||body.length>1600){
   setThreadError(t("Reply must contain 1 to 1600 characters.",
    "La respuesta debe tener entre 1 y 1600 caracteres."));
   return;
  }
  const operation=++replySequence.current;
  const submittedScope=key;
  const stillCurrent=()=>operation===replySequence.current&&scopeRef.current===submittedScope;
  setReplyBusy(item.id);setThreadError("");
  try{
   const {data,error:failure}=await supabase().rpc("reply_workteams_authenticated_customer_request",{
    p_company_id:companyId,p_location_id:locationId,p_message_id:item.id,p_body:body
   });
   if(!stillCurrent())return;
   if(failure||data?.ok!==true||!data.reply_id){
    if(failure?.code==="42501")onAuthorizationLost?.();
    throw Error("reply-not-confirmed");
   }
   setReplyDrafts(previous=>({...previous,[item.id]:""}));
   setNotice(t("Reply saved. Management has been alerted.",
    "Respuesta guardada. Se avisó a la gerencia."));
   // Member phone push for this reply (the "customer_replies"
   // preference's send path): best-effort — the reply is saved and the
   // in-app management alert already fired either way.
   try{
    const {data:{session}}=await supabase().auth.getSession();
    if(session?.access_token){
     await fetch("/api/portal/customer-reply-notify",{method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
      body:JSON.stringify({companyId,locationId,messageId:item.id,replyId:data.reply_id})});
    }
   }catch{/* push is best-effort; management keeps its in-app alert */}
   await loadConversation(item.id,()=>stillCurrent());
   await refresh(()=>stillCurrent());
  }catch{
   if(!stillCurrent())return;
   setThreadError(t("Could not confirm your reply. Check the conversation or retry.",
    "No se pudo confirmar su respuesta. Revise la conversación o vuelva a intentar."));
  }finally{
   if(stillCurrent())setReplyBusy(null);
  }
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
    {item.has_unseen_reply===true&&<p role="status" style={{fontWeight:700,color:"var(--brand,#3457d5)",margin:"6px 0 0"}}>
     ● {t("New reply from management","Nueva respuesta de la gerencia")}
    </p>}
    <button type="button" disabled={loading||sending||replyBusy===item.id}
     onClick={()=>toggleConversation(item)} style={{marginTop:8}}>
     {openThread===item.id?t("Hide conversation","Ocultar conversación"):t("View conversation & reply","Ver conversación y responder")}
    </button>
    {openThread===item.id&&<div style={{marginTop:8,borderTop:"1px dashed var(--line,#ccc)",paddingTop:8}}>
     {threadError&&<p role="alert" style={{color:"#b3261e"}}>{threadError}</p>}
     {!threads[item.id]&&<p role="status">{t("Loading conversation…","Cargando conversación…")}</p>}
     {(threads[item.id]||[]).map((entry,idx)=><div key={entry.id||`legacy-${idx}`}
       style={{borderLeft:entry.sender_role==="business"?"3px solid var(--brand,#3457d5)":"3px solid #bbb",paddingLeft:9,marginTop:7}}>
       <p style={{margin:0,fontSize:12.5}}>
        <strong>{entry.sender_role==="business"?t("Manager reply","Respuesta del responsable"):t("Your reply","Su respuesta")}</strong>
        {" · "}{entry.created_at?new Date(entry.created_at).toLocaleString(language==="es"?"es":"en-US"):""}
       </p>
       <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",margin:"2px 0 0"}}>{entry.body}</p>
      </div>)}
     <form onSubmit={e=>{e.preventDefault();void sendReply(item);}} style={{display:"grid",gap:8,marginTop:10}}>
      <label htmlFor={"reply-"+item.id}>{t("Reply to management","Responder a la gerencia")}</label>
      <textarea id={"reply-"+item.id} rows={3} maxLength={1600}
       value={replyDrafts[item.id]??""}
       onChange={e=>setReplyDrafts(previous=>({...previous,[item.id]:e.target.value}))}
       placeholder={t("Write a follow-up for this request.","Escriba un seguimiento para esta solicitud.")}/>
      <button type="submit" disabled={replyBusy===item.id||!(replyDrafts[item.id]??"").trim()}>
       {replyBusy===item.id?t("Sending…","Enviando…"):t("Send reply","Enviar respuesta")}
      </button>
     </form>
    </div>}
  </article>)}
 </section>;
}
