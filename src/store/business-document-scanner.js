// Server-only adapter. No document URLs, business details or original filenames
// are sent to the processor. Never log provider bodies, credentials or findings.
import {BUSINESS_DOCUMENT_MAX_BYTES} from "./business-document-limits.js";
const ENDPOINT="https://api.cloudmersive.com/virus/scan/file/advanced";
const MAX_VERDICT=64*1024;
const SCREENING_ERRORS={
  SCANNER_CONFIGURATION:"Security screening is not configured. Please contact support.",
  SCANNER_AUTHENTICATION:"Security screening could not authenticate with its provider. Please contact support to check the scanner credentials.",
  SCANNER_RATE_LIMIT:"The security screening provider's request limit has been reached. Please try again later.",
  SCANNER_FILE_LIMIT:"The security screening provider could not accept this file's size. Please use a smaller document.",
  SCANNER_TIMEOUT:"Security screening timed out. Please try again shortly.",
  SCANNER_NETWORK:"The security screening provider could not be reached. Please try again shortly.",
  SCANNER_RESPONSE:"Security screening returned an unreadable or incomplete result. Please contact support if this continues.",
  SCANNER_PROVIDER_ERROR:"The security screening provider is unavailable. Please try again later.",
};
class ScannerUnavailable extends Error{
  constructor(code="SCANNER_RESPONSE",providerStatus=null){
    super(`${SCREENING_ERRORS[code]} No document was submitted.`);
    this.status=503;this.screeningCode=code;
    this.providerStatus=providerStatus;
  }
}
const unavailable=(code,providerStatus)=>new ScannerUnavailable(code,providerStatus);
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

export async function readBusinessDocumentScanVerdict(response){
  if(!response.ok){
    const status=response.status;
    await response.body?.cancel().catch(()=>{});
    throw unavailable([401,403].includes(status)?"SCANNER_AUTHENTICATION":
      [402,429].includes(status)?"SCANNER_RATE_LIMIT":
      status===413?"SCANNER_FILE_LIMIT":"SCANNER_PROVIDER_ERROR",status);
  }
  if(!response.body||
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
  if(!status.available)throw unavailable("SCANNER_CONFIGURATION");
  const extension={"application/pdf":"pdf","image/png":"png","image/jpeg":"jpg"}[mime];
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>BUSINESS_DOCUMENT_MAX_BYTES||!extension)throw rejected();
  let verdict;
  try{
    const signal=AbortSignal.timeout(12000);
    if(status.provider==="cloudmersive"){
      const body=new FormData();
      body.set("inputFile",new Blob([bytes],{type:mime}),`document.${extension}`);
      const headers={Apikey:env.CLOUDMERSIVE_API_KEY.trim(),Accept:"application/json",
        restrictFileTypes:".pdf,.png,.jpg,.jpeg"};
      for(const header of blockedHeaders)headers[header]="false";
      verdict=await readBusinessDocumentScanVerdict(await fetchImpl(ENDPOINT,{
        // Workers reject redirect:"error" before making any request. Manual
        // mode plus the non-2xx verdict check rejects redirects without ever
        // forwarding the key or document to the redirect destination.
        method:"POST",headers,body,signal,redirect:"manual",
      }));
    }else{
      verdict=await readBusinessDocumentScanVerdict(await env.BUSINESS_DOCUMENT_SCANNER.fetch("https://scanner.internal/scan",{
        method:"POST",headers:{"content-type":mime,"x-document-size":String(bytes.length)},
        body:bytes,signal,redirect:"manual",
      }));
    }
  }catch(error){
    if(error instanceof ScannerUnavailable)throw error;
    throw unavailable(["TimeoutError","AbortError"].includes(error?.name)?"SCANNER_TIMEOUT":"SCANNER_NETWORK");
  }
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
