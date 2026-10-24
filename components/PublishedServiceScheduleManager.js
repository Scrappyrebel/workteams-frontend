"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";

const time=t=>String(t||"").slice(0,5);
export default function PublishedServiceScheduleManager({companyId}){
 const [visits,setVisits]=useState([]);
 const [notes,setNotes]=useState({});
 const [loading,setLoading]=useState(true);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const companyRef=useRef(companyId);
 companyRef.current=companyId;
 async function refresh(){
  const company=companyId;
  if(!company)return;
  setLoading(true);setError("");setVisits([]);
  const {data,error:e}=await supabase().rpc("list_workteams_customer_service_visits_for_manager",{
   p_company_id:company
  });
  if(companyRef.current!==company)return;
  if(e||data?.ok!==true||!Array.isArray(data.visits)){
   setError("Upcoming shifts could not be verified. No publication changes were made.");
  }else{
   setVisits(data.visits);
   setNotes(previous=>{
    const next={...previous};
    for(const v of data.visits)if(next[v.id]===undefined)next[v.id]=v.public_note||"";
    return next;
   });
  }
  setLoading(false);
 }
 useEffect(()=>{
  let active=true;
  setVisits([]);setNotes({});setError("");setNotice("");setLoading(true);
  if(companyId)supabase().rpc("list_workteams_customer_service_visits_for_manager",{
   p_company_id:companyId
  }).then(({data,error:e})=>{
   if(!active)return;
   if(e||data?.ok!==true||!Array.isArray(data.visits))
    setError("Could not verify published service visit settings.");
   else{
    setVisits(data.visits);
    setNotes(Object.fromEntries(data.visits.map(v=>[v.id,v.public_note||""])));
   }
   setLoading(false);
  });
  return ()=>{active=false};
 },[companyId]);
 async function publish(visit,publish){
  const company=companyId;
  if(!company||working||loading)return;
  const prompt=publish?
   "Publish this service visit's date and time to approved customers for THIS location? Employee assignments and private shift notes stay hidden. If the shift time changes, publication will require approval again.":
   "Withdraw this service visit from customer accounts immediately?";
  if(!window.confirm(prompt))return;
  setWorking(true);setError("");setNotice("");
  try{
   const {data,error:e}=await supabase().rpc("set_workteams_customer_service_visit_publication",{
    p_company_id:company,p_shift_id:visit.id,p_publish:publish,
    p_public_note:publish?(notes[visit.id]||"").trim():null
   });
   if(companyRef.current!==company)return;
   if(e||data?.ok!==true||data.published!==publish)
    throw Error(e?.message||"The publication was not confirmed.");
   setNotice(publish?
    "Visit published only to customers with separately approved location schedule access.":
    "Visit withdrawn from all customer accounts.");
   await refresh();
  }catch(e){if(companyRef.current===company)setError(e.message||"Could not verify the schedule change.")}
  finally{setWorking(false)}
 }
 return <section className="panel" style={{padding:20,margin:"16px 0"}}>
  <h3>Upcoming service visits / Próximas visitas</h3>
  <p style={{fontSize:13}}>Managers must explicitly publish each visit. Customers can only see its approved date,
   start/end time and optional public note after a separate exact-location permission.
   Employee names, shift notes, staff schedules and unpublished visits remain private.
   A changed or deleted shift is removed from customer results until republished.</p>
  {error&&<p role="alert" style={{color:"#b3261e"}}>{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  <button type="button" disabled={loading||working} onClick={()=>void refresh()}>Refresh upcoming visits / Actualizar visitas</button>
  {loading&&<p role="status">Checking service visits… / Verificando visitas…</p>}
  {!loading&&!error&&visits.length===0&&<p>No scheduled visits for the next 30 days.</p>}
  {!loading&&visits.map(v=><div key={v.id}
    style={{borderTop:"1px solid var(--line,#bbb)",marginTop:12,paddingTop:12}}>
    <strong>{v.location_name}</strong>
    <p style={{margin:"5px 0"}}>{v.date} · {time(v.start)}–{time(v.end)}</p>
    <p style={{fontSize:13}}><strong>{v.published?
     "Published / Publicada":"Private / Privada"}</strong></p>
    <label htmlFor={"visit-note-"+v.id}>Customer-safe public note (optional, 5–300 characters) / Nota pública</label>
    <textarea id={"visit-note-"+v.id} rows={2} maxLength={300}
     disabled={working} value={notes[v.id]||""}
     onChange={e=>setNotes(p=>({...p,[v.id]:e.target.value}))}
     placeholder="Example: Scheduled routine service visit"/>
    <button type="button" disabled={working||loading}
      onClick={()=>void publish(v,!v.published)}>
      {v.published?"Withdraw visit / Retirar visita":"Publish visit / Publicar visita"}
    </button>
  </div>)}
 </section>;
}
