"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "../../lib/supabase";
import AuthenticatedCustomerRequests from "../../components/AuthenticatedCustomerRequests";

export default function AuthenticatedCustomerPortal(){
 const [language,setLanguage]=useState("en");
 const [busy,setBusy]=useState(true);
 const [loggedIn,setLoggedIn]=useState(false);
 const [locations,setLocations]=useState([]);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const t=(en,es)=>language==="es"?es:en;
 async function refresh(){
  setBusy(true);setError("");setLocations([]);setNotice("");
  try{
   const sb=supabase();
   const {data:userState,error:userError}=await sb.auth.getUser();
   if(userError||!userState?.user){
    setLoggedIn(false);return;
   }
   setLoggedIn(true);
   const {data:claimed,error:claimError}=await sb.rpc("claim_workteams_customer_identity");
   if(claimError)throw new Error("Could not verify customer account authorization. Please try again.");
   if(typeof claimed!=="number")throw new Error("Customer account claim returned an invalid response.");
   const {data,error:scopeError}=await sb.rpc("get_my_workteams_customer_identity");
   if(scopeError||data?.ok!==true||!Array.isArray(data.locations)){
    if(data?.ok===false&&data?.error)throw new Error(String(data.error));
    throw new Error("Customer locations could not be verified. No information was displayed.");
   }
   setLocations(data.locations);
   if(data.locations.length===0)setNotice(t(
    "No customer locations are available. A business owner must first approve your verified email and location and activate their customer portal. Existing service-location links continue to work separately.",
    "No hay ubicaciones disponibles. La empresa debe aprobar su correo y ubicación y activar su portal. Los enlaces de servicio existentes siguen funcionando aparte."
   ));
  }catch(err){setError(err.message||"Customer access unavailable.");setLocations([])}
  finally{setBusy(false)}
 }
 useEffect(()=>{void refresh()},[]);
 async function signOut(){
  setLocations([]);setLoggedIn(false);
  await supabase().auth.signOut();
  window.location.assign("/customer-login");
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
       <AuthenticatedCustomerRequests
         companyId={loc.company_id} locationId={loc.location_id}
         language={language}
         onAuthorizationLost={()=>{
           setLocations([]);setError(t(
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
