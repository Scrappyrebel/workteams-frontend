"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";

export default function WorkOrderCustomerPublication({orderId,companyId,canManage}){
 const [published,setPublished]=useState(null);
 const [publicTitle,setPublicTitle]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const company=useRef(companyId);company.current=companyId;
 async function refresh(){
  setError("");
  const current=companyId;
  const {data,error:e}=await supabase().rpc("get_workteams_work_order_publication_for_manager",{p_order_id:orderId});
  if(company.current!==current)return;
  if(e||data?.ok!==true||typeof data.published!=="boolean"){
   setPublished(null);setError("Could not verify this work order's customer publication. No changes were made.");return;
  }
  setPublished(data.published);
  setPublicTitle(data.customer_title||"");
 }
 useEffect(()=>{
  let active=true;
  setPublished(null);setPublicTitle("");setNotice("");setError("");
  if(canManage&&orderId)
   supabase().rpc("get_workteams_work_order_publication_for_manager",{p_order_id:orderId})
   .then(({data,error:e})=>{
    if(!active)return;
    if(e||data?.ok!==true||typeof data.published!=="boolean")
     setError("Could not verify current customer publication.");
    else{setPublished(data.published);setPublicTitle(data.customer_title||"")}
   });
  return ()=>{active=false};
 },[orderId,companyId,canManage]);
 async function save(publish){
  if(!canManage||busy||published===null)return;
  const title=publicTitle.trim();
  if(publish&&(title.length<8||title.length>140||/(https?:\/\/|www\.|\.pdf|\.docx?|\.zip)/i.test(title))){
   setError("Enter a public-safe title of 8 to 140 characters without document links.");return;
  }
  const decision=publish?
   "Publish ONLY the customer-safe title, work-order status and due date for customers with separate approved location access? Private descriptions, staff, comments and prices will not be shared.":
   "Withdraw this published work order immediately from every customer portal?";
  if(!window.confirm(decision))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data,error:e}=await supabase().rpc("set_workteams_work_order_publication",{
    p_order_id:orderId,p_publish:publish,p_customer_title:publish?title:null
   });
   if(e||data?.ok!==true||data.published!==publish)throw Error(e?.message||"Publication was not verified.");
   await refresh();
   setNotice(publish?
    "Customer-safe work order published. Only contacts separately approved for this location can see it.":
    "Customer publication withdrawn. It is no longer available to customer accounts.");
  }catch(err){setPublished(null);setError(err.message||"Could not confirm publication. Refresh before retrying.")}
  finally{setBusy(false)}
 }
 if(!canManage)return null;
 return <section className="panel" style={{padding:20,margin:"18px 0"}}>
  <h3>Customer Portal — Published Work Order</h3>
  <p style={{fontSize:14}}>Private by default. Write a separate customer-safe title; do not copy internal instructions, assigned staff or prices. Only status and due date accompany your approved title.</p>
  <p role="status">{published===null?"Checking publication…":
    published?"Published to approved customer accounts":"Private — not published"}</p>
  <label htmlFor={"work-order-public-title-"+orderId}>Customer-safe public title</label>
  <input type="text" id={"work-order-public-title-"+orderId} value={publicTitle}
   onChange={e=>setPublicTitle(e.target.value)}
   minLength={8} maxLength={140} style={{display:"block",width:"100%",margin:"8px 0"}}
   placeholder="Service request being reviewed"/>
  {error&&<p role="alert" style={{color:"#b3261e"}}>{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
   <button type="button" disabled={busy||published===null}
     onClick={()=>void save(true)}>{published?"Update published title":"Publish customer-safe status"}</button>
   {published&&<button type="button" disabled={busy}
     onClick={()=>void save(false)}>Withdraw customer publication</button>}
   <button type="button" disabled={busy} onClick={()=>void refresh()}>Recheck publication</button>
  </div>
 </section>;
}
