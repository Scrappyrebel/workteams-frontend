"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";

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
 const fileRef=useRef(null);
 const selected=locations?.some(l=>l.id===locationId);
 async function refresh(){
  const id=locationId;
  if(!companyId||!id||!pilotRequested)return;
  setLoading(true);setDocs([]);setError("");
  const {data,error:e}=await supabase().rpc("list_workteams_customer_documents_manager",{
   p_company_id:companyId,p_location_id:id
  });
  if(e||data?.ok!==true||!Array.isArray(data.documents)){
   setError("Private documents could not be verified. Please retry.");
   setDocs([]);
  }else setDocs(data.documents);
  setLoading(false);
 }
 useEffect(()=>{
  setDocs([]);setError("");setNotice("");
  if(companyId&&locationId&&selected&&pilotRequested)void refresh();
 },[companyId,locationId,pilotRequested]);

 async function upload(e){
  e.preventDefault();
  if(!selected||!companyId||!file||busy||loading||!pilotRequested)return;
  if(!window.confirm("Upload this PDF privately for this company's selected service location? The file will NOT be visible to customers unless separately published and customer document access is approved."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data:session,error:sessionError}=await supabase().auth.getSession();
   const token=session?.session?.access_token;
   if(sessionError||!token)throw Error("Sign in as a company manager to upload documents.");
   const form=new FormData();
   form.append("company_id",companyId);form.append("location_id",locationId);
   form.append("title",title.trim());form.append("document",file);
   const res=await fetch("/api/customer-documents/upload",{
    method:"POST",headers:{Authorization:"Bearer "+token},body:form,cache:"no-store"
   });
   const out=await res.json();
   if(!res.ok||out?.ok!==true||out.published!==false)
    throw Error(out?.error||"The private PDF upload could not be verified.");
   setTitle("");setFile(null);
   if(fileRef.current)fileRef.current.value="";
   setNotice("PDF uploaded privately and UNPUBLISHED. Review the title and choose Publish only when approved for customers.");
   await refresh();
  }catch(e){setError(e.message||"PDF upload was not confirmed.")}
  finally{setBusy(false)}
 }
 async function publish(doc,makePublic){
  if(busy||loading||!companyId||!selected||!pilotRequested)return;
  const question=makePublic?
   "Publish this PDF for approved verified customer accounts at this service location? Only contacts with separate document permission can download. Review the PDF for sensitive information first.":
   "Withdraw this PDF immediately from all customer account downloads?";
  if(!window.confirm(question))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data,error:e}=await supabase().rpc("set_workteams_customer_document_publication",{
    p_company_id:companyId,p_document_id:doc.id,p_publish:makePublic,
    p_expires_at:makePublic?new Date(Date.now()+Number(expiryDays)*86400000).toISOString():null
   });
   if(e||data?.ok!==true||data.published!==makePublic)
    throw Error(e?.message||"Document publication was not verified.");
   setNotice(makePublic?"PDF publication saved. Approved customers with document permission may download.":"Publication withdrawn; future downloads are blocked.");
   await refresh();
  }catch(e){setError(e.message||"Publication change could not be confirmed.")}
  finally{setBusy(false)}
 }
 if(!pilotRequested)return null;
 return <section className="panel" style={{padding:20,margin:"16px 0"}}>
  <h3>Customer documents — private PDF center / Documentos privados</h3>
  <p style={{fontSize:14}}>Manager-only. PDF files stay private until explicitly published. Customers also need an independent document grant. Only verified accounts can download; shared service-location links cannot.</p>
  <label htmlFor="doc-company-location">Service location / Ubicación</label>
  <select id="doc-company-location" value={locationId} onChange={e=>setLocationId(e.target.value)}>
   <option value="">Select a company location</option>
   {(locations||[]).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
  </select>
  {selected&&<>
   <form onSubmit={e=>void upload(e)} style={{display:"grid",gap:10,marginTop:12}}>
    <label htmlFor="doc-title">Customer-safe document title</label>
    <input id="doc-title" type="text" required minLength={3} maxLength={120}
     value={title} onChange={e=>setTitle(e.target.value)}/>
    <label htmlFor="doc-pdf">Private PDF — maximum 8 MB</label>
    <input id="doc-pdf" ref={fileRef} type="file" accept=".pdf,application/pdf"
     required onChange={e=>setFile(e.target.files?.[0]||null)}/>
    <button type="submit" disabled={busy||loading||!file||title.trim().length<3}>
     {busy?"Saving…":"Upload PRIVATE PDF"}
    </button>
   </form>
   {error&&<p role="alert" style={{color:"#b3261e"}}>{error}</p>}
   {notice&&<p role="status">{notice}</p>}
   <h4>Private and published PDFs</h4>
   <button type="button" disabled={busy||loading} onClick={()=>void refresh()}>
    Refresh document list
   </button>
   {loading&&<p role="status">Checking company documents…</p>}
   {!loading&&!error&&docs.length===0&&<p>No PDF documents have been added here.</p>}
   <label htmlFor="doc-expiry-days">Published download expiry / Vencimiento del acceso</label>
   <select id="doc-expiry-days" value={expiryDays} onChange={e=>setExpiryDays(e.target.value)}>
    <option value="30">30 days / días</option>
    <option value="90">90 days / días</option>
    <option value="365">365 days / días</option>
   </select>
   {docs.map(doc=><div key={doc.id} style={{borderTop:"1px solid var(--line,#ccc)",padding:"12px 0"}}>
    <strong>{doc.title}</strong>
    <p style={{fontSize:13}}>{doc.file_name} · {doc.published?"PUBLISHED":"PRIVATE"} · {doc.expires_at?"Expires "+new Date(doc.expires_at).toLocaleDateString():"No expiry set"}</p>
    <button type="button" disabled={busy||loading} onClick={()=>void publish(doc,!doc.published)}>
     {doc.published?"Withdraw / Retirar":"Publish after review / Publicar"}
    </button>
   </div>)}
  </>}
 </section>;
}
