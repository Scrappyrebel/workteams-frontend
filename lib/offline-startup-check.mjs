export const OFFLINE_WORKER_VERSION = "workteams-v7-cold-clock-20261125";

// A registration alone is insufficient: an old worker can still control a page.
// Probe only the actual controller, close both ports on every completion path.
export function probeOfflineStartup(worker, {makeChannel=()=>new MessageChannel(), timeoutMs=4000}={}) {
  if (!worker) return Promise.reject(Error("This page is not controlled by the offline worker yet."));
  return new Promise((resolve,reject)=>{
    const channel=makeChannel();
    let timer;
    const finish=(error,data)=>{
      clearTimeout(timer);channel.port1.close();channel.port2.close();
      if(error)reject(error);else resolve(data);
    };
    channel.port1.onmessage=event=>{
      const data=event.data;
      if(data?.version!==OFFLINE_WORKER_VERSION || data.shellAvailable!==true)
        finish(Error("This browser has not received the current offline clock."));
      else finish(null,data);
    };
    timer=setTimeout(()=>finish(Error("The offline worker did not answer the startup check.")),timeoutMs);
    try { worker.postMessage({type:"WORKTEAMS_OFFLINE_STARTUP_CHECK"},[channel.port2]); }
    catch(error){finish(error);}
  });
}
