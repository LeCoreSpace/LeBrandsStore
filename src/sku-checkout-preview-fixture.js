// Vite-only synthetic checkout, never a production Worker route.
import {Readable} from "node:stream";
import {createSkuCheckoutFixture} from "./sku-checkout-fixture-data.js";
import {renderAura} from "./public/aura.js";
import {handleCheckout,isCheckoutPath} from "./checkout/routes.js";
const prefix="/__sku-checkout-preview";
let fixture;
export async function skuCheckoutPreview(req,res,previewOrigin){
  const browser=new URL(req.url||"/",previewOrigin||`http://${req.headers.host}`);
  if(!browser.pathname.startsWith(`${prefix}/`))return false;
  try{
    const f=await(fixture||=createSkuCheckoutFixture().catch(e=>{fixture=null;throw e;}));
    const path=browser.pathname.slice(prefix.length);
    let response;
    if(path==="/state"&&req.method==="GET"){
      const stocks=(await f.pg.query("SELECT id,product_id,sku,stock FROM product_options WHERE store_id=$1 ORDER BY sort_order",[f.id])).rows;
      const orders=(await f.pg.query("SELECT order_number,status,total_paise FROM orders WHERE store_id=$1 ORDER BY created_at",[f.id])).rows;
      const lines=(await f.pg.query("SELECT sku,option_snapshot,quantity,unit_price_paise FROM order_items WHERE store_id=$1 ORDER BY created_at",[f.id])).rows;
      response=new Response(JSON.stringify({stocks,orders,lines}),{headers:{"content-type":"application/json"}});
    }else if(path==="/"||path===`/products/${f.product.slug}`){
      response=new Response(renderAura(f.data,{page:"product",productId:f.product.id,commerce:true}),{headers:{"content-type":"text/html"}});
    }else if(isCheckoutPath(path)){
      const target=new URL(`https://${f.data.store.subdomain}.lebrands.store${path}${browser.search}`);
      const headers=new Headers(req.headers);
      if(headers.has("origin")){
        if(![browser.origin,`http://${req.headers.host}`,`https://${req.headers.host}`].includes(headers.get("origin"))){
          res.statusCode=403;res.end("Synthetic fixture origin rejected");return true;
        }
        headers.set("origin",target.origin);
      }
      const init={method:req.method,headers};
      if(!["GET","HEAD"].includes(req.method))Object.assign(init,{body:Readable.toWeb(req),duplex:"half"});
      // Public Cloudflare test site key; validation injection is confined here.
      response=await handleCheckout(new Request(target,init),
        {TURNSTILE_SITE_KEY:"1x00000000000000000000AA",SESSION_SECRET:"isolated-sku-checkout-test-secret-not-production"},
        f.db,f.data.store,f.data,{verifyTurnstile:async()=>true});
    }else response=new Response("Unknown synthetic checkout path",{status:404});
    res.statusCode=response.status;
    response.headers.forEach((value,name)=>res.setHeader(name,value));
    res.setHeader("cache-control","no-store");
    let body=await response.text();
    if(response.headers.get("content-type")?.includes("text/html")){
      body=body.replace("data-commerce-config",`data-commerce-config data-api-root="${prefix}"`)
        .replace(/href="\/(cart|checkout|products|collections|orders)(?=[/"])/g,`href="${prefix}/$1`);
    }else if(response.headers.get("content-type")?.includes("application/json")){
      const json=JSON.parse(body);
      if(json.receipt_url)json.receipt_url=prefix+json.receipt_url;
      body=JSON.stringify(json);
    }
    res.end(req.method==="HEAD"?undefined:body);
  }catch(error){
    console.error("Synthetic SKU checkout fixture failed",{code:error.code||"FIXTURE_ERROR",message:error.message});
    res.statusCode=500;res.end("The isolated SKU checkout fixture could not complete the request.");
  }
  return true;
}
