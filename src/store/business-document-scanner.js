// Server-only adapter. No document URLs, business details or original filenames
// are sent to the processor. Never log provider bodies, credentials or findings.
const ENDPOINT="https://api.cloudmersive.com/virus/scan/file/advanced";
const MAX_VERDICT=64*1024;
const unavailable=()=>Object.assign(new Error("Security screening is unavailable. No document was submitted."),{status:503});
const rejected=()=>{
  const message="Document did not pass security screening. Use an unencrypted PDF, JPEG or PNG.";
  return Object.assign(new Error(message),{status:400,errors:{file:message}});
};
const flags=["ContainsExecutable","ContainsInvalidFile","ContainsScript","ContainsPasswordProtectedFile",
  "ContainsRestrictedFileFormat","ContainsMacros","ContainsXmlExternalEntities","ContainsInsecureDeserialization",
  "ContainsHtml","ContainsUnsafeArchive","ContainsOleEmbeddedObject","ContainsUnwantedAction"];
const blockedHeaders=["allowExecutables","allowInvalidFiles","allowScripts","allowPasswordProtectedFiles",
  "allowMacros","allowXmlExternalEntities","allowInsecureDeserialization","allowHtml",
  "allowUnsafeArchives","allowOleEmbeddedObject","allowUnwantedAction"];

export function businessDocumentScannerStatus(env){
  const provider=env.BUSINESS_DOCUMENT_SCAN_PROVIDER??(
    typeof env.BUSINESS_DOCUMENT_SCANNER?.fetch==="function"?"service_binding":"disabled");
  if(provider==="service_binding")
    return {provider,available:typeof env.BUSINESS_DOCUMENT_SCANNER?.fetch==="function"};
  if(provider!=="cloudmersive")return {provider:null,available:false};
  const approved=env.BUSINESS_DOCUMENT_SCAN_PROCESSOR_APPROVED==="true";
  const hasKey=typeof env.CLOUDMERSIVE_API_KEY==="string"&&Boolean(env.CLOUDMERSIVE_API_KEY.trim());
  return {provider,available:approved&&hasKey};
}

async function verdictJson(response){
  if(!response.ok||!response.body||
    !/^(?:application\/json|text\/json)(?:\s*;|$)/i.test(response.headers.get("content-type")||"")||
    Number(response.headers.get("content-length"))>MAX_VERDICT){
    await response.body?.cancel().catch(()=>{});
    throw unavailable();
  }
  const reader=response.body.getReader(),parts=[];
  let size=0;
  try{
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      size+=value.length;
      if(size>MAX_VERDICT){await reader.cancel();throw unavailable();}
      parts.push(value);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    const value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    if(!value||typeof value!=="object"||Array.isArray(value))throw unavailable();
    return value;
  }catch{throw unavailable();}
  finally{reader.releaseLock();}
}

export async function scanBusinessDocument(env,bytes,mime,{fetchImpl=globalThis.fetch}={}){
  const status=businessDocumentScannerStatus(env);
  if(!status.available)throw unavailable();
  const extension={"application/pdf":"pdf","image/png":"png","image/jpeg":"jpg"}[mime];
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>5*1024*1024||!extension)throw rejected();
  let verdict;
  try{
    const signal=AbortSignal.timeout(12000);
    if(status.provider==="cloudmersive"){
      const body=new FormData();
      body.set("inputFile",new Blob([bytes],{type:mime}),`document.${extension}`);
      const headers={Apikey:env.CLOUDMERSIVE_API_KEY.trim(),Accept:"application/json",
        restrictFileTypes:".pdf,.png,.jpg,.jpeg"};
      for(const header of blockedHeaders)headers[header]="false";
      verdict=await verdictJson(await fetchImpl(ENDPOINT,{
        method:"POST",headers,body,signal,redirect:"error",
      }));
    }else{
      verdict=await verdictJson(await env.BUSINESS_DOCUMENT_SCANNER.fetch("https://scanner.internal/scan",{
        method:"POST",headers:{"content-type":mime,"x-document-size":String(bytes.length)},
        body:bytes,signal,redirect:"error",
      }));
    }
  }catch{throw unavailable();}
  if(status.provider==="cloudmersive"){
    if(typeof verdict.CleanResult!=="boolean"||
      !(verdict.FoundViruses===null||Array.isArray(verdict.FoundViruses))||
      flags.some(name=>Object.hasOwn(verdict,name)&&typeof verdict[name]!=="boolean"))
      throw unavailable();
    if(!verdict.CleanResult||verdict.FoundViruses?.length||flags.some(name=>verdict[name]===true))
      throw rejected();
  }else{
    if(typeof verdict.clean!=="boolean"||verdict.engine!=="configured")throw unavailable();
    if(!verdict.clean)throw rejected();
  }
  return {provider:status.provider,engine:status.provider==="cloudmersive"?"advanced":"configured",
    scanned_at:new Date().toISOString()};
}

export async function businessDocumentScanBudgetReady(tx){
  const [row]=await tx`SELECT to_regprocedure('public.business_document_reserve_scan(uuid,text)') AS scan_budget_definition`;
  return Boolean(row?.scan_budget_definition);
}

export async function reserveBusinessDocumentScan(tx,store,token){
  const [row]=await tx`SELECT public.business_document_reserve_scan(${store},${token}) AS allowed`;
  if(row?.allowed===false)throw Object.assign(new Error("Document security screening limit reached. Please try again later."),{status:429});
  if(row?.allowed!==true)throw unavailable();
}
