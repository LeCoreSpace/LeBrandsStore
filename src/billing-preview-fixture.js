// Development-only synthetic authentication + billing journey. No real
// credentials, administrative connections, payment calls or production data.
import {getAnnPlanFixture} from "./ann-plan-preview-fixture.js";
import {handleAccounts} from "./auth/routes.js";
import {hashPassword} from "./auth/passwords.js";
import {sessionCookie} from "./auth/security.js";
import {prepareCheckoutFixture,TEST_BILLING_ENV} from "./billing-checkout-preview-fixture.js";
const prefix="/__billing-preview",fixtureCookie="__Host-lb_billing_fixture";
const realCookie=sessionCookie("f".repeat(64)).split("=")[0];
const environment={PASSWORD_PEPPER:Buffer.alloc(32,0x42).toString("base64"),
  SESSION_SECRET:"public-local-fixture-session-secret-not-for-production"};
let ready;
let checkoutReady;
async function setup(){
  const f=await getAnnPlanFixture();
  const password=await hashPassword("Billing preview password 73!",environment);
  const [user]=(await f.pg.query("UPDATE public.users SET country_code='IN',email='billing-owner@example.test',password_hash=$2,password_salt=$3,password_algo=$4,password_iterations=$5,must_change_password=false WHERE id=$1 RETURNING id,email",[f.owner.id,password.password_hash,password.password_salt,password.password_algo,password.password_iterations])).rows;
  const second=(await f.pg.query(`INSERT INTO public.stores(brand_id,name,subdomain)
    SELECT brand_id,'Second Studio','second-billing-studio' FROM public.stores WHERE store_id=$1
    ON CONFLICT(subdomain) DO UPDATE SET name=excluded.name RETURNING store_id`,[f.store])).rows[0];
  await f.pg.query("INSERT INTO public.store_members(store_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT(store_id,user_id) DO NOTHING",[second.store_id,user.id]);
  const session=async hash=>(await f.pg.query("SELECT * FROM public.get_session($1)",[hash])).rows[0]||null;
  const repository={
    session,
    async login(email,_ip,verify){
      const result=await verify(email===user.email?{...password,user_id:user.id}:null);
      if(result)await f.pg.query("SELECT public.create_session($1,$2,$3)",[user.id,result.tokenHash,"isolated billing preview"]);
      return result;
    },
  };
  const db={close:async()=>{},withMemberStore:(id,hash,fn,{lockStore=true}={})=>f.pg.transaction(async trx=>{
    await trx.exec("SET LOCAL ROLE lebrands_app");
    const [access]=(await trx.query("SELECT public.authorize_store_session($1,$2) allowed",[hash,id])).rows;
    if(!access?.allowed)throw Object.assign(new Error("Store access denied."),{status:403});
    await trx.query("SELECT set_config('app.store_id',$1,true)",[id]);
    await trx.query(`SELECT store_id FROM public.stores WHERE store_id=$1 FOR ${lockStore?"UPDATE":"SHARE"}`,[id]);
    const tx=async(strings,...values)=>(await trx.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values)).rows;
    tx.json=value=>JSON.stringify(value);
    return fn(tx);
  })};
  return {f,user,db,repository};
}
export async function billingPreview(req,res){
  const local=new URL(req.url||"/","http://local");
  const testMode=local.pathname.startsWith("/__billing-test-preview");
  const activePrefix=testMode?"/__billing-test-preview":prefix;
  if(!local.pathname.startsWith(activePrefix))return false;
  try{
    if(local.pathname===activePrefix||local.pathname===`${activePrefix}/`){
      res.writeHead(303,{location:`${activePrefix}/plans?plan=grow&interval=annual`,"cache-control":"no-store"});res.end();return true;
    }
    ready ||=setup();
    const {f,db,repository}=await ready;
    const simulation=testMode?await (checkoutReady ||=prepareCheckoutFixture(f)):null;
    if(testMode&&local.pathname===`${activePrefix}/provider-capture`){
      // This route exists only in the local, in-memory provider simulator.
      // No user documents or real account/provider credentials are reachable.
      const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>1024)throw Error("Large fixture input");chunks.push(chunk);}
      const id=JSON.parse(Buffer.concat(chunks).toString()).order_id;
      const result=simulation.provider.capture(id);
      res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(result));return true;
    }
    const headers=new Headers({"content-type":req.headers["content-type"]||"application/x-www-form-urlencoded"});
    const cookie=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(`${fixtureCookie}=`));
    if(cookie)headers.set("cookie",cookie.replace(`${fixtureCookie}=`,`${realCookie}=`));
    if(req.headers.origin)headers.set("origin","https://app.lebrands.store");
    const chunks=[];let size=0;
    if(!["GET","HEAD"].includes(req.method))for await(const chunk of req){
      size+=chunk.length;if(size>1024*1024)throw new Error("Fixture request too large");chunks.push(chunk);
    }
    const request=new Request(`https://app.lebrands.store${local.pathname.slice(activePrefix.length)}${local.search}`,{
      method:req.method,headers,...(!["GET","HEAD"].includes(req.method)?{body:Buffer.concat(chunks)}:{})
    });
    const response=await handleAccounts(request,{...environment,...(testMode?TEST_BILLING_ENV:{})},{},{
      createDb:()=>db,repository,...(testMode?{billing:{fetcher:simulation.provider.fetcher}}:{})
    });
    const outgoing=Object.fromEntries(response.headers);
    if(outgoing["set-cookie"])outgoing["set-cookie"]=outgoing["set-cookie"].replace(`${realCookie}=`,`${fixtureCookie}=`);
    if(outgoing.location?.startsWith("/"))outgoing.location=activePrefix+outgoing.location;
    outgoing["cache-control"]="no-store";
    let body=await response.text();
    if(outgoing["content-type"]?.includes("text/html")){
      body=body.replace(/\b(href|action)="(\/(?:plans|login|signup|account|stores\/[a-f0-9-]{36}(?:\/[^"]*)?)(?:\?[^"]*)?)"/gi,(_all,attr,path)=>`${attr}="${activePrefix}${path}"`)
        .replace(/"(endpoint|apiRoot|catalogueRoot)":\s*"(\/(?:api\/)?stores\/[^"]*)"/g,(_all,key,path)=>`"${key}":"${activePrefix}${path}"`);
    }
    res.writeHead(response.status,outgoing);res.end(body);
  }catch(error){
    console.error("Isolated billing preview failed",{code:error.code||"UNKNOWN",message:error.message});
    res.writeHead(503,{"content-type":"text/plain","cache-control":"no-store"});res.end("The isolated billing preview is unavailable.");
  }
  return true;
}
