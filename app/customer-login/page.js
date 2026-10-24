"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "../../lib/supabase";

export default function CustomerLogin(){
 const [mode,setMode]=useState("signin");
 const [language,setLanguage]=useState("en");
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const t=(en,es)=>language==="es"?es:en;
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  if(params.get("mode")==="create")setMode("create");
  if(params.get("lang")==="es")setLanguage("es");
 },[]);
 async function submit(e){
  e.preventDefault();if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const clean=email.trim().toLowerCase();
   if(!clean||clean.length>254||!/^\S+@\S+\.\S+$/.test(clean))
    throw Error(t("Enter a valid email.","Ingrese un correo válido."));
   if(password.length<8)throw Error(t("Enter a password of at least 8 characters.",
    "Ingrese una contraseña de al menos 8 caracteres."));
   const client=supabase();
   if(mode==="create"){
    const {data,error:failure}=await client.auth.signUp({email:clean,password});
    if(failure)throw failure;
    if(data.session){
      window.location.assign("/customer-portal");
      return;
    }
    setNotice(t(
     "Check your email to confirm this account, then sign in. Access is available only after the business approves your contact and activates its customer pilot.",
     "Confirme su cuenta por correo y luego inicie sesión. El acceso requiere la autorización de la empresa y la activación del piloto."
    ));
   }else{
    const {error:failure}=await client.auth.signInWithPassword({email:clean,password});
    if(failure)throw failure;
    window.location.assign("/customer-portal");
   }
  }catch(err){setError(err.message||t("Sign-in failed.","No se pudo iniciar sesión."))}
  finally{setBusy(false)}
 }
 return <main className="site-shell" style={{maxWidth:580,margin:"0 auto"}}>
  <section className="panel" style={{padding:24}}>
   <p className="eyebrow">CUSTOMER ACCESS / ACCESO DE CLIENTES</p>
   <h1>{t("Verified Customer Portal","Portal de clientes verificados")}</h1>
   <label htmlFor="wt-customer-language">Language / Idioma</label>
   <select id="wt-customer-language" value={language}
    onChange={e=>setLanguage(e.target.value==="es"?"es":"en")}>
    <option value="en">English</option><option value="es">Español</option>
   </select>
   <p>{t(
    "This is separate from WorkTeams employee access and from the service-location links. An account alone grants no company access; your business must approve your email and assigned location, then activate customer login.",
    "Este portal es independiente del acceso de empleados y de los enlaces de ubicación. Una cuenta no concede acceso: la empresa debe aprobar su correo y ubicación y activar el acceso de clientes."
   )}</p>
   <div style={{display:"flex",gap:12,margin:"16px 0",flexWrap:"wrap"}}>
    <button type="button" aria-pressed={mode==="signin"} onClick={()=>{setMode("signin");setError("");setNotice("")}}>
     {t("Sign in","Iniciar sesión")}
    </button>
    <button type="button" aria-pressed={mode==="create"} onClick={()=>{setMode("create");setError("");setNotice("")}}>
     {t("Create an account","Crear cuenta")}
    </button>
   </div>
   <form onSubmit={submit} style={{display:"grid",gap:10}}>
    <label htmlFor="wt-customer-email">{t("Approved customer email","Correo autorizado")}</label>
    <input id="wt-customer-email" type="email" required maxLength={254}
     autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/>
    <label htmlFor="wt-customer-password">{t("Your password","Su contraseña")}</label>
    <input id="wt-customer-password" type="password" required minLength={8}
     autoComplete={mode==="create"?"new-password":"current-password"}
     value={password} onChange={e=>setPassword(e.target.value)}/>
    <button type="submit" disabled={busy}>
     {busy?t("Checking…","Verificando…"):
       mode==="create"?t("Create account","Crear cuenta"):t("Sign in","Entrar")}
    </button>
   </form>
   {error&&<p role="alert" style={{color:"#b3261e"}}>{error}</p>}
   {notice&&<p role="status">{notice}</p>}
   <p><Link href="/forgot-password">{t("Forgot password?","¿Olvidó su contraseña?")}</Link></p>
   <p><Link href="/portal">{t("Use your existing location link instead","Utilice su enlace de ubicación existente")}</Link></p>
  </section>
 </main>;
}
