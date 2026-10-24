"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";

// Show only manager-published visits, never internal employee shifts or notes.
export default function AuthenticatedCustomerServiceSchedule({companyId,locationId,language}){
 const [visits,setVisits]=useState([]);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState("");
 const latest=useRef(0);
 const t=(en,es)=>language==="es"?es:en;
 async function refresh(){
  const sequence=++latest.current;
  setBusy(true);setError("");setVisits([]);
  try{
   const {data,error:rpcError}=await supabase().rpc("get_workteams_authenticated_service_schedule",{
    p_company_id:companyId,p_location_id:locationId
   });
   if(sequence!==latest.current)return;
   if(rpcError||data?.ok!==true||!Array.isArray(data.visits))
    throw Error("Schedule access could not be confirmed.");
   setVisits(data.visits);
  }catch{
   if(sequence===latest.current){
    setVisits([]);
    setError(t("Service visits are private or access is unavailable.",
     "Las visitas son privadas o el acceso no está disponible."));
   }
  }finally{if(sequence===latest.current)setBusy(false)}
 }
 useEffect(()=>{
  let active=true;
  void refresh();
  const onVisibility=()=>{
   if(active&&document.visibilityState==="visible")void refresh();
  };
  document.addEventListener("visibilitychange",onVisibility);
  return ()=>{active=false;latest.current++;document.removeEventListener("visibilitychange",onVisibility)};
 },[companyId,locationId]);
 return <section style={{borderTop:"1px solid var(--line,#bbb)",marginTop:14,paddingTop:12}}>
  <h3>{t("Upcoming service visits","Próximas visitas de servicio")}</h3>
  <p style={{fontSize:13}}>{t(
   "Only visits approved by management for this exact location are shown. Times reflect the property's local schedule and may change; check back for updates.",
   "Solo aparecen las visitas aprobadas para esta ubicación. Los horarios pueden cambiar; vuelva a consultar las actualizaciones."
  )}</p>
  <button type="button" disabled={busy} onClick={()=>void refresh()}>
   {t("Refresh visits","Actualizar visitas")}
  </button>
  {busy&&<p role="status">{t("Checking published visits…","Verificando visitas publicadas…")}</p>}
  {!busy&&error&&<p role="status">{error}</p>}
  {!busy&&!error&&visits.length===0&&<p>{t(
   "No service visits have been published for the next 30 days.",
   "No hay visitas publicadas para los próximos 30 días."
  )}</p>}
  {!busy&&!error&&visits.map((v,i)=><article key={v.date+":"+v.start+":"+i}
   style={{padding:"9px 0",borderBottom:"1px solid var(--line,#ddd)"}}>
   <strong>{v.date}</strong> · {String(v.start).slice(0,5)}–{String(v.end).slice(0,5)}
   {v.note&&<p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{v.note}</p>}
  </article>)}
 </section>;
}
