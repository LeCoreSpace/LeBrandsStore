// Explicit, synthetic-only live check. Reads the secret at runtime, never prints
// it or provider bodies. No database, R2, business records or deployment access.
import {scanBusinessDocument,readBusinessDocumentScanVerdict} from "../src/store/business-document-scanner.js";
import {BUSINESS_DOCUMENT_MAX_BYTES} from "../src/store/business-document-limits.js";
import {setTimeout as delay} from "node:timers/promises";

function syntheticPdf({eicar=false,padding=0}={}){
  // Assemble at runtime so antivirus tools do not quarantine this source file.
  const marker=[String.raw`X5O!P%@AP[4\PZX54(P^)7CC)7}`,"$EICAR-STANDARD-","ANTIVIRUS-TEST-FILE!$H+H*"].join("");
  const content="BT /F1 12 Tf 72 720 Td (Synthetic security check. No business data.) Tj ET\n"+" ".repeat(padding);
  const objects=[
    `<< /Type /Catalog /Pages 2 0 R${eicar?" /Names << /EmbeddedFiles << /Names [(test.txt) 7 0 R] >> >>":""} >>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  if(eicar)objects.push(
    `<< /Type /EmbeddedFile /Length ${Buffer.byteLength(marker)} >>\nstream\n${marker}\nendstream`,
    "<< /Type /Filespec /F (test.txt) /EF << /F 6 0 R >> >>",
  );
  let pdf="%PDF-1.4\n";const offsets=[0];
  for(const [index,object] of objects.entries()){
    offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;
  }
  const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))pdf+=`${String(offset).padStart(10,"0")} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}

async function main(){
  if(!process.argv.includes("--run-live"))throw new Error("Explicit --run-live is required.");
  const env={BUSINESS_DOCUMENT_SCAN_PROVIDER:"cloudmersive",BUSINESS_DOCUMENT_SCAN_PROCESSOR_APPROVED:"true",
    CLOUDMERSIVE_API_KEY:process.env.CLOUDMERSIVE_API_KEY};
  if(!env.CLOUDMERSIVE_API_KEY)throw new Error("Cloudmersive key is not configured.");
  const cases=[
    {name:"clean_pdf",bytes:syntheticPdf(),malicious:false},
    {name:"near_3_MB_clean_pdf",bytes:syntheticPdf({padding:2_990_000}),malicious:false},
    {name:"eicar_embedded_pdf",bytes:syntheticPdf({eicar:true}),malicious:true},
  ];
  for(const [index,item] of cases.entries()){
    if(index)await delay(1200); // Free plan: no more than one request per second.
    let httpStatus=null,signatureDetected=false,error=null;
    if(item.bytes.length>BUSINESS_DOCUMENT_MAX_BYTES)throw new Error("Synthetic file exceeds application limit.");
    try{
      await scanBusinessDocument(env,item.bytes,"application/pdf",{fetchImpl:async(url,options)=>{
        const response=await fetch(url,options);httpStatus=response.status;
        const verdict=await readBusinessDocumentScanVerdict(response);
        signatureDetected=Array.isArray(verdict.FoundViruses)&&verdict.FoundViruses.some(
          finding=>typeof finding?.VirusName==="string"&&/eicar/i.test(finding.VirusName));
        return Response.json(verdict);
      }});
    }catch(caught){error=caught;}
    const passed=item.malicious?error?.status===400&&signatureDetected:!error;
    console.log(JSON.stringify({check:item.name,bytes:item.bytes.length,provider_http_status:httpStatus,
      passed,...(item.malicious?{eicar_signature_detected:signatureDetected}:{})}));
    if(!passed){process.exitCode=1;return;}
  }
}
main().catch(()=>{console.error("Synthetic scanner check could not complete. No real documents were used.");process.exitCode=1;});
