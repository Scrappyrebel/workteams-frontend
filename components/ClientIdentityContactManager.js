"use client";
import {useEffect,useState} from "react";
import {supabase} from "../lib/supabase";

export default function ClientIdentityContactManager({companyId,locations,pilotRequested}){
 const [contacts,setContacts]=useState([]);
 const [email,setEmail]=useState("");
 const [name,setName]=useState("");
 const [locationId,setLocationId]=useState("");
 const [language,setLanguage]=useState("en");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loaded,setLoaded]=useState(false);
 const t=(en,es)=>language==="es"?es:en;

 async function refresh(){
  if(!companyId||!pilotRequested)return;
  setError("");setLoaded(false);
  const {data,error:e}=await supabase().rpc("list_workteams_customer_identity_contacts",{
   p_company_id:companyId
  });
  if(e||!data?.ok||!Array.isArray(data.contacts)||typeof data.customer_login_enabled!=="boolean"){
   setContacts([]);setError(t("Approved contacts could not be verified. No changes were made.",
    "No fue posible verificar los contactos. No se modificó ningún registro."));
  }else setContacts(data.contacts);
  setLoaded(true);
 }
 useEffect(()=>{
  let active=true;
  setContacts([]);setLoaded(false);setError("");setNotice("");
  if(pilotRequested&&companyId){
   supabase().rpc("list_workteams_customer_identity_contacts",{
    p_company_id:companyId
   }).then(({data,error:e})=>{
    if(!active)return;
    if(e||!data?.ok||!Array.isArray(data.contacts)||typeof data.customer_login_enabled!=="boolean")
     setError("Customer contact list could not be verified.");
    else setContacts(data.contacts);
    setLoaded(true);
   });
  }
  return ()=>{active=false};
 },[companyId,pilotRequested]);

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
   setNotice(t("Contact and one location approved. Customer account login remains disabled.",
    "Se aprobó el contacto y una ubicación. El inicio de sesión continúa desactivado."));
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
  <h4>{t("Company contacts","Contactos de la empresa")}</h4>
  <button type="button" disabled={busy} onClick={()=>void refresh()}>
   {t("Refresh verified contacts","Actualizar contactos")}
  </button>
  {!loaded&&<p>{t("Checking approved contacts…","Verificando contactos…")}</p>}
  {loaded&&!error&&contacts.length===0&&<p>{t("No approved contacts yet.","Aún no hay contactos aprobados.")}</p>}
  {contacts.map(c=><div key={c.id} style={{borderTop:"1px solid var(--border,#ccc)",padding:"12px 0"}}>
   <strong>{c.name||"Customer"}</strong> — <span>{c.email}</span>
   <p style={{margin:"4px 0"}}>{t("Status","Estado")}: {c.status}</p>
   <p style={{fontSize:13}}>{(c.locations||[]).map(l=>l.name+(l.revoked?" (revoked)":"")).join(", ")||"No location grants"}</p>
   {c.status!=="disabled"&&<button type="button" disabled={busy} onClick={()=>void revoke(c.id)}>
    {t("Revoke contact","Revocar contacto")}
   </button>}
  </div>)}
 </section>;
}
