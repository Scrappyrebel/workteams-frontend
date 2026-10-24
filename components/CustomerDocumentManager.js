"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";
import {documentManagerScope,isCurrentDocumentRequest} from "../lib/customer-document-scope.mjs";

export default function CustomerDocumentManager({companyId,locations,pilotRequested}){
 const [locationId,setLocationId]=useState("");
 const [title,setTitle]=useState("");
 const [expiryDays,setExpiryDays]=useState("90");
 const [file,setFile]=useState(null);
 const [docs,setDocs]=useState([]);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [language,setLanguage]=useState("en");
 const t=(en,es)=>language==="es"?es:en;
 const fileRef=useRef(null);
 const selected=locations?.some(l=>l.id===locationId);
 // A late response must never show documents under a newly selected tenant or location.
 const currentScope=documentManagerScope(companyId,locationId,pilotRequested,selected);
 const scopeRef=useRef(currentScope);
 scopeRef.current=currentScope;
 const requestSeq=useRef(0);
 const [loadedScope,setLoadedScope]=useState("");
 const visibleDocs=loadedScope===currentScope?docs:[];
 async function refresh(){
  const scope=currentScope;
  if(!scope){
   requestSeq.current++;setDocs([]);setLoadedScope("");setLoading(false);
   return;
  }
  const requestId=++requestSeq.current;
  setLoading(true);setDocs([]);setLoadedScope("");setError("");
  try{
   const {data,error:e}=await supabase().rpc("list_workteams_customer_documents_manager",{
    p_company_id:companyId,p_location_id:locationId
   });
   if(!isCurrentDocumentRequest(requestId,requestSeq.current,scope,scopeRef.current))return;
   if(e||data?.ok!==true||!Array.isArray(data.documents)){
    setError(t("Private documents could not be verified. Please retry.","No se pudieron verificar los documentos privados. Inténtelo de nuevo."));
    setDocs([]);
   }else{setDocs(data.documents);setLoadedScope(scope)}
  }catch(e){
   if(isCurrentDocumentRequest(requestId,requestSeq.current,scope,scopeRef.current)){
    setDocs([]);setError(t("Private documents could not be verified. Please retry.","No se pudieron verificar los documentos privados. Inténtelo de nuevo."));
   }
  }finally{
   if(isCurrentDocumentRequest(requestId,requestSeq.current,scope,scopeRef.current))
    setLoading(false);
  }
 }
 useEffect(()=>{
  requestSeq.current++;
  setDocs([]);setLoadedScope("");setLoading(false);
  setError("");setNotice("");setTitle("");setFile(null);
  if(fileRef.current)fileRef.current.value="";
  if(currentScope)void refresh();
  return ()=>{requestSeq.current++};
 },[currentScope]);

 async function upload(e){
  e.preventDefault();
  if(!currentScope||!file||busy||loading)return;
  const operationScope=currentScope;
  if(!window.confirm(t("Upload this PDF privately for this company's selected service location? The file will NOT be visible to customers unless separately published and customer document access is approved.","¿Guardar este PDF de forma privada en la ubicación seleccionada? No será visible hasta publicarlo y autorizar al cliente.")))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data:session,error:sessionError}=await supabase().auth.getSession();
   const token=session?.session?.access_token;
   if(sessionError||!token)throw Error(t("Sign in as a company manager to upload documents.","Inicie sesión como gerente para subir documentos."));
   const form=new FormData();
   form.append("company_id",companyId);form.append("location_id",locationId);
   form.append("title",title.trim());form.append("document",file);
   const res=await fetch("/api/customer-documents/upload",{
    method:"POST",headers:{Authorization:"Bearer "+token},body:form,cache:"no-store"
   });
   const out=await res.json();
   if(scopeRef.current!==operationScope)return;
   if(!res.ok||out?.ok!==true||out.published!==false)
    throw Error(out?.error||t("The private PDF upload could not be verified.","No se pudo verificar la carga del PDF privado."));
   setTitle("");setFile(null);
   if(fileRef.current)fileRef.current.value="";
   setNotice(t("PDF uploaded privately and UNPUBLISHED. Review the title and choose Publish only when approved for customers.","PDF cargado de forma privada y SIN PUBLICAR. Revise el título antes de publicarlo."));
   await refresh();
  }catch(e){if(scopeRef.current===operationScope)setError(e.message||t("PDF upload was not confirmed.","No se confirmó la carga del PDF."))}
  finally{setBusy(false)}
 }
 async function publish(doc,makePublic){
  if(busy||loading||!currentScope||!visibleDocs.some(d=>d.id===doc.id))return;
  const operationScope=currentScope;
  const question=makePublic?
   t("Publish this PDF for approved verified customer accounts at this service location? Only contacts with separate document permission can download. Review the PDF for sensitive information first.","¿Publicar este PDF para los clientes verificados de esta ubicación? Solo los contactos autorizados podrán descargarlo. Revise cualquier información confidencial."):
   t("Withdraw this PDF immediately from all customer account downloads?","¿Retirar este PDF inmediatamente de las descargas de todos los clientes?");
  if(!window.confirm(question)||scopeRef.current!==operationScope)return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data,error:e}=await supabase().rpc("set_workteams_customer_document_publication",{
    p_company_id:companyId,p_document_id:doc.id,p_publish:makePublic,
    p_expires_at:makePublic?new Date(Date.now()+Number(expiryDays)*86400000).toISOString():null
   });
   if(scopeRef.current!==operationScope)return;
   if(e||data?.ok!==true||data.published!==makePublic)
    throw Error(e?.message||t("Document publication was not verified.","No se pudo verificar la publicación del documento."));
   setNotice(makePublic?t("PDF publication saved. Approved customers with document permission may download.","Publicación guardada. Los clientes autorizados pueden descargar el PDF."):t("Publication withdrawn; future downloads are blocked.","Publicación retirada; se bloquearon las descargas futuras."));
   await refresh();
  }catch(e){if(scopeRef.current===operationScope)setError(e.message||t("Publication change could not be confirmed.","No se pudo confirmar el cambio de publicación."))}
  finally{setBusy(false)}
 }
 if(!pilotRequested)return null;
 return <section className="panel" style={{padding:20,margin:"16px 0"}}>
  <h3>{t("Customer documents — private PDF center","Documentos de clientes — centro privado de PDF")}</h3>
  <label htmlFor="manager-doc-language">{t("Language","Idioma")}{" "}<select id="manager-doc-language" aria-label="Document manager language / Idioma" value={language} onChange={e=>setLanguage(e.target.value==="es"?"es":"en")}><option value="en">English</option><option value="es">Español</option></select></label>
  <p style={{fontSize:14}}>{t("Managers only. PDFs remain private until published. Verified customers need separate document grants; shared location links cannot download.","Solo gerentes. Los PDF permanecen privados hasta su publicación. Los clientes verificados necesitan permisos individuales; los enlaces de ubicación no permiten descargas.")}</p>
  <label htmlFor="doc-company-location">{t("Service location","Ubicación del servicio")}</label>
  <select id="doc-company-location" value={locationId} onChange={e=>setLocationId(e.target.value)}>
   <option value="">{t("Select a company location","Seleccione una ubicación")}</option>
   {(locations||[]).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
  </select>
  {selected&&<>
   <form onSubmit={e=>void upload(e)} style={{display:"grid",gap:10,marginTop:12}}>
    <label htmlFor="doc-title">{t("Customer-safe document title","Título apropiado para clientes")}</label>
    <input id="doc-title" type="text" required minLength={3} maxLength={120}
     value={title} onChange={e=>setTitle(e.target.value)}/>
    <label htmlFor="doc-pdf">{t("Private PDF — maximum 8 MB","PDF privado — máximo 8 MB")}</label>
    <input id="doc-pdf" ref={fileRef} type="file" accept=".pdf,application/pdf"
     required onChange={e=>setFile(e.target.files?.[0]||null)}/>
    <button type="submit" disabled={busy||loading||!file||title.trim().length<3}>
     {busy?t("Saving…","Guardando…"):t("Upload PRIVATE PDF","Cargar PDF PRIVADO")}
    </button>
   </form>
   {error&&<p role="alert" style={{color:"#b3261e"}}>{error}</p>}
   {notice&&<p role="status">{notice}</p>}
   <h4>{t("Private and published PDFs","PDF privados y publicados")}</h4>
   <button type="button" disabled={busy||loading} onClick={()=>void refresh()}>
    {t("Refresh document list","Actualizar documentos")}
   </button>
   {loading&&<p role="status">{t("Checking company documents…","Verificando documentos de la empresa…")}</p>}
   {!loading&&!error&&loadedScope===currentScope&&visibleDocs.length===0&&<p>{t("No PDF documents have been added here.","Aún no se han añadido documentos PDF.")}</p>}
   <label htmlFor="doc-expiry-days">{t("Published download expiry","Vencimiento de descargas publicadas")}</label>
   <select id="doc-expiry-days" value={expiryDays} onChange={e=>setExpiryDays(e.target.value)}>
    <option value="30">30 days / días</option>
    <option value="90">90 days / días</option>
    <option value="365">365 days / días</option>
   </select>
   {visibleDocs.map(doc=><div key={doc.id} style={{borderTop:"1px solid var(--line,#ccc)",padding:"12px 0"}}>
    <strong>{doc.title}</strong>
    <p style={{fontSize:13}}>{doc.file_name} · {doc.published?t("PUBLISHED","PUBLICADO"):t("PRIVATE","PRIVADO")} · {doc.expires_at?t("Expires ","Vence el ")+new Date(doc.expires_at).toLocaleDateString(language==="es"?"es-US":"en-US"):t("No expiry set","Sin vencimiento")}</p>
    <button type="button" disabled={busy||loading} onClick={()=>void publish(doc,!doc.published)}>
     {doc.published?t("Withdraw","Retirar"):t("Publish after review","Publicar tras revisar")}
    </button>
   </div>)}
  </>}
 </section>;
}
