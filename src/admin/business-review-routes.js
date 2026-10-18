import {SECURITY_HEADERS,isValidOrigin,readForm} from "../auth/security.js";
import {renderBusinessReview} from "../ui/business-review.js";

const ROOT="/admin/business-reviews";
const UUID="[a-f0-9-]{36}";
const MATCH=new RegExp(`^${ROOT}(?:/(${UUID})(?:/documents/(${UUID}))?)?$`,"i");
const headers={...SECURITY_HEADERS,"cache-control":"no-store","referrer-policy":"no-referrer","x-robots-tag":"noindex, nofollow"};
const decode=v=>typeof v==="string"?JSON.parse(v):v;
export const isBusinessReviewRoute=path=>path==="/admin"||path===ROOT||path.startsWith(`${ROOT}/`);
const fail=(message,status)=>Object.assign(new Error(message),{status});
const statusFor=e=>e.code==="42501"?403:e.code==="40001"?409:e.code==="P0002"?404:["22023","22P02","INVALID_FORM"].includes(e.code)?400:e.status||503;
const safeError=(e,status)=>status>=500?"Business review is unavailable. Check the review migration and private storage configuration.":e.message;
const page=(view,data,user,status=200)=>new Response(renderBusinessReview(view,data,user),{status,headers:{...headers,"content-type":"text/html; charset=utf-8"}});

async function ready(tx,token) {
  const [schema]=await tx`SELECT to_regprocedure('public.business_review_access(text)') AS review_definition`;
  if(!schema?.review_definition)throw fail("Business review migration is required.",503);
  await tx`SELECT public.business_review_access(${token})`;
}
async function detail(tx,token,id) {
  const [row]=await tx`SELECT public.business_review_detail(${token},${id}) AS data`;
  const data=decode(row.data);
  for(const doc of data.documents||[])doc.download_url=`${ROOT}/${id}/documents/${doc.id}`;
  return data;
}
async function reviewRequest(request,env,db,user,token) {
  const url=new URL(request.url),match=url.pathname.match(MATCH);
  if(!user||user.must_change_password||!/^[a-f0-9]{64}$/.test(token||""))
    return page("queue",{error:"Sign in with an authorized platform reviewer account."},user,401);
  let form,view=match?.[1]?"detail":"queue",data={};
  try {
    if(!match&&url.pathname!=="/admin")throw fail("Page not found.",404);
    const id=match?.[1],documentId=match?.[2];
    const read=["GET","HEAD"].includes(request.method);
    if(!read&&(request.method!=="POST"||!id||documentId))throw fail("Method not allowed.",405);
    if(!read&&!isValidOrigin(request))throw fail("Invalid request origin.",403);
    // Authorization is in the database using the live session, never a UI role.
    await db.account(tx=>ready(tx,token));
    if(url.pathname==="/admin")return new Response(null,{status:303,headers:{...headers,location:ROOT}});
    if(documentId) {
      if(!env.BUSINESS_DOCUMENTS?.get)throw fail("Private storage is unavailable.",503);
      const row=await db.account(async tx=>{
        const [record]=await tx`SELECT * FROM public.business_review_document(${token},${id},${documentId})`;
        return record;
      });
      if(!row)throw fail("Document not found.",404);
      const object=request.method==="HEAD"?await env.BUSINESS_DOCUMENTS.head(row.object_key):await env.BUSINESS_DOCUMENTS.get(row.object_key);
      if(!object)throw fail("Document is unavailable.",503);
      return new Response(request.method==="HEAD"?null:object.body,{headers:{...headers,
        "content-type":"application/octet-stream","content-disposition":'attachment; filename="business-document"',
        "content-length":String(Number(row.size_bytes)),"x-content-type-options":"nosniff",
        "content-security-policy":"default-src 'none'; sandbox"}});
    }
    if(!id) {
      const status=url.searchParams.get("status")||"pending_review";
      const pageText=url.searchParams.get("page")||"0";
      if(!["pending_review","changes_requested","approved","all"].includes(status)||!/^\d{1,4}$/.test(pageText)||Number(pageText)>1000)
        throw fail("Choose a valid queue filter and page.",400);
      const index=Number(pageText);
      data=await db.account(async tx=>{
        const [row]=await tx`SELECT public.business_review_queue(${token},${status},${index*30}) AS data`;
        return {...decode(row.data),status,page:index};
      });
    } else if(read) data=await db.account(tx=>detail(tx,token,id));
    else {
      const fields=await readForm(request);
      if([...fields.keys()].some(k=>!["expected_revision","decision","note","manual_review"].includes(k))||
        [...fields.keys()].some(k=>fields.getAll(k).length!==1))throw fail("Invalid review form.",400);
      form={decision:fields.get("decision"),note:fields.get("note")};
      const revision=fields.get("expected_revision");
      if(!/^[1-9]\d{0,8}$/.test(revision||"")||!["approved","changes_requested"].includes(form.decision)||
        typeof form.note!=="string"||form.note.trim().length<10||form.note.trim().length>1000||fields.get("manual_review")!=="1")
        throw fail("Confirm manual review and enter a decision note of 10 to 1000 characters.",400);
      await db.account(tx=>tx`SELECT public.business_review_decide(${token},${id},${Number(revision)},${form.decision},${form.note.trim()},${true})`);
      return new Response(null,{status:303,headers:{...headers,location:`${ROOT}/${id}`}});
    }
    const response=page(view,data,user);
    return request.method==="HEAD"?new Response(null,{status:response.status,headers:response.headers}):response;
  } catch(e) {
    const status=statusFor(e),error=safeError(e,status);
    // Only re-read details after a recoverable form conflict/validation error.
    // Permission failures never trigger a private-data read.
    if(form&&[400,409].includes(status)&&match?.[1]){
      try{data=await db.account(tx=>detail(tx,token,match[1]));}catch{data={};}
    }
    return page(view,{...data,error,form},user,status);
  }
}

export async function handleBusinessReview(request,env,db,user,token){
  const response=await reviewRequest(request,env,db,user,token);
  return request.method==="HEAD"?new Response(null,{status:response.status,headers:response.headers}):response;
}
