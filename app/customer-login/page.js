"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "../../lib/supabase";

export default function CustomerLogin(){
 const [mode,setMode]=useState("signin");
 const [language,setLanguage]=useState("en");
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");const [showPassword,setShowPassword]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const t=(en,es)=>language==="es"?es:en;
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  if(params.get("mode")==="create")setMode("create");
  const supplied=params.get("lang");
  let preferred="en";
  try{
   const saved=window.localStorage.getItem("workteams-customer-portal-language");
   preferred=supplied==="es"?"es":supplied==="en"?"en":
    saved==="es"?"es":saved==="en"?"en":
    navigator.language.toLowerCase().startsWith("es")?"es":"en";
   window.localStorage.setItem("workteams-customer-portal-language",preferred);
  }catch{preferred=supplied==="es"?"es":"en"}
  setLanguage(preferred);
  if(params.get("verified")==="1")setNotice(
   preferred==="es"?
   "Si confirmó su correo electrónico, inicie sesión para comprobar su acceso autorizado.":
   "If you confirmed your email address, sign in to check your approved customer access."
  );
  if(params.get("reset")==="1")setNotice(
   preferred==="es"?
   "Inicie sesión con su contraseña actualizada.":
   "Sign in using your updated password."
  );
 },[]);
 function chooseLanguage(next){
  const lang=next==="es"?"es":"en";
  setLanguage(lang);
  try{window.localStorage.setItem("workteams-customer-portal-language",lang)}catch{}
  const url=new URL(window.location.href);
  url.searchParams.set("lang",lang);
  window.history.replaceState({},"",url.toString());
 }
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
    const confirmUrl=new URL("/customer-login",window.location.origin);
    confirmUrl.searchParams.set("verified","1");
    confirmUrl.searchParams.set("lang",language);
    const {data,error:failure}=await client.auth.signUp({
      email:clean,password,options:{emailRedirectTo:confirmUrl.toString()}
    });
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
  }catch(err){
   setError(t(
    mode==="create"?"Could not create the account. Check the email or try again.":"Sign-in failed. Check your email and password.",
    mode==="create"?"No se pudo crear la cuenta. Revise el correo e inténtelo de nuevo.":"No se pudo iniciar sesión. Revise el correo y la contraseña."
   ));
  }
  finally{setBusy(false)}
 }
 return <main className="site-shell" style={{maxWidth:580,margin:"0 auto"}}>
  <section className="panel" style={{padding:24}}>
   <p className="eyebrow">CUSTOMER ACCESS / ACCESO DE CLIENTES</p>
   <h1>{t("Verified Customer Portal","Portal de clientes verificados")}</h1>
   <label htmlFor="wt-customer-language">Language / Idioma</label>
   <select id="wt-customer-language" value={language}
    onChange={e=>chooseLanguage(e.target.value)}>
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
    <div style={{position:"relative"}}>
     <input id="wt-customer-password" type={showPassword?"text":"password"} required minLength={8}
      autoComplete={mode==="create"?"new-password":"current-password"}
      style={{paddingRight:44,width:"100%",boxSizing:"border-box"}}
      value={password} onChange={e=>setPassword(e.target.value)}/>
     <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? t("Hide password","Ocultar contraseña") : t("Show password","Mostrar contraseña")} title={showPassword ? t("Hide password","Ocultar contraseña") : t("Show password","Mostrar contraseña")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 6, cursor: "pointer", color: "#666", display: "flex", alignItems: "center", justifyContent: "center" }}>
       {showPassword ? (
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
       ) : (
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5 7 10 7 10-7 10-7-3.5-7-10-7-10 7-10 7Z"/><circle cx="12" cy="12" r="3"/></svg>
       )}
     </button>
    </div>
    {mode==="create"&&<p className="small" style={{margin:0}}>{t(
     "Choose a password of at least 8 characters. You will use it only for this customer portal.",
     "Elija una contraseña de al menos 8 caracteres. La usará solo para este portal de clientes."
    )}</p>}
    <button type="submit" disabled={busy}>
     {busy?t("Checking…","Verificando…"):
       mode==="create"?t("Create account","Crear cuenta"):t("Sign in","Entrar")}
    </button>
   </form>
   {error&&<p role="alert" style={{color:"#b3261e"}}>{error}</p>}
   {notice&&<p role="status">{notice}</p>}
   <p><Link href={`/forgot-password?source=customer&lang=${language}`}>
    {t("Forgot password?","¿Olvidó su contraseña?")}</Link></p>
   <p><Link href="/">{t("Use your existing location link instead","Utilice su enlace de ubicación existente")}</Link></p>
   <div style={{borderTop:"1px solid rgba(127,127,127,0.35)",marginTop:16,paddingTop:12}}>
    <h2 style={{fontSize:18}}>{t("How customer access works","Cómo funciona el acceso de clientes")}</h2>
    <ol style={{margin:"8px 0",paddingLeft:20,display:"grid",gap:6}}>
     <li>{t(
      "Create your account here with the email your business has on file for you.",
      "Cree su cuenta aquí con el correo que la empresa tiene registrado para usted."
     )}</li>
     <li>{t(
      "Confirm your email address from the message we send you.",
      "Confirme su correo desde el mensaje que le enviamos."
     )}</li>
     <li>{t(
      "The business approves your email and your service location, and turns on customer login. Until then, signing in shows no company information — that is expected, not an error.",
      "La empresa aprueba su correo y su ubicación de servicio y activa el acceso de clientes. Hasta entonces, al iniciar sesión no verá información de la empresa: es lo esperado, no un error."
     )}</li>
     <li>{t(
      "Sign in here to open your customer portal. Employee access is a different sign-in and a different password rule.",
      "Inicie sesión aquí para abrir su portal de clientes. El acceso de empleados usa otro inicio de sesión y otra regla de contraseña."
     )}</li>
    </ol>
    <p className="small">{t(
     "No account? Your business may have given you a service-location link instead — use the link above; it needs no password.",
     "¿Sin cuenta? Es posible que la empresa le haya dado un enlace de ubicación de servicio: use el enlace anterior; no necesita contraseña."
    )}</p>
   </div>
  </section>
 </main>;
}
