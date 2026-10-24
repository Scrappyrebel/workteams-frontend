"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../../lib/supabase";
import AuthenticatedCustomerRequests from "../../components/AuthenticatedCustomerRequests";
import AuthenticatedCustomerQuality from "../../components/AuthenticatedCustomerQuality";
import AuthenticatedCustomerWorkOrders from "../../components/AuthenticatedCustomerWorkOrders";
import AuthenticatedCustomerDocuments from "../../components/AuthenticatedCustomerDocuments";
import AuthenticatedCustomerServiceSchedule from "../../components/AuthenticatedCustomerServiceSchedule";

export default function AuthenticatedCustomerPortal(){
 const [language,setLanguage]=useState("en");
 const [busy,setBusy]=useState(true);
 const [loggedIn,setLoggedIn]=useState(false);
 const [locations,setLocations]=useState([]);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const t=(en,es)=>language==="es"?es:en;
 // A browser can keep old customer data rendered after a manager revokes it.
 // Revalidate every minute while visible and whenever the tab regains focus.
 // Server RPCs remain the authorization authority on every read and write.
 const requestSequence=useRef(0);
 const mounted=useRef(false);
 const latestLanguage=useRef(language);
 latestLanguage.current=language;
 const tr=(en,es)=>latestLanguage.current==="es"?es:en;
 async function refresh({silent=false}={}){
  const sequence=++requestSequence.current;
  if(!silent){setBusy(true);setError("");setLocations([]);setNotice("");}
  try{
   const sb=supabase();
   const {data:userState,error:userError}=await sb.auth.getUser();
   if(!mounted.current||sequence!==requestSequence.current)return;
   if(userError||!userState?.user){
    setLocations([]);setLoggedIn(false);setNotice("");
    if(userError)setError(tr("Could not verify your current session. Please sign in again.",
     "No se pudo verificar la sesión actual. Vuelva a iniciar sesión."));
    return;
   }
   // Claiming an identity may write to the database; do it on initial/manual
   // entry only. Visibility/poll checks are read-only and verify existing scope.
   if(!silent){
    const {data:claimed,error:claimError}=await sb.rpc("claim_workteams_customer_identity");
    if(!mounted.current||sequence!==requestSequence.current)return;
    if(claimError||typeof claimed!=="number")
     throw new Error(tr("Could not verify customer account authorization. Please try again.",
      "No se pudo verificar la autorización de su cuenta. Inténtelo de nuevo."));
   }
   const {data,error:scopeError}=await sb.rpc("get_my_workteams_customer_identity");
   if(!mounted.current||sequence!==requestSequence.current)return;
   if(scopeError||data?.ok!==true||!Array.isArray(data.locations)){
    throw new Error(tr("Customer locations could not be verified. No information was displayed.",
     "No se pudieron verificar sus ubicaciones. No se mostró información."));
   }
   setLoggedIn(true);
   setError("");
   setLocations(previous=>
    JSON.stringify(previous)===JSON.stringify(data.locations)?previous:data.locations);
   if(data.locations.length===0){
    setNotice(latestLanguage.current==="es"?
     "No hay ubicaciones disponibles. La empresa debe aprobar su correo y ubicación y activar su portal. Los enlaces de servicio existentes siguen funcionando aparte.":
     "No customer locations are available. A business owner must first approve your verified email and location and activate their customer portal. Existing service-location links continue to work separately.");
   }else setNotice("");
  }catch(err){
   if(!mounted.current||sequence!==requestSequence.current)return;
   // Fail closed when authorization is unknown, including network failure.
   setLocations([]);setNotice("");
   setError(err instanceof Error?err.message:tr("Customer access unavailable.",
    "El acceso de clientes no está disponible."));
  }finally{
   if(mounted.current&&sequence===requestSequence.current)setBusy(false);
  }
 }
 useEffect(()=>{
  mounted.current=true;
  const params=new URLSearchParams(window.location.search);
  const supplied=params.get("lang");
  let preferred="en";
  try{
   const saved=window.localStorage.getItem("workteams-customer-portal-language");
   preferred=supplied==="es"?"es":supplied==="en"?"en":
    saved==="es"?"es":saved==="en"?"en":
    navigator.language.toLowerCase().startsWith("es")?"es":"en";
   window.localStorage.setItem("workteams-customer-portal-language",preferred);
  }catch{preferred=supplied==="es"?"es":"en";}
  latestLanguage.current=preferred;setLanguage(preferred);
  void refresh();
  const recheck=()=>{
   if(document.visibilityState==="visible")void refresh({silent:true});
  };
  document.addEventListener("visibilitychange",recheck);
  window.addEventListener("focus",recheck);
  const poll=window.setInterval(recheck,60000);
  return ()=>{
   mounted.current=false;
   requestSequence.current++;
   window.clearInterval(poll);
   window.removeEventListener("focus",recheck);
   document.removeEventListener("visibilitychange",recheck);
  };
 },[]);
 async function signOut(){
  // Invalidate every pre-signout RPC: a late successful response must not
  // repopulate a previous company's records while navigation is pending.
  requestSequence.current++;
  setLocations([]);setLoggedIn(false);setNotice("");setError("");setBusy(true);
  try{
   const {error:failure}=await supabase().auth.signOut();
   if(failure)throw failure;
   window.location.assign("/customer-login?lang="+latestLanguage.current);
  }catch(err){
   setBusy(false);
   setError(tr("Could not confirm sign out. Close this tab if using a shared device.",
    "No se pudo confirmar el cierre de sesión. Cierre esta pestaña si comparte el dispositivo."));
  }
 }
 return <main className="site-shell" style={{maxWidth:720,margin:"0 auto"}}>
  <section className="panel" style={{padding:24}}>
   <p className="eyebrow">CUSTOMER PORTAL / PORTAL DE CLIENTES</p>
   <h1>{t("Your approved service locations","Sus ubicaciones autorizadas")}</h1>
   <label htmlFor="customer-portal-language">Language / Idioma</label>
   <select id="customer-portal-language" value={language}
    onChange={e=>{
     const next=e.target.value==="es"?"es":"en";
     latestLanguage.current=next;setLanguage(next);
     try{window.localStorage.setItem("workteams-customer-portal-language",next)}catch{}
     const url=new URL(window.location.href);
     url.searchParams.set("lang",next);
     window.history.replaceState({},"",url.toString());
     void refresh({silent:true});
    }}>
    <option value="en">English</option><option value="es">Español</option>
   </select>
   <p>{t("Only verified, approved customer accounts can see company locations here. A forwarded service link does not grant customer login access.",
    "Solo las cuentas verificadas y autorizadas pueden consultar ubicaciones. Un enlace de servicio compartido no otorga acceso a cuentas.")}</p>
   {busy&&<p role="status">{t("Checking current permissions…","Verificando los permisos actuales…")}</p>}
   {!busy&&error&&<p role="alert" style={{color:"#b3261e"}}>{error}</p>}
   {!busy&&!loggedIn&&<p><Link href="/customer-login">{t("Sign in to your customer account","Inicie sesión en su cuenta")}</Link></p>}
   {!busy&&notice&&<p role="status">{notice}</p>}
   {!busy&&locations.length>0&&<div style={{display:"grid",gap:14}}>
     {locations.map((loc,i)=><section key={loc.company_id+":"+loc.location_id+":"+i}
       className="panel" style={{padding:14}}>
       <h2>{loc.company_name}</h2>
       <p>{loc.contact_name}</p><strong>{loc.location_name}</strong>
       <p style={{fontSize:13}}>{t(
         "Only manager-approved reports, work orders, service visits, private PDFs and requests for this location are shown. Invoices, employee records and internal business information remain private.",
         "Solo se muestran informes, órdenes de trabajo, visitas, archivos PDF privados y solicitudes aprobados para esta ubicación. Las facturas, los expedientes del personal y la información interna siguen siendo privados."
       )}</p>
       <AuthenticatedCustomerQuality
         companyId={loc.company_id} locationId={loc.location_id}
         language={language}/>
       <AuthenticatedCustomerWorkOrders
         companyId={loc.company_id} locationId={loc.location_id}
         language={language}/>
       <AuthenticatedCustomerDocuments
         companyId={loc.company_id} locationId={loc.location_id}
         language={language}/>
       <AuthenticatedCustomerServiceSchedule
        companyId={loc.company_id} locationId={loc.location_id}
        language={language}/>
       <AuthenticatedCustomerRequests
         companyId={loc.company_id} locationId={loc.location_id}
         language={language}
         onAuthorizationLost={()=>{
           // Reject a stale account refresh already in flight when a child
           // RPC proves that the currently displayed location is unauthorized.
           requestSequence.current++;
           setLocations([]);setNotice("");setBusy(false);
           setError(t(
             "Customer authorization could not be verified. Recheck your account before continuing.",
             "No se pudieron verificar sus permisos. Revise su cuenta antes de continuar."
           ));
         }}/>

     </section>)}
    </div>}
   {!busy&&loggedIn&&<div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:14}}>
    <button type="button" onClick={()=>void refresh()}>{t("Recheck access","Verificar acceso")}</button>
    <button type="button" onClick={()=>void signOut()}>{t("Sign out","Cerrar sesión")}</button>
   </div>}
  </section>
 </main>;
}
