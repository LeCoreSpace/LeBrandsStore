import{marketingError}from"./rules.js";
// Supported version pinned deliberately; never construct an arbitrary provider URL.
export const META_GRAPH_VERSION="v25.0";
export async function sendMetaEvent(pixel,token,event,testCode="",fetcher=fetch){
  if(!/^\d{15,16}$/.test(pixel)||typeof token!=="string"||token.length<20)
    throw marketingError("Save your Meta Pixel ID and access token before sending a test.",400);
  let response;
  try{
    response=await fetcher(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pixel}/events`,{
      method:"POST",redirect:"manual",signal:AbortSignal.timeout(8000),
      headers:{"content-type":"application/json",authorization:`Bearer ${token}`},
      body:JSON.stringify({data:[event],...(testCode?{test_event_code:testCode}:{})})
    });
    if(!response.ok)throw new Error("provider");
    const reader=response.body?.getReader();let size=0,text="";
    if(!reader)throw new Error("body");
    const decoder=new TextDecoder();
    try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>32768)throw new Error("large");text+=decoder.decode(chunk.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
    if(JSON.parse(text).events_received!==1)throw new Error("not_accepted");
  }catch{
    // Provider error bodies can contain tokens or customer data. Never echo them.
    throw marketingError("Meta could not accept this event. Check your Pixel ID and access token in Meta, then try again.",502);
  }
}
