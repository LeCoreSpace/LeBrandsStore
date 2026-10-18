// Server access remains authoritative. Saved conversation progress must not
// bypass newly required country, GST or private-document recovery steps.
export function requiredAnnBusinessPrompt(access,{readOnly=false,gstVerified}={}){
  if(readOnly||!access?.available||access.allowed)return null;
  if(!access.business_country)return "business_country";
  if(access.business_country==="IN"&&(access.reason==="gst_required"||gstVerified===false))return "gstin";
  return "business_documents";
}

export function annBusinessPosition({promptId,step,resume=null},prompts,required,{setupLocked=false}={}){
  const current=prompts.findIndex(p=>p.id===promptId),target=prompts.findIndex(p=>p.id===required);
  if(required&&target>=0&&(setupLocked||current>target)){
    return {promptId:required,step:"business",resume:resume||(promptId!==required?{promptId,step}:null)};
  }
  if(!required&&resume&&["business_country","gstin","business_documents"].includes(promptId)){
    const next=prompts.find(p=>p.id===resume.promptId);
    if(next)return {promptId:next.id,step:next.step,resume:null};
  }
  return {promptId,step,resume};
}
