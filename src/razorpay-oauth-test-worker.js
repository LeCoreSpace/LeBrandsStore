// Separate Test webhook receiver. Never deploy this entry as lebrands-store.
import {createDb} from "./db.js";
import {oauthConfig,OAUTH_WEBHOOK} from "./connections/razorpay-oauth.js";
import {razorpayOAuthWebhook} from "./connections/razorpay-oauth-webhook.js";
import {boundedText,verifyHmac} from "./connections/runtime-client.js";

const headers={"cache-control":"no-store","x-content-type-options":"nosniff","x-robots-tag":"noindex, nofollow"};
const json=(body,status=200)=>Response.json(body,{status,headers});
function ready(env){
  try{
    if(env.RAZORPAY_OAUTH_MODE!=="test")return false;
    oauthConfig(env);
    return typeof env.RAZORPAY_OAUTH_WEBHOOK_SECRET==="string"&&env.RAZORPAY_OAUTH_WEBHOOK_SECRET.length>=16&&
      typeof env.SESSION_SECRET==="string"&&env.SESSION_SECRET.length>=32;
  }catch{return false;}
}
export function testWebhookWorker({database=createDb,handle=razorpayOAuthWebhook}={}){
  return {async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(path==="/health"&&["GET","HEAD"].includes(request.method))
      return json({service:"razorpay-oauth-test",mode:"test",configured:ready(env)},ready(env)?200:503);
    if(path!==OAUTH_WEBHOOK)return json({error:"Not found."},404);
    if(request.method!=="POST")return json({error:"Method not allowed."},405);
    if(!ready(env))return json({error:"The Test receiver is not configured."},503);
    let db;
    try{
      // Check the signature before constructing any database client. Recreate
      // the request with the exact raw body for the shared production handler.
      const raw=await boundedText(request);
      if(!await verifyHmac(env.RAZORPAY_OAUTH_WEBHOOK_SECRET,raw,request.headers.get("x-razorpay-signature")))
        return json({error:"Invalid webhook signature."},400);
      db=database(env);
      const response=await handle(new Request(request.url,{method:"POST",headers:request.headers,body:raw}),env,db);
      const output=new Response(response.body,response);
      for(const [k,v] of Object.entries(headers))output.headers.set(k,v);
      return output;
    }catch{return json({error:"The Test receiver is temporarily unavailable."},503);}
    finally{if(db)ctx.waitUntil(db.close());}
  }};
}
export default testWebhookWorker();
