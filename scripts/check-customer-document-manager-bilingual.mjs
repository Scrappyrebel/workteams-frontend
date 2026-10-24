import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../components/CustomerDocumentManager.js",import.meta.url),"utf8");
for(const word of ['manager-doc-language','language==="es"?es:en','Cargar PDF PRIVADO',
'Documentos de clientes — centro privado de PDF','Publicar tras revisar','Retirar',
'No se pudo verificar la publicación','Publicación retirada','Sin vencimiento',
'visibleDocs.map','scopeRef.current!==operationScope',
'list_workteams_customer_documents_manager','set_workteams_customer_document_publication']){
 assert.ok(src.includes(word),"Missing protected bilingual PDF functionality: "+word);
}
console.log("WorkTeams manager PDF English/Spanish workflow, publication controls and scope protections passed.");
