"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { probeOfflineStartup } from "../lib/offline-startup-check.mjs";
import { readColdClock } from "../lib/cold-clock-identity.mjs";

export default function ServiceWorkerRegister() {
  const pathname=usePathname();
  const [status,setStatus]=useState("Checking this browser's offline startup…");
  useEffect(()=>{
    let stopped=false,registration,updateTimer,checkTimer,generation=0,lastUpdate=0;
    const publish=value=>{if(!stopped)setStatus(value);};
    if (!("serviceWorker" in navigator)) {
      publish("Offline startup unavailable: this browser does not support it.");
      return;
    }
    const check=async()=>{
      const run=++generation,controller=navigator.serviceWorker.controller;
      try {
        const reply=await probeOfflineStartup(controller);
        if(stopped || run!==generation || controller!==navigator.serviceWorker.controller)return;
        if(reply.scope!==`${location.origin}/`)throw Error("The offline worker does not cover this app address.");
        const snap=readColdClock(localStorage,location.pathname);
        if(!snap.time)throw Error("Open your Time Clock online to save its shift information.");
        publish("Offline startup check passed: current clock and saved sign-in confirmed on this browser. Closed-app device test still required.");
      }catch(error){
        if(!stopped && run===generation)publish(`Offline startup not confirmed: ${error.message}`);
      }
    };
    const update=()=>{
      if(!registration || navigator.onLine===false || Date.now()-lastUpdate<30000)return;
      lastUpdate=Date.now();
      registration.update().then(check).catch(error=>publish(`Offline update failed: ${error.message}`));
    };
    const resume=()=>{if(document.visibilityState!=="hidden"){update();check();}};
    navigator.serviceWorker.addEventListener("controllerchange",check);
    window.addEventListener("online",resume);
    window.addEventListener("pageshow",resume);
    document.addEventListener("visibilitychange",resume);
    navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"})
      .then(value=>{
        if(stopped)return;
        registration=value;update();check();
        updateTimer=window.setInterval(update,30*60*1000);
        // Context is saved asynchronously by the company and time pages.
        // Recheck without navigating or touching any recording or punch.
        checkTimer=window.setInterval(check,10000);
      })
      .catch(error=>publish(`Offline startup registration failed: ${error.message}`));
    return ()=>{
      stopped=true;++generation;
      window.clearInterval(updateTimer);window.clearInterval(checkTimer);
      navigator.serviceWorker.removeEventListener("controllerchange",check);
      window.removeEventListener("online",resume);
      window.removeEventListener("pageshow",resume);
      document.removeEventListener("visibilitychange",resume);
    };
  },[pathname]);
  if(!/^\/app(?:\/?$|\/[0-9a-f-]{36}\/time\/?$)/i.test(pathname||""))return null;
  return <aside aria-label="Offline startup check" style={{padding:"10px 16px",background:"#eff6ff",color:"#172554",fontSize:14}}>
    <details><summary>Offline startup check</summary><p role="status">{status}</p></details>
  </aside>;
}


