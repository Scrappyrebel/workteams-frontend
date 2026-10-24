import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {documentManagerScope,isCurrentDocumentRequest} from "../lib/customer-document-scope.mjs";
const source=readFileSync(new URL("../components/CustomerDocumentManager.js",import.meta.url),"utf8");
const scopeA=documentManagerScope("company-a","location-1",true,true);
const scopeB=documentManagerScope("company-b","location-1",true,true);
assert.notEqual(scopeA,scopeB,"Company changes must invalidate previous documents");
assert.notEqual(scopeA,documentManagerScope("company-a","location-2",true,true),"Location changes must invalidate previous documents");
for(const input of [
 ["company-a","location-1",false,true],["company-a","location-1",true,false],
 ["","location-1",true,true],["company-a","",true,true]
])assert.equal(documentManagerScope(...input),"","Unapproved scopes cannot display documents");
assert.ok(isCurrentDocumentRequest(7,7,scopeA,scopeA));
assert.equal(isCurrentDocumentRequest(7,8,scopeA,scopeA),false,"Slower previous request rejected");
assert.equal(isCurrentDocumentRequest(7,7,scopeA,scopeB),false,"Other company response rejected");
assert.equal(isCurrentDocumentRequest(7,7,scopeA,""),false,"Disabled portal response rejected");
assert.equal(isCurrentDocumentRequest(7,7,"",""),false);
for(const word of ["requestSeq.current++","scopeRef.current=currentScope","loadedScope===currentScope",
 "isCurrentDocumentRequest(requestId,requestSeq.current,scope,scopeRef.current)",
 "visibleDocs.map","scopeRef.current!==operationScope",
 "setTitle(\"\");setFile(null)","return ()=>{requestSeq.current++}"])
 assert.ok(source.includes(word),"Manager document race guard missing: "+word);
assert.ok(!source.includes("docs.map(doc="),"Do not render results outside the verified scope");
console.log("WorkTeams manager PDF scoped-list and asynchronous tenant/location race checks passed.");
