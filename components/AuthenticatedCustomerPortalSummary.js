"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";
import {summarizeCustomerPortal} from "../lib/customer-portal-summary.mjs";

// Additive "At a glance" summary for ONE approved location (Depth
// D-WT-05). It calls exactly the same five scoped RPCs, with exactly
// the same company + location parameters, that the five modules
// below it already call — no new read, no wider scope, and no money
// figure of any kind. Each section fails soft on its own: a section whose
// RPC could not be verified contributes null and renders a dash,
// never a made-up zero. Viewing this summary writes nothing.
export default function AuthenticatedCustomerPortalSummary({companyId,locationId,language}){
 const [summary,setSummary]=useState(null);
 const [loading,setLoading]=useState(true);
 const sequence=useRef(0);
 const t=(en,es)=>language==="es"?es:en;
 async function refresh(){
  const current=++sequence.current;
  setLoading(true);
  const sb=supabase();
  const params={p_company_id:companyId,p_location_id:locationId};
  async function section(rpc,key){
   try{
    const {data,error}=await sb.rpc(rpc,params);
    if(error||data?.ok!==true||!Array.isArray(data[key]))return null;
    return data[key];
   }catch{return null;}
  }
  const [visits,requests,workOrders,documents,reports]=await Promise.all([
   section("get_workteams_authenticated_service_schedule","visits"),
   section("get_workteams_authenticated_customer_requests","requests"),
   section("get_workteams_authenticated_customer_work_orders","work_orders"),
   section("get_workteams_authenticated_customer_documents","documents"),
   section("get_workteams_authenticated_quality_reports","reports")
  ]);
  if(sequence.current!==current)return;
  setSummary(summarizeCustomerPortal({visits,requests,workOrders,documents,reports}));
  setLoading(false);
 }
 useEffect(()=>{
  void refresh();
  const onVisible=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",onVisible);
  return ()=>{sequence.current++;document.removeEventListener("visibilitychange",onVisible)};
 },[companyId,locationId]);
 const dash="—";
 return <section style={{borderTop:"1px solid var(--line,#ccc)",marginTop:14,paddingTop:14}}>
  <h3>{t("At a glance","De un vistazo")}</h3>
  <p style={{fontSize:13}}>{t(
   "A short summary of the information for this location shown below. Invoices are not published in this portal.",
   "Un resumen breve de la información de esta ubicación que se muestra a continuación. Las facturas no se publican en este portal."
  )}</p>
  {loading&&<p role="status">{t("Checking your summary…","Verificando su resumen…")}</p>}
  {!loading&&summary&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
   <div style={{border:"1px solid var(--line,#ddd)",padding:10}}>
    <div style={{fontSize:13}}>{t("Next service visit","Próxima visita de servicio")}</div>
    <strong>{!summary.visitsKnown?dash:summary.nextVisit?summary.nextVisit.date+" · "+summary.nextVisit.start+"–"+summary.nextVisit.end:t("None published for the next 30 days","Ninguna publicada para los próximos 30 días")}</strong>
   </div>
   <div style={{border:"1px solid var(--line,#ddd)",padding:10}}>
    <div style={{fontSize:13}}>{t("Open requests","Solicitudes abiertas")}</div>
    <strong>{summary.openRequests===null?dash:summary.openRequests}</strong>
    {summary.newReplies!==null&&summary.newReplies>0&&<div style={{fontSize:13}}>{t("New replies from management","Respuestas nuevas de la gerencia")}: {summary.newReplies}</div>}
   </div>
   <div style={{border:"1px solid var(--line,#ddd)",padding:10}}>
    <div style={{fontSize:13}}>{t("Open work orders","Órdenes de trabajo abiertas")}</div>
    <strong>{summary.openWorkOrders===null?dash:summary.openWorkOrders}</strong>
   </div>
   <div style={{border:"1px solid var(--line,#ddd)",padding:10}}>
    <div style={{fontSize:13}}>{t("Private documents","Documentos privados")}</div>
    <strong>{summary.documentCount===null?dash:summary.documentCount}</strong>
   </div>
   <div style={{border:"1px solid var(--line,#ddd)",padding:10}}>
    <div style={{fontSize:13}}>{t("Latest quality report","Informe de calidad más reciente")}</div>
    <strong>{!summary.reportsKnown?dash:summary.latestReport?summary.latestReport.date+(summary.latestReport.score!==null?" · "+t("Score","Puntuación")+": "+summary.latestReport.score:""):t("None published","Ninguno publicado")}</strong>
   </div>
  </div>}
 </section>;
}
