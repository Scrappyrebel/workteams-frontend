"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";

export default function AuthenticatedCustomerWorkOrders({companyId,locationId,language}){
 const [items,setItems]=useState([]);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");
 const sequence=useRef(0);
 const t=(en,es)=>language==="es"?es:en;
 const statuses={
  open:t("Open","Abierta"),
  in_progress:t("In progress","En curso"),
  completed:t("Completed","Completada"),
  cancelled:t("Cancelled","Cancelada")
 };
 async function refresh(){
  const current=++sequence.current;
  setItems([]);setNotice("");setLoading(true);
  const {data,error}=await supabase().rpc("get_workteams_authenticated_customer_work_orders",{
    p_company_id:companyId,p_location_id:locationId
  });
  if(sequence.current!==current)return;
  if(error||data?.ok!==true||!Array.isArray(data.work_orders)){
   setItems([]);
   setNotice(t("Work orders are private or your authorization could not be verified.",
    "Las órdenes son privadas o no se pudo verificar su autorización."));
  }else{
   setItems(data.work_orders);
  }
  setLoading(false);
 }
 useEffect(()=>{
  void refresh();
  const onVisible=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",onVisible);
  const interval=setInterval(onVisible,60000);
  return ()=>{sequence.current++;clearInterval(interval);document.removeEventListener("visibilitychange",onVisible)};
 },[companyId,locationId]);
 return <section style={{borderTop:"1px solid var(--line,#ddd)",paddingTop:12,marginTop:14}}>
  <h3>{t("Published Service Work Orders","Órdenes de servicio publicadas")}</h3>
  <p style={{fontSize:13}}>{t(
   "Only work orders explicitly approved by management for this location appear here. You will see a customer-safe title, current status and due date—not internal comments, staff assignments, prices or descriptions.",
   "Solo aparecen las órdenes aprobadas expresamente por la gerencia para esta ubicación. Se muestra el título autorizado, el estado y la fecha límite, nunca las notas, empleados, precios o descripciones internas."
  )}</p>
  <button type="button" disabled={loading} onClick={()=>void refresh()}>
   {t("Recheck work-order statuses","Actualizar estados de órdenes")}
  </button>
  {loading&&<p role="status">{t("Verifying published work orders…","Verificando órdenes publicadas…")}</p>}
  {!loading&&notice&&<p role="status">{notice}</p>}
  {!loading&&!notice&&items.length===0&&<p>{t("No service work orders have been published to your account.",
   "No hay órdenes de servicio publicadas para su cuenta.")}</p>}
  {!loading&&!notice&&items.map(order=><article key={order.id}
    style={{padding:"10px 0",borderBottom:"1px solid var(--line,#ddd)"}}>
    <strong style={{overflowWrap:"anywhere"}}>{order.title}</strong>
    <p>{t("Status","Estado")}: {statuses[order.status]||t("Unavailable","No disponible")}</p>
    {order.due_date&&<p>{t("Due date","Fecha prevista")}: {order.due_date}</p>}
  </article>)}
 </section>;
}
