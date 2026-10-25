"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUseWithRole } from "../../../../lib/tiers";
import ClientIdentityContactManager from "../../../../components/ClientIdentityContactManager";
import CustomerDocumentManager from "../../../../components/CustomerDocumentManager";
import PublishedServiceScheduleManager from "../../../../components/PublishedServiceScheduleManager";
import {CUSTOMER_INBOX_FILTERS,filterCustomerInbox,summarizeCustomerInbox} from "../../../../lib/customer-inbox-dashboard.mjs";

export default function ClientPortalPage() {
  const { company, member, loading } = useCompany();
  const [locations, setLocations] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [invitationLanguage,setInvitationLanguage]=useState("en");
  const [managerLanguage,setManagerLanguage]=useState("en");
  const tr=(english,spanish)=>managerLanguage==="es"?spanish:english;
  useEffect(()=>{
    try{
      const saved=window.localStorage.getItem("workteams-client-portal-manager-language");
      setManagerLanguage(saved==="es"||(!saved&&navigator.language.toLowerCase().startsWith("es"))?"es":"en");
    }catch{setManagerLanguage(navigator.language.toLowerCase().startsWith("es")?"es":"en");}
  },[]);
  const chooseManagerLanguage=(language)=>{
    const choice=language==="es"?"es":"en";setManagerLanguage(choice);
    try{window.localStorage.setItem("workteams-client-portal-manager-language",choice);}catch{}
  };
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [responseDrafts,setResponseDrafts]=useState({});
  const [statusDrafts,setStatusDrafts]=useState({});
  const [deliveryConfirmed,setDeliveryConfirmed]=useState({});
  const [responseError,setResponseError]=useState("");
  const [responseNotice,setResponseNotice]=useState("");
  const responseInFlight=useRef(false);
  // Two-way conversation (migration 065): append-only thread per request,
  // posted through RPCs; the legacy single response stays as a fallback.
  const [threads,setThreads]=useState({});
  const [threadDrafts,setThreadDrafts]=useState({});
  const [threadBusyId,setThreadBusyId]=useState(null);
  const [threadNotice,setThreadNotice]=useState("");
  const threadInFlight=useRef(false);
  // Deep link from a customer alert or the owner email: ?message=<request id>
  // opens this inbox on that exact request's conversation.
  const [deepLinkId]=useState(()=>{
    if(typeof window==="undefined")return null;
    const value=new URLSearchParams(window.location.search).get("message");
    return value&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:null;
  });
  const [highlightId,setHighlightId]=useState(null);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "portal", member?.role);

  const [messages, setMessages] = useState([]);
  const [inboxFilter,setInboxFilter]=useState(deepLinkId?"all":"attention");
  const [inboxError,setInboxError]=useState("");
  const [inboxCheckedAt,setInboxCheckedAt]=useState(null);
  const liveInboxCompany=useRef(company?.id);
  liveInboxCompany.current=company?.id;
  const inboxStats=summarizeCustomerInbox(messages);
  const visibleInbox=filterCustomerInbox(messages,inboxFilter);
  const [pilotRequested,setPilotRequested]=useState(null);
  const [pilotEnabled,setPilotEnabled]=useState(null);
  const [pilotCanActivate,setPilotCanActivate]=useState(false);
  const [pilotBusy,setPilotBusy]=useState(false);
  const [pilotError,setPilotError]=useState("");
  const [pilotNotice,setPilotNotice]=useState("");
  const livePilotCompany=useRef(company?.id);
  livePilotCompany.current=company?.id;

  async function loadPilot(){
    const companyId=company?.id;
    if(!companyId||!isManager)return;
    setPilotError("");
    const {data,error}=await supabase().rpc("get_workteams_client_portal_pilot_status",{
      p_company_id:companyId
    });
    if(livePilotCompany.current!==companyId)return;
    if(error||data?.ok!==true||typeof data.pilot_requested!=="boolean"||
      typeof data.customer_login_enabled!=="boolean"||
      typeof data.can_activate!=="boolean"){
      setPilotRequested(null);setPilotEnabled(null);setPilotCanActivate(false);
      setPilotError(tr("Authenticated customer pilot status could not be confirmed. Refresh before making changes.","No se pudo verificar la prueba autenticada. Actualice antes de cambiar nada."));
      return;
    }
    setPilotRequested(data.pilot_requested);
    setPilotEnabled(data.customer_login_enabled);
    setPilotCanActivate(data.can_activate);
  }
  async function updatePilot(requested){
    const companyId=company?.id;
    if(!companyId||!isManager||pilotBusy||pilotRequested===null||pilotEnabled===null||
       (!requested&&pilotEnabled))return;
    const question=requested?
      tr("Request the authenticated customer portal pilot for this company? This does not activate logins or share records.","¿Solicitar la prueba de portal autenticado para esta empresa? No activa accesos ni comparte datos."):
      tr("Withdraw this company from the authenticated customer portal pilot?","¿Retirar esta empresa de la prueba del portal autenticado?");
    if(!window.confirm(question))return;
    setPilotBusy(true);setPilotError("");setPilotNotice("");
    try{
      const {data,error}=await supabase().rpc("set_workteams_client_portal_pilot_request",{
        p_company_id:companyId,p_requested:requested
      });
      if(livePilotCompany.current!==companyId)return;
      if(error||data?.ok!==true||data.pilot_requested!==requested||
        typeof data.customer_login_enabled!=="boolean")
        throw new Error(error?.message||tr("The pilot preference could not be verified.","No se pudo verificar la preferencia de la prueba."));
      setPilotRequested(requested);
      setPilotEnabled(data.customer_login_enabled);
      setPilotNotice(requested?
        tr("Pilot request saved. Login is only activated with a separate owner confirmation.","Solicitud guardada. El acceso requiere una confirmación aparte del propietario."):
        tr("Pilot request withdrawn. Existing location links and customer data are unchanged.","Prueba retirada. Los enlaces y los datos existentes no se modificaron."));
    }catch(err){
      if(livePilotCompany.current===companyId){
        setPilotRequested(null);
        setPilotError(err instanceof Error?err.message:tr("Pilot request status is unknown. Please refresh.","No se conoce el estado de la prueba. Actualice la página."));
      }
    }finally{setPilotBusy(false)}
  }

  async function changeCustomerLogin(nextEnabled){
    const companyId=company?.id;
    if(!companyId||!pilotCanActivate||!pilotRequested||pilotBusy||
       pilotEnabled===null||pilotEnabled===nextEnabled)return;
    const phrase=nextEnabled?"ACTIVATE":"DISABLE";
    const typed=window.prompt(nextEnabled?
      tr("Customer logins will be available only to previously approved verified emails and locations. No private files, contracts or billing are released. Type ACTIVATE to enable this company's customer location list.","Solo accederán correos verificados y ubicaciones autorizadas. No se compartirán archivos privados, contratos ni facturación. Escriba ACTIVATE para activar la lista."):
      tr("All existing customer account sessions will immediately lose location access. Type DISABLE to switch off customer logins.","Todas las sesiones perderán acceso inmediatamente. Escriba DISABLE para desactivar."), "");
    if(typed!==phrase)return;
    setPilotBusy(true);setPilotError("");setPilotNotice("");
    try{
      const {data,error}=await supabase().rpc("set_workteams_customer_login_activation",{
        p_company_id:companyId,p_enabled:nextEnabled,p_confirmation:typed
      });
      if(livePilotCompany.current!==companyId)return;
      if(error||data?.ok!==true||data.customer_login_enabled!==nextEnabled)
        throw new Error(error?.message||tr("Could not verify customer login activation.","No se pudo verificar la activación del acceso."));
      setPilotEnabled(nextEnabled);
      setPilotNotice(nextEnabled?
        tr("Verified customer login activated for this company. Only approved contacts and locations can be listed. Private records remain unavailable.","Acceso verificado activado. Solo se muestran contactos y ubicaciones autorizados. Los registros privados siguen inaccesibles."):
        tr("Customer login disabled immediately for this company. Previously shared location links remain unchanged.","Acceso desactivado inmediatamente. Los enlaces previamente compartidos no han cambiado."));
    }catch(err){
      if(livePilotCompany.current===companyId){
        setPilotEnabled(null);setPilotError(err instanceof Error?err.message:
          tr("Activation result is unknown. Refresh before making any other changes.","Resultado de activación desconocido. Actualice antes de continuar."));
      }
    }finally{setPilotBusy(false)}
  }

  // Conversation threads are additive: if the replies table is unavailable
  // (migration 065 not run yet) the inbox keeps working with the legacy
  // single response, so a failed thread read is swallowed on purpose.
  async function loadThreads(ids){
    const unique=[...new Set((ids||[]).filter(Boolean))];
    if(!unique.length)return;
    const {data,error}=await supabase().from("portal_message_replies")
      .select("id,portal_message_id,sender_role,sender_name,body,created_at")
      .in("portal_message_id",unique)
      .order("created_at",{ascending:true});
    if(error)return;
    const grouped={};
    for(const row of data||[])(grouped[row.portal_message_id]??=[]).push(row);
    setThreads(previous=>{
      const next={...previous};
      for(const id of unique)next[id]=grouped[id]||[];
      return next;
    });
  }

  // What the conversation shows: the append-only thread, with the legacy
  // saved response standing in as the business reply until a thread reply
  // supersedes it (business replies are mirrored back into that field).
  function threadEntries(m){
    const thread=threads[m.id]||[];
    const hasBusiness=thread.some(r=>r.sender_role==="business");
    if(!hasBusiness&&m.customer_response){
      return [{id:"legacy-"+m.id,sender_role:"business",sender_name:null,
        body:m.customer_response,
        created_at:m.customer_responded_at||m.created_at},...thread];
    }
    return thread;
  }

  async function load() {
    const companyId=company?.id;
    if(!companyId||!isManager||!allowed)return;
    setLoadError("");setInboxError("");
    const sb = supabase();
    const { data: locs, error: locError } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    if(locError){setLoadError(tr("Could not confirm service locations. Try refreshing.","No se pudieron verificar las ubicaciones de servicio. Actualice."));return}
    setLocations(locs || []);
    const { data: toks, error: tokenError } = await sb
      .from("portal_tokens")
      .select("id, location_id, token, client_name, expires_at, created_at")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    if(tokenError){setLoadError(tr("Could not confirm active client links. Try refreshing.","No se pudieron verificar los enlaces activos. Actualice."));setTokens([]);return}
    setTokens(toks || []);
    const { data: msgs, error: messageError } = await sb
      .from("portal_messages")
      .select("*, locations(name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if(liveInboxCompany.current!==companyId)return;
    if(messageError){
      setInboxError(tr("Client messages are temporarily unavailable. This does not mean there are no messages. Refresh to retry.","Los mensajes no están disponibles. Eso no significa que no existan. Actualice."));
      setMessages([]);setInboxCheckedAt(null);return;
    }
    setInboxError("");setInboxCheckedAt(new Date());
    let allMsgs=msgs || [];
    // A deep-linked request may be older than the recent-50 window; fetch it
    // directly so the alert/email link always lands on its conversation.
    if(deepLinkId&&!allMsgs.some(m=>m.id===deepLinkId)){
      const {data:linked}=await sb.from("portal_messages")
        .select("*, locations(name)")
        .eq("company_id",company.id).eq("id",deepLinkId).maybeSingle();
      if(liveInboxCompany.current!==companyId)return;
      if(linked)allMsgs=[linked,...allMsgs];
    }
    setMessages(allMsgs);
    void loadThreads(allMsgs.map(m=>m.id));
    setResponseDrafts(previous=>{
      const next={...previous};
      for(const m of allMsgs)if(next[m.id]===undefined)next[m.id]=m.customer_response||"";
      return next;
    });
    setStatusDrafts(previous=>{
      const next={...previous};
      for(const m of allMsgs)if(next[m.id]===undefined)next[m.id]=m.customer_status||"received";
      return next;
    });
  }

  useEffect(() => {
    setMessages([]);setInboxError("");setInboxCheckedAt(null);setInboxFilter(deepLinkId?"all":"attention");
    setResponseDrafts({});setStatusDrafts({});setDeliveryConfirmed({});
    if (!loading && company && allowed && isManager){
      void load();
      setPilotRequested(null);setPilotEnabled(null);setPilotCanActivate(false);setPilotNotice("");
      void loadPilot();
    }else{setPilotRequested(null);setPilotEnabled(null);setPilotCanActivate(false);}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  // Refresh only this company's inbox while the manager is viewing the tab.
  // Never overwrite a draft response or perform a background write.
  useEffect(()=>{
    if(loading||!company?.id||!allowed||!isManager)return;
    const companyId=company.id;
    let alive=true;
    let inFlight=false;
    async function pollInbox(){
      if(!alive||inFlight||document.visibilityState!=="visible"||
         responseInFlight.current||working)return;
      inFlight=true;
      try{
        const {data,error}=await supabase().from("portal_messages")
          .select("*, locations(name)")
          .eq("company_id",companyId)
          .order("created_at",{ascending:false})
          .limit(50);
        if(!alive||liveInboxCompany.current!==companyId)return;
        if(error){
          // Authorization may have changed; fail closed, do not display stale data.
          setMessages([]);
          setInboxError(tr("Customer request refresh failed. Check your access or retry.","Falló la actualización de solicitudes. Verifique su acceso y reintente."));
          setInboxCheckedAt(null);
          return;
        }
        setInboxError("");setInboxCheckedAt(new Date());
        setMessages(data||[]);
        void loadThreads((data||[]).map(m=>m.id));
        setResponseDrafts(previous=>{
          const next={...previous};
          for(const m of data||[])if(next[m.id]===undefined)
            next[m.id]=m.customer_response||"";
          return next;
        });
        setStatusDrafts(previous=>{
          const next={...previous};
          for(const m of data||[])if(next[m.id]===undefined)
            next[m.id]=m.customer_status||"received";
          return next;
        });
      }catch{
        if(alive&&liveInboxCompany.current===companyId){
          setMessages([]);setInboxCheckedAt(null);
          setInboxError(tr("Customer request refresh is unavailable. Check your connection and retry.","No se pueden actualizar las solicitudes. Verifique la conexión."));
        }
      }finally{inFlight=false}
    }
    const timer=setInterval(()=>{void pollInbox()},30000);
    function onVisibility(){if(document.visibilityState==="visible")void pollInbox()}
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{alive=false;clearInterval(timer);
      document.removeEventListener("visibilitychange",onVisibility)};
  },[loading,company?.id,allowed,isManager,working]);

  // 256-bit token from the platform CSPRNG. No Math.random() fallback:
  // if secure randomness is unavailable the link is not generated.
  function makeToken() {
    if (typeof crypto === "undefined" || !crypto.getRandomValues) {
      throw new Error(tr("Secure random generation is not available in this browser.","Este navegador no puede generar enlaces privados seguros."));
    }
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function generate(locationId, locationName) {
    setWorking(true);
    try {
      const token = makeToken();
      // Link lives for the contract when one exists: tied to the signed
      // contract's end date (or long-lived for open-ended contracts).
      // Otherwise the previous 90-day default applies.
      const sb = supabase();
      const { data: contract } = await sb
        .from("contracts")
        .select("end_date")
        .eq("company_id", company.id)
        .eq("location_id", locationId)
        .eq("status", "signed")
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let expiresAt;
      if (contract?.end_date) {
        expiresAt = new Date(contract.end_date + "T23:59:59").toISOString();
      } else if (contract) {
        expiresAt = new Date(Date.now() + 5 * 365 * 24 * 3600 * 1000).toISOString();
      } else {
        expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
      }
      const { error } = await sb.from("portal_tokens").insert({
        company_id: company.id,
        location_id: locationId,
        token,
        client_name: locationName,
        expires_at: expiresAt,
      });
      if (error) throw error;
      load();
    } catch (err) {
      alert(tr("Could not generate link: ","No se pudo generar el enlace: ") + err.message);
    }
    setWorking(false);
  }

  // Rotate: revoke the old token and mint a fresh one (new expiry).
  async function regenerate(t) {
    if (!confirm(tr("Generate a new link? The old link will stop working immediately.","¿Crear un enlace nuevo? El anterior dejará de funcionar de inmediato."))) return;
    setWorking(true);
    try {
      const token = makeToken();
      const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
      const { error } = await supabase()
        .from("portal_tokens")
        .update({ token, expires_at: expiresAt })
        .eq("id", t.id);
      if (error) throw error;
      load();
    } catch (err) {
      alert(tr("Could not regenerate link: ","No se pudo renovar el enlace: ") + err.message);
    }
    setWorking(false);
  }

  async function revoke(id) {
    if(working || !confirm(tr("Revoke this client link? It will stop working immediately.","¿Revocar este enlace? Dejará de funcionar de inmediato."))) return;
    setWorking(true);
    try {
      const { error } = await supabase().from("portal_tokens").delete().eq("id", id).eq("company_id", company.id);
      if (error) throw error;
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : tr("The client link could not be revoked.","No se pudo revocar el enlace del cliente."));
    } finally {
      setWorking(false);
    }
  }

  async function copyLink(link,format="url") {
    if(working||!isManager||!allowed||!company?.id||!link||
      !tokens.some(row=>row.id===link.id&&row.token===link.token)||
      (!!link.expires_at&&new Date(link.expires_at).getTime()<=Date.now())){
      setLoadError(tr("Link is expired or no longer verified. Refresh or rotate it before sharing.","El enlace caducó o dejó de verificarse. Actualice o cambie antes de compartir."));
      return;
    }
    // Check the live company-scoped record before copying a bearer credential.
    const checked=await supabase().from("portal_tokens")
      .select("id,token,location_id,expires_at")
      .eq("company_id",company.id).eq("id",link.id).maybeSingle();
    if(checked.error||!checked.data||checked.data.token!==link.token||
       checked.data.location_id!==link.location_id||
       (!!checked.data.expires_at&&new Date(checked.data.expires_at).getTime()<=Date.now())){
      setLoadError(tr("The link was revoked, rotated or expired. Refresh the portal links before sharing.","El enlace fue revocado, cambiado o caducó. Actualice antes de compartir."));
      return;
    }
    const url=`${window.location.origin}/portal/${checked.data.token}`;
    const name=locations.find(l=>l.id===link.location_id)?.name||(
      invitationLanguage==="es"?"su ubicación":"your location");
    const payload=format==="invitation"?(invitationLanguage==="es"?
      `Hola, este es el enlace privado del portal de servicio de ${name}: ${url}\nEl enlace permite ver información de servicio de esa ubicación. No lo reenvíe. Solicite un enlace nuevo si deja de funcionar.`:
      `Hello, here is the private service portal link for ${name}: ${url}\nThis link shows service information for this location. Please do not forward it. Ask the business for a new link if it stops working.`):url;
    try{
      await navigator.clipboard.writeText(payload);
      alert(format==="invitation"?tr("Invitation message copied. Share it only with an authorized customer contact.","Invitación copiada. Compártala solo con un contacto autorizado."):tr("Link copied. Share it only with an authorized customer contact.","Enlace copiado. Compártalo solo con un contacto autorizado."));
    }catch{
      window.prompt(format==="invitation"?tr("Copy this customer invitation:","Copie esta invitación para el cliente:"):tr("Copy this private location link:","Copie este enlace privado de ubicación:"),payload);
    }
  }

  async function markRead(id) {
    if(working||responseInFlight.current)return;
    const {error}=await supabase().from("portal_messages")
      .update({read_at:new Date().toISOString()}).eq("id",id).eq("company_id",company.id);
    if(error)setResponseError(tr("Could not confirm that message was marked read.","No se pudo confirmar que se marcó el mensaje como leído."));
    else await load();
  }

  async function saveCustomerResponse(message){
    if(responseInFlight.current||working||!isManager||!company?.id)return;
    const status=statusDrafts[message.id]||message.customer_status||"received";
    const reply=String(responseDrafts[message.id]??message.customer_response??"").trim();
    if(!["received","in_progress","resolved"].includes(status)){
      setResponseError(tr("Choose a valid customer request status.","Seleccione un estado válido de solicitud."));return;
    }
    if(message.category==="document_copy"&&status==="resolved"&&
       (!deliveryConfirmed[message.id]||!reply)){
      setResponseError(tr("Verify the recipient and deliver the document privately before marking a contract copy request resolved. Add a customer-safe confirmation message.","Verifique al destinatario y entregue el documento en privado antes de resolver la solicitud. Añada una confirmación segura."));return;
    }
    if(message.category==="document_copy"&&(
       reply.toLowerCase().includes("://")||
       reply.toLowerCase().includes("www.")||
       /[.]pdf|[.]docx?|[.]zip/i.test(reply))){
      setResponseError(tr("Do not paste document links, file paths or attachments into a customer-visible reply.","No pegue enlaces a documentos, rutas ni adjuntos en la respuesta al cliente."));return;
    }
    if(reply&& (reply.length<10||reply.length>1200)){
      setResponseError(tr("Write a customer-safe response of 10–1200 characters, or leave it blank.","Escriba una respuesta segura de 10 a 1200 caracteres o déjela vacía."));return;
    }
    if(!window.confirm(message.customer_contact_id?
      tr("Save this status and response for the verified customer who submitted this request? Never include private staff information, unrelated locations or sensitive details.","¿Guardar para el cliente verificado? No incluya información privada de personal, otras ubicaciones ni datos sensibles."):
      tr("Save this status and response for anyone holding this location's secure customer link? Do not include private staff information or sensitive details.","¿Guardar para quienes tengan el enlace privado de esta ubicación? No incluya datos del personal ni información sensible.")))return;
    responseInFlight.current=true;setWorking(true);setResponseError("");setResponseNotice("");
    try{
      const saved=await supabase().from("portal_messages").update({
        customer_status:status,customer_response:reply||null,
        customer_responded_at:reply?new Date().toISOString():null
      }).eq("id",message.id).eq("company_id",company.id)
      .select("id,customer_status,customer_response,customer_responded_at").single();
      if(saved.error||!saved.data||saved.data.customer_status!==status||
        (saved.data.customer_response||"")!==reply)
        throw new Error(saved.error?.message||tr("The customer response could not be verified.","No se pudo verificar la respuesta al cliente."));
      await load();
      if(message.category==="document_copy")setDeliveryConfirmed(p=>({...p,[message.id]:false}));
      setResponseNotice(message.customer_contact_id?
        tr("Response saved. Only this verified contact can view the authenticated request history.","Respuesta guardada. Solo este contacto verificado puede consultar el historial autenticado."):
        tr("Customer-safe status and response saved. The exact location link can now show the update.","Estado y respuesta guardados. El enlace de esta ubicación ya puede mostrar la actualización."));
    }catch(error){
      setResponseError(error instanceof Error?error.message:tr("Customer response status unknown. Check history before resending.","Estado de respuesta desconocido. Revise el historial antes de reenviar."));
    }finally{
      responseInFlight.current=false;setWorking(false);
    }
  }

  // Append a business reply to the conversation (migration 065). Unlike the
  // legacy response below, a thread reply never overwrites earlier replies,
  // and the customer can reply back from their portal.
  async function sendThreadReply(message){
    if(threadInFlight.current||working||!isManager||!company?.id)return;
    const reply=String(threadDrafts[message.id]??"").trim();
    if(reply.length<10||reply.length>1200){
      setResponseError(tr("Write a customer-safe reply of 10–1200 characters.","Escriba una respuesta segura de 10 a 1200 caracteres."));return;
    }
    if(message.category==="document_copy"&&(
       reply.toLowerCase().includes("://")||
       reply.toLowerCase().includes("www.")||
       /[.]pdf|[.]docx?|[.]zip/i.test(reply))){
      setResponseError(tr("Do not paste document links, file paths or attachments into a customer-visible reply.","No pegue enlaces a documentos, rutas ni adjuntos en la respuesta al cliente."));return;
    }
    if(!window.confirm(message.customer_contact_id?
      tr("Send this reply to the verified customer who submitted this request? Never include private staff information, unrelated locations or sensitive details.","¿Enviar esta respuesta al cliente verificado que envió esta solicitud? No incluya información privada de personal, otras ubicaciones ni datos sensibles."):
      tr("Send this reply to anyone holding this location's secure customer link? Do not include private staff information or sensitive details.","¿Enviar esta respuesta a quienes tengan el enlace privado de esta ubicación? No incluya datos del personal ni información sensible.")))return;
    threadInFlight.current=true;setThreadBusyId(message.id);setResponseError("");setThreadNotice("");
    try{
      const {data,error}=await supabase().rpc("post_portal_message_business_reply",{
        p_message_id:message.id,p_body:reply
      });
      if(error||data?.ok!==true||!data.reply_id)
        throw new Error(error?.message||tr("The reply could not be verified.","No se pudo verificar la respuesta."));
      setThreadDrafts(p=>({...p,[message.id]:""}));
      await loadThreads([message.id]);
      await load();
      setThreadNotice(tr("Reply sent. The customer can read it and reply back from their portal.","Respuesta enviada. El cliente puede leerla y responder desde su portal."));
    }catch(error){
      setResponseError(error instanceof Error?error.message:tr("Reply status unknown. Check the conversation before resending.","Estado de la respuesta desconocido. Revise la conversación antes de reenviar."));
    }finally{
      threadInFlight.current=false;setThreadBusyId(null);
    }
  }

  // Deep link: once the inbox has loaded, bring the linked request's
  // conversation into view and highlight it.
  useEffect(()=>{
    if(!deepLinkId||!messages.length)return;
    const el=document.getElementById(`portal-message-${deepLinkId}`);
    if(el){el.scrollIntoView({block:"center"});setHighlightId(deepLinkId);}
  },[deepLinkId,messages]);

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed || !isManager) {
    const roleBlocked = allowed && !isManager;
    return (
      <div>
        <p className="eyebrow">{tr("CLIENT PORTAL","PORTAL DEL CLIENTE")}</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 {tr("Client portal","Portal del cliente")}</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          {roleBlocked ? (
            <p>{tr("The client portal is for owners and managers.","El portal es solo para propietarios y gerentes.")}</p>
          ) : (
            <>
              <p>{tr("The client portal is a","El portal del cliente es una función")} <strong>Pro</strong>.</p>
              <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
                {tr("See plans","Ver planes")} →
              </Link>
            </>
          )}
        </section>
      </div>
    );
  }

  const tokenByLocation = {};
  for (const t of tokens) if(!tokenByLocation[t.location_id]) tokenByLocation[t.location_id] = t;
  const now = Date.now();
  const linkExpired = (t) => !!t?.expires_at && new Date(t.expires_at).getTime() <= now;
  const activeLinks = locations.filter(l => tokenByLocation[l.id] && !linkExpired(tokenByLocation[l.id])).length;
  const expiredLinks = locations.filter(l => tokenByLocation[l.id] && linkExpired(tokenByLocation[l.id])).length;
  const missingLinks = locations.filter(l => !tokenByLocation[l.id]).length;
  const unreadMessages = messages.filter(m => !m.read_at).length;

  return (
    <div>
      <p className="eyebrow">{tr("CLIENT PORTAL","PORTAL DEL CLIENTE")}</p>
      <h2 style={{ fontSize: "1.8rem" }}>{tr("Client messages","Mensajes de clientes")}</h2>
      <div className="panel" style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <label htmlFor="client-portal-management-language">{tr("Management language","Idioma de administración")}</label>
        <select id="client-portal-management-language" value={managerLanguage}
          onChange={e=>chooseManagerLanguage(e.target.value)}>
          <option value="en">English</option><option value="es">Español</option>
        </select>
      </div>
      <nav className="panel" aria-label="Client Portal management quick access" style={{padding:16,margin:"16px 0"}}>
        <strong>{tr("Quick access","Acceso rápido")}</strong>
        <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:8}}>
          <a href="#portal-management-messages">{tr("Client messages","Mensajes de clientes")}</a>
          <a href="#portal-management-links">{tr("Location links","Enlaces de ubicaciones")}</a>
        </div>
        <p style={{fontSize:"0.85rem",marginBottom:0}}>{tr("Unread messages","Mensajes sin leer")}: {loadError?tr("Unavailable","No disponible"):unreadMessages} · {tr("Active links","Enlaces activos")}: {activeLinks} · {tr("Expired","Caducados")}: {expiredLinks} · {tr("Not generated","Sin generar")}: {missingLinks}</p>
      </nav>
      {loadError&&<section className="panel" role="alert" style={{padding:16,border:"1px solid #b3261e",margin:"12px 0"}}>
        <strong>{tr("Portal status incomplete","Estado del portal incompleto")}</strong><p>{loadError}</p><button type="button" disabled={working} style={button} onClick={() => void load()}>{tr("Retry portal status","Volver a comprobar el portal")}</button>
      </section>}
      <section className="panel" id="portal-identity-pilot"
        style={{padding:22,margin:"18px 0",border:"1px solid var(--line)"}}>
        <h3 style={{marginTop:0}}>{tr("Authenticated Customer Portal pilot","Prueba del portal autenticado")}</h3>
        <p style={{fontSize:"0.9rem",color:"var(--muted)"}}>{tr("Private location links remain independent from verified customer accounts. Requesting a pilot does not create logins, invite customers, allow downloads, expose invoices or change existing link permissions.","Los enlaces privados de ubicación son independientes de las cuentas verificadas. Solicitar una prueba no crea accesos, invita clientes, permite descargas, expone facturas ni modifica permisos de enlaces.")}</p>
        <p role="status"><strong>{tr("Authenticated customer login","Acceso autenticado del cliente")}:
         {pilotEnabled===true?tr(" enabled"," activado"):pilotEnabled===false?
         tr(" disabled"," desactivado"):tr(" checking"," verificando")}</strong></p>
        {pilotError&&<p role="alert" style={{color:"#b3261e"}}>{pilotError}</p>}
        {pilotNotice&&<p role="status">{pilotNotice}</p>}
        {pilotRequested===null?
          <button type="button" style={button} disabled={pilotBusy}
            onClick={()=>void loadPilot()}>{tr("Recheck pilot status","Comprobar estado de la prueba")}</button>:
          <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:12}}>
            <span><strong>{pilotRequested?
              tr("Pilot requested","Prueba solicitada"):
              tr("Not requested","No solicitado")}</strong></span>
            <button type="button" style={button} disabled={pilotBusy||working||(pilotRequested&&pilotEnabled===true)}
              onClick={()=>void updatePilot(!pilotRequested)}>
              {pilotBusy?tr("Saving…","Guardando…"):pilotRequested?
                tr("Withdraw pilot request","Cancelar solicitud"):
                tr("Request pilot","Solicitar prueba")}
            </button>
          </div>}
        {pilotRequested===true&&pilotCanActivate&&pilotEnabled!==null&&
          <div style={{borderTop:"1px solid var(--line)",marginTop:16,paddingTop:12}}>
            <p style={{fontSize:"0.85rem"}}>{tr("Owner only. Activation permits approved verified accounts to see assigned location names. Private billing, contracts, documents, signatures and staff remain inaccessible.","Solo el propietario. La activación permite ver nombres de ubicaciones autorizadas. La facturación, contratos, documentos, firmas y datos del personal siguen inaccesibles.")}</p>
            <button type="button" disabled={pilotBusy||working}
              style={button} onClick={()=>void changeCustomerLogin(!pilotEnabled)}>
              {pilotEnabled?
                tr("Disable customer logins now","Desactivar accesos de clientes"):
                tr("Activate verified customer logins","Activar accesos verificados")}
            </button>
          </div>}
      </section>
      {pilotRequested===true&&<CustomerDocumentManager
        companyId={company?.id} locations={locations} pilotRequested={pilotRequested}/>}
      {pilotRequested===true&&<ClientIdentityContactManager
        companyId={company?.id} locations={locations}
        pilotRequested={pilotRequested} pilotEnabled={pilotEnabled}/>}
      {pilotRequested===true&&<PublishedServiceScheduleManager companyId={company?.id} language={managerLanguage}/>}
      <h3 id="portal-management-messages">{tr("Customer Service inbox & responses","Bandeja de Servicio al Cliente y respuestas")}</h3>
      <section aria-label="Customer service inbox overview"
        style={{border:"1px solid var(--line,#ccc)",borderRadius:10,padding:14,margin:"12px 0"}}>
        <p style={{fontSize:"0.85rem",margin:"0 0 8px"}}>{tr("Messages refresh every 30 seconds while this tab is visible. Counts reflect only the most recent 50 requests, not all-time totals.","Los mensajes se actualizan cada 30 segundos mientras la pestaña está visible. Los recuentos son solo de las últimas 50 solicitudes, no del historial completo.")}</p>
        {inboxCheckedAt&&<p style={{fontSize:"0.8rem",color:"var(--muted)"}}>
          {tr("Last verified","Última comprobación")}: {inboxCheckedAt.toLocaleTimeString(managerLanguage==="es"?"es-US":"en-US")}
        </p>}
        {inboxError&&<p role="alert" style={{color:"#b3261e"}}>{inboxError}</p>}
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
          <span><strong>{inboxStats.attention}</strong> {tr("need attention","requieren atención")}</span>
          <span><strong>{inboxStats.unread}</strong> {tr("unread","sin leer")}</span>
          <span><strong>{inboxStats.open}</strong> {tr("open","abiertas")}</span>
          <span><strong>{inboxStats.document_copy}</strong> {tr("open contract-copy requests","solicitudes abiertas de copia de contrato")}</span>
        </div>
        <label htmlFor="customer-inbox-filter" style={{display:"block",fontWeight:700,marginBottom:6}}>{tr("Show customer requests","Mostrar solicitudes")}</label>
        <select id="customer-inbox-filter" value={inboxFilter}
          onChange={e=>setInboxFilter(e.target.value)}
          style={{maxWidth:360,width:"100%",padding:10,borderRadius:8}}>
          {CUSTOMER_INBOX_FILTERS.map(f=><option key={f.id} value={f.id}>
            {managerLanguage==="es"?f.es:f.en}
          </option>)}
        </select>
        <p role="status" style={{fontSize:"0.85rem"}}>
          {tr("Showing","Mostrando")} {visibleInbox.length} {tr("matching requests out of","solicitudes coincidentes de")} {inboxStats.recent} {tr("recent.","recientes.")}
        </p>
      </section>
      {responseError&&<p role="alert" style={{color:"#b3261e"}}>{responseError}</p>}
      {responseNotice&&<p role="status">{responseNotice}</p>}
      {threadNotice&&<p role="status">{threadNotice}</p>}
      <p style={{fontSize:"0.85rem",color:"var(--muted)"}}>{tr("Location-link customers see only the request category, date, status and approved response. Never expose original messages, sender names, internal notes or employee details.","Los clientes con enlace de ubicación solo ven categoría, fecha, estado y respuesta aprobada. Nunca exponga mensajes originales, nombres, notas internas ni datos del personal.")}</p>
      <div style={{ display: "grid", gap: 10, margin: "18px 0 28px" }}>
        {!loadError&&!inboxError&&messages.length===0&&<p style={{color:"var(--muted)"}}>{tr("No recent client requests.","No hay solicitudes recientes.")}</p>}
        {!loadError&&!inboxError&&messages.length>0&&visibleInbox.length===0&&
          <p style={{color:"var(--muted)"}}>{tr("No requests match this filter. Choose All recent to see the other messages.","Ninguna solicitud coincide con el filtro. Elija Todas para ver otras.")}</p>}
        {visibleInbox.map((m) => (
          <div key={m.id} id={`portal-message-${m.id}`} className="portal-card" style={{ minHeight: 0, padding: "14px 18px", opacity: m.read_at ? 0.75 : 1, ...(highlightId===m.id?{boxShadow:"0 0 0 3px var(--brand)"}:{}) }}>
            <span className="card-kicker">
              {!m.read_at && <strong style={{ color: "var(--brand-deep)" }}>{tr("NEW","NUEVO")} • </strong>}
              {m.sender_name || tr("Client","Cliente")}{m.locations?.name ? ` • ${m.locations.name}` : ""}
              {" • "}{new Date(m.created_at).toLocaleString(managerLanguage==="es"?"es-US":"en-US")}
              {m.emailed_at ? tr(" • emailed ✅"," • enviado por correo ✅") : ""}
            </span>
            {m.category==="document_copy"&&<p style={{fontWeight:700,color:"var(--brand-deep)",margin:"8px 0"}}>
              {tr("Signed contract copy request — verify recipient and deliver privately","Solicitud de copia de contrato firmado — verificar destinatario y entregar en privado")}
            </p>}
            {m.subject && <p style={{ fontWeight: 700, margin: "6px 0 0" }}>{m.subject}</p>}
            <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{m.body}</p>
            <div style={{marginTop:12,paddingTop:12,borderTop:"1px dashed var(--line)"}}>
              <p style={{fontWeight:700,margin:"0 0 8px"}}>{tr("Conversation","Conversación")}</p>
              {threadEntries(m).length===0&&<p style={{fontSize:"0.85rem",color:"var(--muted)",margin:"0 0 8px"}}>{tr("No replies yet. Send the first reply below — the customer can reply back from their portal.","Aún no hay respuestas. Envíe la primera abajo: el cliente puede responder desde su portal.")}</p>}
              <div style={{display:"grid",gap:8}}>
                {threadEntries(m).map(entry=>(
                  <div key={entry.id} style={{borderLeft:entry.sender_role==="business"?"3px solid var(--brand)":"3px solid var(--line)",paddingLeft:10}}>
                    <p style={{margin:0,fontSize:"0.8rem",color:"var(--muted)"}}>
                      <strong>{entry.sender_role==="business"?tr("Management reply","Respuesta de la gerencia"):tr("Customer reply","Respuesta del cliente")}</strong>
                      {entry.sender_name?` • ${entry.sender_name}`:""}
                      {" • "}{new Date(entry.created_at).toLocaleString(managerLanguage==="es"?"es-US":"en-US")}
                    </p>
                    <p style={{margin:"2px 0 0",whiteSpace:"pre-wrap"}}>{entry.body}</p>
                  </div>
                ))}
              </div>
              <label htmlFor={`thread-reply-${m.id}`} style={{display:"block",fontWeight:700,margin:"10px 0 6px"}}>{tr("Reply to the customer","Responder al cliente")}</label>
              <textarea id={`thread-reply-${m.id}`} rows={3} maxLength={1200}
                value={threadDrafts[m.id]??""}
                onChange={e=>setThreadDrafts(p=>({...p,[m.id]:e.target.value}))}
                disabled={working||threadBusyId===m.id}
                placeholder={tr("Write a customer-safe reply. It joins the conversation and the customer can reply back.","Escriba una respuesta segura. Se une a la conversación y el cliente puede responder.")}
                style={{width:"100%",padding:10,borderRadius:8,resize:"vertical"}} />
              <button type="button" disabled={working||threadBusyId===m.id}
                onClick={()=>void sendThreadReply(m)}
                style={{...button,marginTop:8}}>
                {threadBusyId===m.id?tr("Sending…","Enviando…"):tr("Send reply","Enviar respuesta")}
              </button>
            </div>
            <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--line)"}}>
              <label htmlFor={`status-${m.id}`} style={{display:"block",fontWeight:700,marginBottom:6}}>{tr("Customer-facing request status","Estado de solicitud visible para el cliente")}</label>
              <select id={`status-${m.id}`} value={statusDrafts[m.id]??m.customer_status??"received"}
                onChange={e=>setStatusDrafts(p=>({...p,[m.id]:e.target.value}))}
                disabled={working} style={{width:"100%",padding:10,borderRadius:8}}>
                <option value="received">{tr("Received","Recibido")}</option>
                <option value="in_progress">{tr("In progress","En curso")}</option>
                <option value="resolved">{tr("Resolved","Resuelto")}</option>
              </select>
              {m.category==="document_copy"&&<p style={{fontSize:"0.84rem",color:"var(--muted)"}}>{tr("Never attach the signed contract or paste a download link into a shared-link reply. Verify the intended recipient through a trusted channel, deliver privately, then record a safe confirmation before resolving.","No adjunte el contrato firmado ni enlaces de descarga en una respuesta compartida. Verifique al destinatario por un canal confiable, entréguelo en privado y registre una confirmación segura antes de resolver.")}</p>}
              {m.category==="document_copy"&&(statusDrafts[m.id]??m.customer_status)==="resolved"&&
                <label style={{display:"flex",gap:8,alignItems:"flex-start",margin:"10px 0"}}>
                  <input type="checkbox" checked={deliveryConfirmed[m.id]===true}
                    disabled={working} onChange={e=>setDeliveryConfirmed(p=>({...p,[m.id]:e.target.checked}))}/>
                  <span>{tr("I verified the recipient and securely delivered this copy outside the shared client link.","Verifiqué al destinatario y entregué la copia de forma segura fuera del enlace compartido.")}</span>
                </label>}
              <label htmlFor={`response-${m.id}`} style={{display:"block",fontWeight:700,margin:"10px 0 6px"}}>{tr("Reply visible to the customer link (optional)","Respuesta visible mediante el enlace (opcional)")}</label>
              <textarea id={`response-${m.id}`} rows={3} maxLength={1200}
                value={responseDrafts[m.id]??m.customer_response??""}
                onChange={e=>setResponseDrafts(p=>({...p,[m.id]:e.target.value}))}
                disabled={working} placeholder={tr("Write only customer-safe follow-up information.","Escriba solo información de seguimiento apropiada para clientes.")} 
                style={{width:"100%",padding:10,borderRadius:8,resize:"vertical"}} />
              <button type="button" disabled={working} onClick={()=>void saveCustomerResponse(m)}
                style={{...button,marginTop:8}}>{tr("Save customer update","Guardar respuesta al cliente")}</button>
              {m.customer_responded_at&&<p style={{fontSize:"0.8rem",color:"var(--muted)"}}>{tr("Last customer reply","Última respuesta al cliente")}: {new Date(m.customer_responded_at).toLocaleString(managerLanguage==="es"?"es-US":"en-US")}</p>}
            </div>
            {!m.read_at && (
              <button onClick={() => markRead(m.id)} style={{ ...button, marginTop: 8, fontSize: "0.85rem", padding: "7px 14px" }}>{tr("Mark as read","Marcar como leído")}</button>
            )}
          </div>
        ))}
      </div>

      <h2 id="portal-management-links" style={{ fontSize: "1.8rem" }}>{tr("Client portal links","Enlaces del portal del cliente")}</h2>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",margin:"8px 0 12px"}}>
        <label htmlFor="client-invitation-language">{tr("Customer invitation language","Idioma de la invitación")}</label>
        <select id="client-invitation-language" value={invitationLanguage}
          onChange={e=>setInvitationLanguage(e.target.value==="es"?"es":"en")}
          style={{padding:"9px 12px",borderRadius:8,border:"1px solid var(--line)"}}>
          <option value="en">English</option><option value="es">Español</option>
        </select>
      </div>
      <p style={{color:"var(--muted)"}}>{tr("Share a private link for each location only with an authorized contact. It allows service visits, approved quality and work-order details, but never staff or billing data. Rotate expired links and never share publicly.","Comparta un enlace privado por ubicación solo con un contacto autorizado. Muestra visitas, calidad aprobada y órdenes de trabajo, nunca datos de personal ni facturación. Cambie los enlaces caducados y no los publique.")}</p>

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        {locations.length === 0 && <p style={{ color: "var(--muted)" }}>{tr("Add a location first.","Añada primero una ubicación.")}</p>}
        {locations.map((l) => {
          const t = tokenByLocation[l.id];
          return (
            <div key={l.id} className="portal-card" style={{ minHeight: 0, padding: "16px 20px" }}>
              <strong>{l.name}</strong>
              {t ? (
                <div style={{ marginTop: 10 }}>
                  <p style={{ color: "var(--success-ink)", fontWeight: 700, fontSize: "0.9rem" }}>
                    {linkExpired(t) ? tr("⚠️ Link expired — rotate before sharing","⚠️ Enlace caducado — cámbielo antes de compartir") : tr("✅ Link active","✅ Enlace activo")}
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "var(--muted)", wordBreak: "break-all" }}>
                    {typeof window !== "undefined" ? `${window.location.origin}/portal/${t.token}` : ""}
                  </p>
                  {t.expires_at && (
                    <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      {tr("Expires","Vence")} {new Date(t.expires_at).toLocaleDateString(managerLanguage==="es"?"es-US":"en-US")}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button type="button" disabled={working||linkExpired(t)||Boolean(loadError)} onClick={()=>void copyLink(t)} style={button}>{tr("Copy link","Copiar enlace")}</button>
                     <button type="button" disabled={working||linkExpired(t)||Boolean(loadError)} onClick={()=>void copyLink(t,"invitation")} style={button}>{tr("Copy customer invitation","Copiar invitación")}</button>
                    <button onClick={() => regenerate(t)} disabled={working} style={button}>{tr("New link","Nuevo enlace")}</button>
                    <button onClick={() => revoke(t.id)} disabled={working} style={dangerButton}>{tr("Revoke","Revocar")}</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => generate(l.id, l.name)} disabled={working} style={button}>
                    {working ? tr("Generating…","Generando…") : tr("Generate client link","Generar enlace del cliente")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const button = {
  padding: "10px 20px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const dangerButton = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "10px 20px",
  fontWeight: 700,
  cursor: "pointer",
};
