"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";

// Only manager-published inspection dates/scores/customer-safe summaries.
// Private notes, photos, inspector names and checklist details never enter
// the authenticated customer response. The RPC checks live grants each time.
export default function AuthenticatedCustomerQuality({companyId,locationId,language}){
 const [reports,setReports]=useState([]);
 const [loading,setLoading]=useState(true);
 const [status,setStatus]=useState("");
 const requestNumber=useRef(0);
 const t=(en,es)=>language==="es"?es:en;
 async function refresh(){
  const n=++requestNumber.current;
  setLoading(true);setReports([]);setStatus("");
  const {data,error}=await supabase().rpc("get_workteams_authenticated_quality_reports",{
   p_company_id:companyId,p_location_id:locationId
  });
  if(requestNumber.current!==n)return;
  if(error||data?.ok!==true||!Array.isArray(data.reports)){
   // Fail closed if quality permission is revoked or the account was disabled.
   setReports([]);
   setStatus(t("Quality reports are private or access could not be verified.",
    "Los informes de calidad son privados o no se pudo verificar el acceso."));
  }else{
   setReports(data.reports);
  }
  setLoading(false);
 }
 useEffect(()=>{
  void refresh();
  function refreshWhenVisible(){if(document.visibilityState==="visible")void refresh()}
  document.addEventListener("visibilitychange",refreshWhenVisible);
  return ()=>{
   requestNumber.current++;
   document.removeEventListener("visibilitychange",refreshWhenVisible);
  };
 },[companyId,locationId]);
 return <section style={{borderTop:"1px solid var(--line,#ccc)",paddingTop:12,marginTop:16}}>
  <h3>{t("Published Quality Reports","Informes de calidad publicados")}</h3>
  <p style={{fontSize:13}}>{t(
   "Only reports explicitly published by management for this location can appear here. Internal inspection notes, photos, staff identities and checklists are not shared.",
   "Aquí solo aparecen informes publicados expresamente por la gerencia para esta ubicación. Las notas, fotos, empleados y listas de verificación internos siguen siendo privados."
  )}</p>
  <button type="button" disabled={loading} onClick={()=>void refresh()}>
   {t("Refresh quality reports","Actualizar informes")}
  </button>
  {loading&&<p role="status">{t("Verifying published reports…","Verificando informes publicados…")}</p>}
  {!loading&&status&&<p role="status">{status}</p>}
  {!loading&&!status&&reports.length===0&&<p>{t("No quality reports have been published for your account.",
   "No hay informes de calidad publicados para su cuenta.")}</p>}
  {!loading&&!status&&reports.map((r,i)=><article key={r.inspection_date+":"+i}
   style={{padding:"10px 0",borderBottom:"1px solid var(--line,#ddd)"}}>
   <strong>{r.inspection_date}</strong>
   {Number.isFinite(r.score)&&<span> · {t("Score","Puntuación")}: {r.score}</span>}
   <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{r.customer_summary}</p>
  </article>)}
 </section>;
}
