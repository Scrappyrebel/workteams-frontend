"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";

export default function AuthenticatedCustomerDocuments({companyId,locationId,language}){
 const [documents,setDocuments]=useState([]);
 const [loading,setLoading]=useState(true);
 const [downloading,setDownloading]=useState("");
 const [notice,setNotice]=useState("");
 const seq=useRef(0);
 const t=(en,es)=>language==="es"?es:en;
 async function refresh(){
  const req=++seq.current;
  setDocuments([]);setNotice("");setLoading(true);
  const {data,error}=await supabase().rpc("get_workteams_authenticated_customer_documents",{
   p_company_id:companyId,p_location_id:locationId
  });
  if(seq.current!==req)return;
  if(error||data?.ok!==true||!Array.isArray(data.documents)){
   setDocuments([]);
   setNotice(t("Private documents cannot be displayed until your service provider approves your account and document access.",
    "Los documentos privados requieren la autorización de su empresa y de su cuenta."));
  }else setDocuments(data.documents);
  setLoading(false);
 }
 useEffect(()=>{
  void refresh();
  function update(){if(document.visibilityState==="visible")void refresh()}
  document.addEventListener("visibilitychange",update);
  return ()=>{seq.current++;document.removeEventListener("visibilitychange",update)};
 },[companyId,locationId]);
 async function download(doc){
  if(downloading)return;
  setDownloading(doc.id);setNotice("");
  try{
   const {data:state,error:e}=await supabase().auth.getSession();
   if(e||!state?.session?.access_token)throw Error("Your customer session expired. Sign in again.");
   const res=await fetch("/api/customer-documents/"+encodeURIComponent(doc.id)+"/download",{
    headers:{Authorization:"Bearer "+state.session.access_token},cache:"no-store"
   });
   if(!res.ok)throw Error(t(
    "Document access was denied or withdrawn. Recheck your customer account.",
    "El acceso al documento fue denegado o retirado. Verifique su cuenta."
   ));
   const type=res.headers.get("content-type")||"";
   if(!type.startsWith("application/pdf"))throw Error("The server did not return a PDF.");
   const bytes=await res.blob();
   if(bytes.size>8*1024*1024||bytes.size===0)throw Error("The private PDF was not valid.");
   const url=URL.createObjectURL(bytes);
   const link=document.createElement("a");
   link.href=url;
   link.download=String(doc.file_name||"document.pdf").replace(/[^\p{L}\p{N} ._()-]/gu,"_");
   document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){
   setDocuments([]);
   setNotice(e.message||"The private PDF download was not verified.");
  }finally{setDownloading("")}
 }
 return <section style={{borderTop:"1px solid var(--line,#ccc)",marginTop:14,paddingTop:14}}>
  <h3>{t("Private documents","Documentos privados")}</h3>
  <p style={{fontSize:13}}>{t(
   "Only PDFs published by your service provider and separately approved for your account and location appear here. Access is checked again for each download.",
   "Solo se muestran archivos PDF publicados y autorizados para su cuenta y ubicación. Cada descarga verifica nuevamente los permisos."
  )}</p>
  <button type="button" disabled={loading||!!downloading} onClick={()=>void refresh()}>
   {t("Refresh documents","Actualizar documentos")}
  </button>
  {loading&&<p role="status">{t("Verifying document permissions…","Verificando permisos…")}</p>}
  {!loading&&notice&&<p role="status">{notice}</p>}
  {!loading&&!notice&&documents.length===0&&<p>{t("No documents have been published for your account.",
   "No hay documentos publicados para su cuenta.")}</p>}
  {!loading&&!notice&&documents.map(d=><div key={d.id}
    style={{borderTop:"1px solid var(--line,#ddd)",padding:"10px 0"}}>
    <strong>{d.title}</strong>
    <p style={{fontSize:13}}>{d.file_name}</p>
    <button type="button" disabled={!!downloading} onClick={()=>void download(d)}>
     {downloading===d.id?t("Checking download…","Verificando descarga…"):
      t("Download private PDF","Descargar PDF privado")}
    </button>
  </div>)}
 </section>;
}
