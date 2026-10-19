// Vite-only synthetic checkout, never a production Worker route.
import {Readable} from "node:stream";
import {createSkuCheckoutFixture} from "./sku-checkout-fixture-data.js";
import {renderAura,storefrontIcon} from "./public/aura.js";
import {STYLE_IDS} from "./public/aura-styles.js";
import {handleCheckout,isCheckoutPath} from "./checkout/routes.js";
import {liveAvailability} from "./store/availability.js";
import {handleDashboard} from "./dashboard/routes.js";
const prefix="/__sku-checkout-preview";
// Presentation-only sample photography. Never insert local/demo URLs into a
// real publication: the production DB correctly requires owned public media.
const demoImages=[
  {url:"/assets/img/aura-showcases/v01/editorial/aura-editorial-womens-clothing-p01-burgundy-silk-blouse-v01.webp",alt:"Illustrative sample garment photo"},
  {url:"/assets/img/aura-showcases/v01/editorial/aura-editorial-womens-clothing-lifestyle-l01-city-in-silk-v01.webp",alt:"Illustrative sample styling photo"},
];
let fixture;
export async function skuCheckoutPreview(req,res,previewOrigin){
  const browser=new URL(req.url||"/",previewOrigin||`http://${req.headers.host}`);
  if(!browser.pathname.startsWith(`${prefix}/`))return false;
  try{
    const f=await(fixture||=createSkuCheckoutFixture({offers:true}).catch(e=>{fixture=null;throw e;}));
    const requested=browser.searchParams.get("style");
    const remembered=String(req.headers.cookie||"").split(";").map(s=>s.trim()).find(s=>s.startsWith("skuPreviewStyle="))?.split("=")[1];
    const style=STYLE_IDS.includes(requested)?requested:STYLE_IDS.includes(remembered)?remembered:STYLE_IDS[0];
    if(STYLE_IDS.includes(requested))res.setHeader("set-cookie",`skuPreviewStyle=${style}; Path=${prefix}/; HttpOnly; SameSite=Lax`);
    const products=await f.db.withStore(f.id,tx=>liveAvailability(tx,f.id,f.data.products));
    const data={...f.data,products:products.map(p=>({...p,images:demoImages})),
      settings:{...f.data.settings,ann_design:{version:1,style,copy:{},media:{}}}};
    const path=browser.pathname.slice(prefix.length);
    let response;
    if((path==="/offers"||/^\/api\/stores\/[^/]+\/offers(?:\/[^/]+\/status)?$/.test(path))){
      const route=path==="/offers"?`/stores/${f.id}/offers`:path;
      const target=new URL(route,"https://accounts.lebrands.store"),headers=new Headers(req.headers);
      if(headers.has("origin")){
        if(![browser.origin,`http://${req.headers.host}`,`https://${req.headers.host}`].includes(headers.get("origin"))){
          res.statusCode=403;res.end("Synthetic fixture origin rejected");return true;
        }
        headers.set("origin",target.origin);
      }
      const init={method:req.method,headers};
      if(!["GET","HEAD"].includes(req.method))Object.assign(init,{body:Readable.toWeb(req),duplex:"half"});
      response=await handleDashboard(new Request(target,init),f.member,
        {id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Fixture Owner",email:"owner@example.invalid"},f.token);
    }else if(path==="/state"&&req.method==="GET"){
      const stocks=(await f.pg.query("SELECT id,product_id,sku,stock FROM product_options WHERE store_id=$1 ORDER BY sort_order",[f.id])).rows;
      const orders=(await f.pg.query("SELECT order_number,status,total_paise FROM orders WHERE store_id=$1 ORDER BY created_at",[f.id])).rows;
      const lines=(await f.pg.query("SELECT sku,option_snapshot,quantity,unit_price_paise FROM order_items WHERE store_id=$1 ORDER BY created_at",[f.id])).rows;
      response=new Response(JSON.stringify({stocks,orders,lines}),{headers:{"content-type":"application/json"}});
    }else if(path==="/sample-receipt"&&req.method==="GET"){
      const order={order_number:"DEMO-1042",status:"confirmed_cod",payment_method:"cod",
        created_at:"2026-10-19T08:00:00Z",subtotal_paise:24000,tax_paise:1143,shipping_paise:0,total_paise:24000,
        shipping_address:{name:"Example Customer",line1:"12 Test Street",city:"Chennai",state:"33",pincode:"600001"},
        items:[{title:"Cotton shirt",sku:"SKU-S-WHITE",option_snapshot:{Size:"S",Colour:"White"},
          quantity:2,unit_price_paise:12000,line_total_paise:24000}]};
      response=new Response(renderAura(data,{page:"confirmation",order,commerce:true}),{headers:{"content-type":"text/html"}});
    }else if(["/favicon.svg","/favicon.png","/favicon.ico","/apple-touch-icon.png"].includes(path)){
      response=new Response(storefrontIcon(data.settings).svg,{headers:{"content-type":"image/svg+xml"}});
    }else if(path==="/"||path===`/products/${f.product.slug}`){
      response=new Response(renderAura(data,{page:"product",productId:f.product.id,commerce:true}),{headers:{"content-type":"text/html"}});
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
        f.db,f.data.store,data,{verifyTurnstile:async()=>true});
    }else response=new Response("Unknown synthetic checkout path",{status:404});
    res.statusCode=response.status;
    response.headers.forEach((value,name)=>res.setHeader(name,value));
    res.setHeader("cache-control","no-store");
    let body=await response.text();
    if(response.headers.get("content-type")?.includes("text/html")){
      body=body.replace("data-commerce-config",`data-commerce-config data-api-root="${prefix}"`)
        .replace("data-offers-root",`data-offers-root data-api-root="${prefix}"`)
        .replace(/href="\/((?:cart|checkout|products|collections|orders|track)(?:[/?][^"]*)?)"/g,(_,path)=>`href="${prefix}/${path}${STYLE_IDS.includes(style)?`${path.includes("?")?"&":"?"}style=${style}`:""}"`)
        .replace(/href="\/(favicon\.(?:svg|png|ico)|apple-touch-icon\.png)/g,`href="${prefix}/$1`);
    }else if(response.headers.get("content-type")?.includes("application/json")){
      const json=JSON.parse(body);
      if(json.receipt_url)json.receipt_url=prefix+json.receipt_url;
      if(Array.isArray(json.items))json.items=json.items.map(item=>item.product_id===f.product.id?{...item,image_url:demoImages[0].url}:item);
      body=JSON.stringify(json);
    }
    res.end(req.method==="HEAD"?undefined:body);
  }catch(error){
    console.error("Synthetic SKU checkout fixture failed",{code:error.code||"FIXTURE_ERROR",message:error.message});
    res.statusCode=500;res.end("The isolated SKU checkout fixture could not complete the request.");
  }
  return true;
}
