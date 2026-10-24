// Pure guard used by WorkTeams manager PDF listing and regression tests.
export function documentManagerScope(companyId,locationId,pilotRequested,selected){
 if(!companyId||!locationId||pilotRequested!==true||selected!==true)return "";
 return companyId+"|"+locationId;
}
export function isCurrentDocumentRequest(requestId,activeRequestId,requestScope,activeScope){
 return Number.isSafeInteger(requestId)&&requestId===activeRequestId
   &&typeof requestScope==="string"&&requestScope.length>0&&requestScope===activeScope;
}
