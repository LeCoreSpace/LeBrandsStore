import {createDb} from "../db.js";
import {oauthAvailable,rotateOAuth} from "./razorpay-oauth.js";
export async function scheduleOAuthRefresh(env){
  if(!oauthAvailable(env))return;
  const db=createDb(env);
  try{
    const ids=await db.account(async tx=>{
      const [r]=await tx`SELECT to_regprocedure('public.list_razorpay_oauth_refresh(text)') IS NOT NULL AS ready`;
      return r?.ready?tx`SELECT store_id FROM public.list_razorpay_oauth_refresh(${env.RAZORPAY_OAUTH_MODE})`:[];
    });
    for(const {store_id} of ids){try{await rotateOAuth(db,store_id,env);}catch{/* Safe attention flag is exposed to the owner; never log tokens/provider bodies. */}}
  }finally{await db.close();}
}
