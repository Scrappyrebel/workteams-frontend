"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";

const time=value=>String(value||"").slice(0,5);
export default function PublishedServiceScheduleManager({companyId,language="en"}){
 const [visits,setVisits]=useState([]);
 const [notes,setNotes]=useState({});
 const [loading,setLoading]=useState(true);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const companyRef=useRef(companyId);
 const active=useRef(false);
 const latestLanguage=useRef(language);
 latestLanguage.current=language;
 companyRef.current=companyId;
 const t=(en,es)=>latestLanguage.current==="es"?es:en;
 async function refresh(){
  const company=companyId;
  if(!company||!active.current)return;
  setLoading(true);setError("");setVisits([]);
  try{
   const {data,error:e}=await supabase().rpc("list_workteams_customer_service_visits_for_manager",{
    p_company_id:company
   });
   if(!active.current||companyRef.current!==company)return;
   if(e||data?.ok!==true||!Array.isArray(data.visits))
    throw Error("schedule-authorization-unverified");
   setVisits(data.visits);
   setNotes(previous=>{
    const next={};
    for(const v of data.visits)next[v.id]=previous[v.id]??v.public_note??"";
    return next;
   });
  }catch{
   if(!active.current||companyRef.current!==company)return;
   setVisits([]);
   setError(t("Upcoming visits could not be verified. No publication changes were made.",
    "No se pudieron verificar las próximas visitas. No se realizaron cambios de publicación."));
  }finally{
   if(active.current&&companyRef.current===company)setLoading(false);
  }
 }
 useEffect(()=>{
  active.current=true;setVisits([]);setNotes({});setError("");setNotice("");
  setLoading(Boolean(companyId));setWorking(false);
  if(companyId)void refresh();
  return ()=>{active.current=false};
 // Company changes invalidate the old scope before another refresh.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[companyId]);
 async function publish(visit,publish){
  const company=companyId;
  if(!company||working||loading||!active.current||
    !visits.some(v=>v.id===visit.id))return;
  const prompt=publish?
   t("Publish this visit's date/time only to customers approved for THIS location? Employee schedules and private shift notes stay hidden. Any schedule change requires reapproval.",
    "¿Publicar la fecha y hora solo para los clientes autorizados de ESTA ubicación? Los turnos y notas del personal son privados. Todo cambio de horario requiere otra aprobación."):
   t("Withdraw this service visit from customer accounts immediately?",
    "¿Retirar inmediatamente esta visita de las cuentas de clientes?");
  if(!window.confirm(prompt))return;
  setWorking(true);setError("");setNotice("");
  try{
   const {data,error:e}=await supabase().rpc("set_workteams_customer_service_visit_publication",{
    p_company_id:company,p_shift_id:visit.id,p_publish:publish,
    p_public_note:publish?(notes[visit.id]||"").trim():null
   });
   if(!active.current||companyRef.current!==company)return;
   if(e||data?.ok!==true||data.published!==publish)
    throw Error("publication-unverified");
   setNotice(publish?
    t("Visit published only to customers separately approved for this location.",
      "Visita publicada solo para clientes autorizados de esta ubicación."):
    t("Visit withdrawn from customer accounts.",
      "Visita retirada de las cuentas de clientes."));
   await refresh();
  }catch{
   if(!active.current||companyRef.current!==company)return;
   setError(t("Could not verify the schedule change. Refresh before trying again.",
    "No se pudo verificar el cambio de horario. Actualice antes de repetirlo."));
  }finally{
   if(active.current&&companyRef.current===company)setWorking(false);
  }
 }
 return <section className="panel" style={{padding:20,margin:"16px 0"}}>
  <h3>{t("Upcoming service visits","Próximas visitas de servicio")}</h3>
  <p style={{fontSize:13}}>{t(
   "Managers must explicitly publish each visit. Only the approved date, start/end time and optional public note are shared with customers who have exact-location permission. Employee assignments, notes and unpublished visits stay private. Modified shifts require reapproval.",
   "La gerencia debe publicar cada visita expresamente. Solo se comparten la fecha, las horas y la nota pública aprobadas con clientes autorizados para esa ubicación. Los empleados, notas y visitas no publicadas permanecen privados. Los cambios de turno requieren nueva aprobación."
  )}</p>
  {error&&<p role="alert" style={{color:"#b3261e"}}>{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  <button type="button" disabled={loading||working} onClick={()=>void refresh()}>
   {t("Refresh upcoming visits","Actualizar próximas visitas")}
  </button>
  {loading&&<p role="status">{t("Checking service visits…","Verificando visitas de servicio…")}</p>}
  {!loading&&!error&&visits.length===0&&<p>{t("No scheduled visits for the next 30 days.",
   "No hay visitas programadas para los próximos 30 días.")}</p>}
  {!loading&&visits.map(v=><div key={v.id}
    style={{borderTop:"1px solid var(--line,#bbb)",marginTop:12,paddingTop:12}}>
    <strong>{v.location_name}</strong>
    <p style={{margin:"5px 0"}}>{v.date} · {time(v.start)}–{time(v.end)}</p>
    <p style={{fontSize:13}}><strong>{v.published?
     t("Published","Publicada"):t("Private","Privada")}</strong></p>
    <label htmlFor={"visit-note-"+v.id}>{t(
     "Customer-safe public note (optional, 5–300 characters)",
     "Nota pública para el cliente (opcional, de 5 a 300 caracteres)")}</label>
    <textarea id={"visit-note-"+v.id} rows={2} maxLength={300}
     disabled={working} value={notes[v.id]||""}
     onChange={e=>setNotes(p=>({...p,[v.id]:e.target.value}))}
     placeholder={t("Example: Scheduled routine service visit","Ejemplo: Visita de servicio programada")}/>
    <button type="button" disabled={working||loading}
      onClick={()=>void publish(v,!v.published)}>
      {v.published?t("Withdraw visit","Retirar visita"):t("Publish visit","Publicar visita")}
    </button>
  </div>)}
 </section>;
}
