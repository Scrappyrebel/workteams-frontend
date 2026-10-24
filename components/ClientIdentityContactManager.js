"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabase";
import {makeCustomerInvitation} from "../lib/customer-invitation.mjs";
import {findReadyCustomerContacts} from "../lib/customer-pilot-readiness.mjs";

export default function ClientIdentityContactManager({companyId,locations,pilotRequested,pilotEnabled}){
 const [contacts,setContacts]=useState([]);
 const [email,setEmail]=useState("");
 const [name,setName]=useState("");
 const [locationId,setLocationId]=useState("");
 const [language,setLanguage]=useState("en");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loaded,setLoaded]=useState(false);
 const [serverLoginEnabled,setServerLoginEnabled]=useState(null);
 const [copyBusy,setCopyBusy]=useState(false);
 const currentCompany=useRef(companyId);
 currentCompany.current=companyId;
 const t=(en,es)=>language==="es"?es:en;

 async function refresh(){
  const id=companyId;
  if(!id||!pilotRequested)return;
  setError("");setLoaded(false);setServerLoginEnabled(null);
  const {data,error:e}=await supabase().rpc("list_workteams_customer_identity_contacts",{
   p_company_id:id
  });
  if(currentCompany.current!==id)return;
  if(e||data?.ok!==true||!Array.isArray(data.contacts)||typeof data.customer_login_enabled!=="boolean"){
   setContacts([]);setServerLoginEnabled(null);
   setError(t("Approved contacts could not be verified. No changes were made.",
    "No fue posible verificar los contactos. No se modificó ningún registro."));
  }else{
   setContacts(data.contacts);
   setServerLoginEnabled(data.customer_login_enabled);
  }
  setLoaded(true);
 }
 useEffect(()=>{
  let active=true;
  setContacts([]);setLoaded(false);setServerLoginEnabled(null);setError("");setNotice("");
  if(pilotRequested&&companyId){
   supabase().rpc("list_workteams_customer_identity_contacts",{
    p_company_id:companyId
   }).then(({data,error:e})=>{
    if(!active)return;
    if(e||data?.ok!==true||!Array.isArray(data.contacts)||typeof data.customer_login_enabled!=="boolean"){
     setContacts([]);setServerLoginEnabled(null);
     setError("Customer contact list could not be verified.");
    }else{
     setContacts(data.contacts);
     setServerLoginEnabled(data.customer_login_enabled);
    }
    setLoaded(true);
   });
  }
  return ()=>{active=false};
 },[companyId,pilotRequested,pilotEnabled]);

 async function approve(e){
  e.preventDefault();
  if(!pilotRequested||!companyId||busy||!locationId)return;
  if(!window.confirm(t(
   "Approve this email for the selected company and location? Authentication remains disabled until a separate launch approval.",
   "¿Aprobar este correo para la empresa y ubicación seleccionadas? El acceso seguirá desactivado hasta su autorización final."
  )))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data,error:e}=await supabase().rpc("approve_workteams_customer_identity_contact",{
    p_company_id:companyId,p_email:email.trim().toLowerCase(),
    p_name:name.trim(),p_language:language,p_location_id:locationId
   });
   if(e||data?.ok!==true||typeof data.customer_login_enabled!=="boolean")throw Error(e?.message||"Approval was not confirmed.");
   setNotice(data.customer_login_enabled?
    t("Contact and location approved. If the owner enabled customer login, you may copy the invitation below.",
      "Contacto y ubicación aprobados. Si el propietario activó el acceso, puede copiar la invitación."):
    t("Contact and location approved; customer login is still disabled until the owner activates it.",
      "Contacto y ubicación aprobados; el acceso seguirá desactivado hasta que lo active el propietario."));
   setEmail("");setName("");await refresh();
  }catch(err){setError(err.message||"Could not approve this contact.")}finally{setBusy(false)}
 }
 async function revoke(id){
  if(!pilotRequested||!companyId||busy||!window.confirm(t(
   "Revoke this contact and all their company location grants?",
   "¿Revocar este contacto y sus permisos de ubicación?"
  )))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data,error:e}=await supabase().rpc("revoke_workteams_customer_identity_contact",{
    p_company_id:companyId,p_contact_id:id
   });
   if(e||data?.ok!==true||typeof data.customer_login_enabled!=="boolean")throw Error(e?.message||"Revocation was not confirmed.");
   setNotice(t("Contact revoked. Previously linked access is blocked.",
    "Contacto revocado. Se ha bloqueado el acceso vinculado."));
   await refresh();
  }catch(err){setError(err.message||"Could not revoke this contact.")}finally{setBusy(false)}
 }
 async function changeQuality(contact,location,allow){
  if(!companyId||!pilotRequested||busy||contact.status!=="active"||location.revoked)return;
  const question=allow?
    t("Publish only manager-approved quality summaries to this verified customer at this exact location? Internal notes, photos and checklists stay private.",
      "¿Permitir que este cliente vea únicamente los resúmenes de calidad publicados para esta ubicación? Las notas y fotos internas seguirán privadas."):
    t("Stop this customer's quality report access immediately for this location?",
      "¿Revocar inmediatamente el acceso de este cliente a los informes de esta ubicación?");
  if(!window.confirm(question))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data,error:e}=await supabase().rpc("set_workteams_customer_quality_access",{
    p_company_id:companyId,p_contact_id:contact.id,p_location_id:location.id,
    p_allow:allow
   });
   if(e||data?.ok!==true||data.quality_access!==allow)
    throw Error(e?.message||"Quality permission update could not be confirmed.");
   setNotice(allow?
    t("Published quality summaries enabled for this contact and location.",
      "Se permitió ver los informes publicados para este contacto y ubicación."):
    t("Quality report access revoked for this contact and location.",
      "Se revocó el acceso a los informes de este contacto y ubicación."));
   await refresh();
  }catch(e){setError(e.message||"Cannot verify quality permissions.")}
  finally{setBusy(false)}
 }
 async function changeWorkOrderAccess(contact,location,allow){
  if(!companyId||!pilotRequested||busy||contact.status!=="active"||location.revoked)return;
  const question=allow?
    t("Allow this contact to view ONLY work orders separately published with customer-safe titles for this exact location? Internal notes, employees and prices remain private.",
      "¿Permitir a este cliente consultar SOLO órdenes publicadas para esta ubicación con títulos seguros? Las notas, empleados y precios internos seguirán privados."):
    t("Remove this contact's customer work-order permission immediately?",
      "¿Revocar inmediatamente el acceso del cliente a las órdenes de trabajo?");
  if(!window.confirm(question))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data,error:e}=await supabase().rpc("set_workteams_customer_work_order_access",{
    p_company_id:companyId,p_contact_id:contact.id,
    p_location_id:location.id,p_allow:allow
   });
   if(e||data?.ok!==true||data.work_order_access!==allow)
    throw Error(e?.message||"The work-order permission could not be confirmed.");
   setNotice(allow?
    t("Published work-order access approved for this contact and location.",
      "Acceso autorizado a órdenes publicadas para este contacto y ubicación."):
    t("Work-order access revoked for this contact and location.",
      "Se revocó el acceso a órdenes de trabajo."));
   await refresh();
  }catch(err){setError(err.message||"Could not confirm work-order permissions.")}
  finally{setBusy(false)}
 }
 async function changeDocumentAccess(contact,location,allow){
  if(!companyId||!pilotRequested||busy||contact.status!=="active"||location.revoked)return;
  if(!window.confirm(allow?
   t("Allow this verified customer to download ONLY privately stored PDFs explicitly published for this exact location? Review each PDF before publishing.",
     "¿Permitir que este cliente descargue SOLO archivos PDF publicados expresamente para esta ubicación? Revise cada documento antes de publicarlo."):
   t("Revoke this verified customer's PDF access for this location immediately?",
     "¿Revocar inmediatamente el acceso de este cliente a los archivos PDF de esta ubicación?")
  ))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data,error:e}=await supabase().rpc("set_workteams_customer_document_access",{
    p_company_id:companyId,p_contact_id:contact.id,p_location_id:location.id,p_allow:allow
   });
   if(e||data?.ok!==true||data.document_access!==allow)
    throw Error(e?.message||"Document access could not be verified.");
   setNotice(allow?t("Private document permission saved for this customer/location.",
    "Se autorizó el acceso a documentos privados para este cliente y ubicación."):
    t("PDF access revoked immediately for this customer/location.",
     "Acceso a PDF revocado para este cliente y ubicación."));
   await refresh();
  }catch(e){setError(e.message||"Could not confirm document permission.")}
  finally{setBusy(false)}
 }
 async function changeScheduleAccess(contact,location,allow){
  if(!companyId||!pilotRequested||busy||contact.status!=="active"||location.active!==true)return;
  const confirmText=allow?
   t("Allow this verified customer to see only manager-published visit dates and times for this exact location? Internal shifts and staff stay private.",
     "¿Permitir que este cliente vea solo las visitas publicadas para esta ubicación? Los turnos internos y empleados permanecen privados."):
   t("Remove this customer's published schedule permission for this location immediately?",
     "¿Revocar inmediatamente el acceso del cliente al calendario publicado de esta ubicación?");
  if(!window.confirm(confirmText))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data,error:e}=await supabase().rpc("set_workteams_customer_schedule_access",{
    p_company_id:companyId,p_contact_id:contact.id,p_location_id:location.id,p_allow:allow
   });
   if(e||data?.ok!==true||data.schedule_access!==allow)
    throw Error(e?.message||"The schedule permission could not be confirmed.");
   setNotice(allow?
    t("Published visits approved for this contact and location.",
      "Visitas publicadas autorizadas para este contacto y ubicación."):
    t("Schedule permission revoked for this contact and location.",
      "Se revocó el permiso del calendario para este contacto y ubicación."));
   await refresh();
  }catch(err){setError(err.message||"Schedule permission is unverified.")}
  finally{setBusy(false)}
 }
 async function copyInvitation(contact,location){
  if(copyBusy||busy||!loaded||pilotEnabled!==true||serverLoginEnabled!==true||
     contact.status!=="active"||location.active!==true||!contact.email)return;
  setCopyBusy(true);setNotice("");setError("");
  try{
   const message=makeCustomerInvitation({
     origin:window.location.origin,email:contact.email,
     locationName:location.name,language:contact.language
   });
   if(!navigator.clipboard?.writeText)
     throw new Error("clipboard_unavailable");
   await navigator.clipboard.writeText(message);
   setNotice(t("Invitation copied. No email or customer account was created or sent. Send it only to the approved contact.",
    "Invitación copiada. No se creó ni envió ningún correo o cuenta. Compártala únicamente con el contacto autorizado."));
  }catch(e){
   const message=makeCustomerInvitation({
     origin:window.location.origin,email:contact.email,
     locationName:location.name,language:contact.language
   });
   window.prompt(t("Automatic copy was unavailable. Select and copy this invitation manually:",
    "No se pudo copiar automáticamente. Seleccione y copie esta invitación:"),message);
   setNotice(t("Manual copy dialog opened. Nothing was sent automatically.",
    "Se abrió el diálogo para copiar manualmente. No se envió nada automáticamente."));
  }finally{setCopyBusy(false)}
 }
 const approved=contacts.filter(c=>c.status==="active");
 const activeLocations=approved.flatMap(c=>(c.locations||[]).filter(l=>l.active===true));
 const linked=approved.filter(c=>c.account_linked===true);
 // Readiness must belong to the SAME approved contact/location; combining
 // one contact's confirmed account with another's grant is a false green.
 const readyContacts=findReadyCustomerContacts(contacts);
 const readiness=[
  {ok:pilotRequested===true,en:"Company pilot requested",es:"Programa piloto solicitado"},
  {ok:serverLoginEnabled===true&&pilotEnabled===true,en:"Owner activated customer login",es:"Acceso de clientes activado por el propietario"},
  {ok:approved.length>0,en:"At least one customer contact approved",es:"Al menos un contacto autorizado"},
  {ok:activeLocations.length>0,en:"Valid, active service-location grant",es:"Ubicación de servicio autorizada y vigente"},
  {ok:readyContacts.length>0,en:"A confirmed customer account has an active location grant for that same contact",es:"Una cuenta confirmada tiene un permiso vigente para su propia ubicación"}
 ];
 if(!pilotRequested)return null;
 return <section className="panel" style={{padding:20,margin:"16px 0"}}>
  <h3>{t("Verified Customer Contacts — Pilot preparation","Contactos verificados — Preparación del programa piloto")}</h3>
  <p style={{fontSize:14}}>
   {t("Approve one verified email for one service location at a time. This does not email anyone, create accounts, or turn on customer sign-in. Private invoices, documents, employees and other locations stay inaccessible.",
   "Apruebe un correo y una ubicación a la vez. No envía correos, no crea cuentas y no activa el acceso. Las facturas, documentos y otras ubicaciones siguen siendo privados.")}
  </p>
  <label htmlFor="identity-contact-language">Language / Idioma</label>
  <select id="identity-contact-language" value={language} onChange={e=>setLanguage(e.target.value==="es"?"es":"en")}>
   <option value="en">English</option><option value="es">Español</option>
  </select>
  <form onSubmit={approve} style={{display:"grid",gap:10,marginTop:12}}>
   <label htmlFor="identity-contact-name">{t("Approved customer's name","Nombre del cliente")}</label>
   <input id="identity-contact-name" type="text" required maxLength={120} minLength={2} value={name} onChange={e=>setName(e.target.value)}/>
   <label htmlFor="identity-contact-email">{t("Approved email address","Correo autorizado")}</label>
   <input id="identity-contact-email" type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/>
   <label htmlFor="identity-contact-location">{t("Company service location","Ubicación de servicio")}</label>
   <select id="identity-contact-location" required value={locationId} onChange={e=>setLocationId(e.target.value)}>
    <option value="">{t("Select location","Seleccione una ubicación")}</option>
    {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
   </select>
   <button type="submit" disabled={busy||!locationId||!email.trim()||!name.trim()||!loaded}>
    {busy?t("Saving…","Guardando…"):t("Approve contact and location","Aprobar contacto y ubicación")}
   </button>
  </form>
  <p role="status" style={{fontWeight:600}}>{notice}</p>
  {error&&<p role="alert" style={{color:"#b3261e"}}>{error}</p>}
  <section aria-label="Customer pilot readiness" style={{border:"1px solid var(--line,#bbb)",borderRadius:8,padding:12,margin:"16px 0"}}>
   <h4>{t("Customer pilot readiness","Preparación del programa piloto")}</h4>
   <p style={{fontSize:13}}>{t(
    "These checks use the current manager-authorized server response. They do not prove a real iPhone or Android customer has tested the portal.",
    "Estas verificaciones provienen del servidor autorizado. No demuestran pruebas reales de clientes en iPhone o Android.")}</p>
   {readiness.map((r,i)=><p key={i} style={{margin:"5px 0"}}>
     <strong>{r.ok?"✓":"○"}</strong> {language==="es"?r.es:r.en}
   </p>)}
   <p><strong>{t("Software readiness","Preparación técnica")}: {readiness.filter(r=>r.ok).length}/{readiness.length}</strong></p>
   {readyContacts.length===0&&<p role="status" style={{fontSize:13}}>
     {t("No single approved contact has BOTH a linked confirmed account and an active location. Complete those two steps for the same customer before field testing.",
      "Ningún contacto autorizado tiene AMBOS: una cuenta confirmada vinculada y una ubicación vigente. Complete los dos pasos con el mismo cliente antes de probar.")}
   </p>}
   <p style={{fontSize:13}}>{t("Real customer sign-in, request submission, revocation and phone acceptance: NOT VERIFIED until completed on customer devices.",
    "Inicio de sesión real, solicitudes, revocación y pruebas en teléfonos: NO VERIFICADO hasta probarlo con clientes.")}</p>
  </section>
  <h4>{t("Company contacts","Contactos de la empresa")}</h4>
  <button type="button" disabled={busy} onClick={()=>void refresh()}>
   {t("Refresh verified contacts","Actualizar contactos")}
  </button>
  {!loaded&&<p>{t("Checking approved contacts…","Verificando contactos…")}</p>}
  {loaded&&!error&&contacts.length===0&&<p>{t("No approved contacts yet.","Aún no hay contactos aprobados.")}</p>}
  {contacts.map(c=><div key={c.id} style={{borderTop:"1px solid var(--border,#ccc)",padding:"12px 0"}}>
   <strong>{c.name||"Customer"}</strong> — <span>{c.email}</span>
   <p style={{margin:"4px 0"}}>{t("Status","Estado")}: {c.status}</p>
   <p style={{fontSize:13}}>
    {t("Verified customer account: ","Cuenta verificada de cliente: ")}
    <strong>{c.account_linked?t("Linked","Vinculada"):t("Not yet linked","Aún sin vincular")}</strong>
   </p>
   <div style={{display:"grid",gap:8,margin:"10px 0"}}>
    {(c.locations||[]).length===0&&<p>{t("No approved locations","No hay ubicaciones autorizadas")}</p>}
    {(c.locations||[]).map(l=><div key={l.id}
      style={{border:"1px solid var(--line,#ccc)",padding:10,borderRadius:7}}>
      <strong>{l.name}</strong> {l.revoked&&t("(revoked)","(revocado)")}
      <p style={{fontSize:13,margin:"4px 0"}}>{l.active===true?
       t("Approved location active","Ubicación autorizada activa"):
       t("Location grant unavailable or expired","Permiso de ubicación no vigente")}</p>
      <p style={{fontSize:13,margin:"6px 0"}}>{t("Published visits: ","Visitas publicadas: ")}
       {l.schedule_access?t("Approved","Autorizadas"):t("Private","Privadas")}</p>
      {c.status==="active"&&l.active===true&&<button type="button"
       disabled={busy||!loaded}
       onClick={()=>void changeScheduleAccess(c,l,!l.schedule_access)}>
       {l.schedule_access?t("Revoke upcoming visits","Revocar visitas"):
        t("Allow published visits","Permitir visitas publicadas")}
      </button>}
      <p style={{fontSize:13,margin:"6px 0"}}>{t("Published quality access: ","Acceso a informes de calidad: ")}
       {l.quality_access?t("Approved","Autorizado"):t("Private","Privado")}</p>
      {c.status==="active"&&l.active===true&&pilotEnabled===true&&serverLoginEnabled===true&&
       <button type="button" disabled={copyBusy||busy} onClick={()=>void copyInvitation(c,l)}>
        {copyBusy?t("Copying…","Copiando…"):
         t("Copy private customer invitation","Copiar invitación para el cliente")}
       </button>}
      {c.status==="active"&&!l.revoked&&l.basic_portal&&<button type="button"
       disabled={busy||!loaded}
       onClick={()=>void changeQuality(c,l,!l.quality_access)}>
        {l.quality_access?t("Revoke quality reports","Revocar informes"):
         t("Allow published quality reports","Permitir informes publicados")}
      </button>}
      <p style={{fontSize:13,margin:"6px 0"}}>{t("Private PDF access: ","Acceso a documentos PDF: ")}
       {l.document_access?t("Approved","Autorizado"):t("Private","Privado")}</p>
      {c.status==="active"&&!l.revoked&&l.basic_portal&&<button type="button"
       disabled={busy||!loaded}
       onClick={()=>void changeDocumentAccess(c,l,!l.document_access)}>
        {l.document_access?t("Revoke private PDFs","Revocar documentos PDF"):
         t("Allow published private PDFs","Permitir archivos PDF publicados")}
      </button>}
      <p style={{fontSize:13,margin:"6px 0"}}>{t("Published work orders: ","Órdenes publicadas: ")}
       {l.work_order_access?t("Approved","Autorizado"):t("Private","Privado")}</p>
      {c.status==="active"&&!l.revoked&&l.basic_portal&&<button type="button"
       disabled={busy||!loaded}
       onClick={()=>void changeWorkOrderAccess(c,l,!l.work_order_access)}>
        {l.work_order_access?t("Revoke published work orders","Revocar órdenes publicadas"):
         t("Allow published work orders","Permitir órdenes publicadas")}
      </button>}
    </div>)}
   </div>
   {c.status!=="disabled"&&<button type="button" disabled={busy} onClick={()=>void revoke(c.id)}>
    {t("Revoke contact","Revocar contacto")}
   </button>}
  </div>)}
 </section>;
}
