// Lifecycle guard for a private PDF request. A sign-out, tenant switch, or
// unmount invalidates in-flight bytes before they can trigger a browser save.
export function createCustomerDocumentDownloadGuard(){
 let generation=0;
 let controller=null;
 return {
  begin(){
   controller?.abort();
   controller=new AbortController();
   return {run:++generation,signal:controller.signal};
  },
  isCurrent(run){
   return run===generation&&controller!==null&&!controller.signal.aborted;
  },
  finish(run){
   if(run===generation)controller=null;
  },
  cancel(){
   ++generation;
   controller?.abort();
   controller=null;
  }
 };
}
