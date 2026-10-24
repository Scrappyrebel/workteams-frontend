"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../../lib/supabase";
import AuthenticatedCustomerRequests from "../../components/AuthenticatedCustomerRequests";
import AuthenticatedCustomerQuality from "../../components/AuthenticatedCustomerQuality";

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
 async function refresh({silent=false}={}){
  const sequence=++requestSequence.current;
  if(!silent){setBusy(true);setError("");setLocations([]);setNotice("");}
  try{
   const sb=supabase();
   const {data:userState,error:userError}=await sb.auth.getUser();
   if(!mounted.current||sequence!==requestSequence.current)return;
   if(userError||!userState?.user){
    setLocations([]);setLoggedIn(false);setNotice("");
    if(userError)setError("Could not verify your current session. Please sign in again.");
    return;
   }
   // Claiming an identity may write to the database; do it on initial/manual
   // entry only. Visibility/poll checks are read-only and verify existing scope.
   if(!silent){
    const {data:claimed,error:claimError}=await sb.rpc("claim_workteams_customer_identity");
    if(!mounted.current||sequence!==requestSequence.current)return;
    if(claimError||typeof claimed!=="number")
     throw new Error("Could not verify customer account authorization. Please try again.");
   }
   const {data,error:scopeError}=await sb.rpc("get_my_workteams_customer_identity");
   if(!mounted.current||sequence!==requestSequence.current)return;
   if(scopeError||data?.ok!==true||!Array.isArray(data.locations)){
    if(data?.ok===false&&data?.error)throw new Error(String(data.error));
    throw new Error("Customer locations could not be verified. No information was displayed.");
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
   setError(err instanceof Error?err.message:"Customer access unavailable.");
  }finally{
   if(mounted.current&&sequence===requestSequence.current)setBusy(false);
  }
 }
 useEffect(()=>{
  mounted.current=true;
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
   window.location.assign("/customer-login");
  }catch(err){
   setBusy(false);
   setError(err instanceof Error?err.message:"Could not confirm sign out. Close this tab if using a shared device.");
  }
 }
 return <main className="site-shell" style={{maxWidth:720,margin:"0 auto"}}>
  <section className="panel" style={{padding:24}}>
   <p className="eyebrow">CUSTOMER PORTAL / PORTAL DE CLIENTES</p>
   <h1>{t("Your approved service locations","Sus ubicaciones autorizadas")}</h1>
   <label htmlFor="customer-portal-language">Language / Idioma</label>
   <select id="customer-portal-language" value={language}
    onChange={e=>setLanguage(e.target.value==="es"?"es":"en")}>
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
         "Location access only. Private documents, invoices, employee information and full contracts are not yet available from this customer account.",
         "Solo acceso a la ubicación. Los documentos privados, las facturas y los datos de empleados no están disponibles aquí."
       )}</p>
       <AuthenticatedCustomerQuality
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
