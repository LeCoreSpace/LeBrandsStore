// Synthetic, in-memory dashboard fixture. Imported by Vite only, never Worker.
import {Readable} from "node:stream";
import {createSkuCheckoutFixture} from "./sku-checkout-fixture-data.js";
import {handleDashboard} from "./dashboard/routes.js";
import {orderInput} from "./checkout/input.js";
import {placeCodOrder} from "./checkout/repository.js";
import {sha256} from "./auth/passwords.js";
const prefix="/__inventory-preview";
const user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Inventory test owner"};
let fixture;
async function createFixture(){
  const f=await createSkuCheckoutFixture();
  await f.member.withMemberStore(f.id,f.token,async tx=>{
    for(const [sku,tracked,stock] of [["SIMPLE-SKU",true,5],["UNTRACKED-SKU",false,0]]){
      await tx`INSERT INTO products(store_id,title,description,slug,sku,price_paise,hsn_code,gst_rate,track_inventory,stock)
        VALUES(${f.id},${sku},'A synthetic product for isolated inventory checks.',${sku.toLowerCase()},${sku},10000,'6204',5,${tracked},${stock})`;
    }
  });
  return f;
}
export async function inventoryPreview(req,res,previewOrigin){
  const browser=new URL(req.url||"/",previewOrigin||`http://${req.headers.host}`);
  if(!browser.pathname.startsWith(`${prefix}/`))return false;
  try{
    const f=await(fixture||=createFixture().catch(e=>{fixture=null;throw e;}));
    const path=browser.pathname.slice(prefix.length);
    const origin="https://accounts.lebrands.store";
    if(req.method==="POST"&&![browser.origin,`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){
      res.statusCode=403;res.end("Fixture origin rejected");return true;
    }
    let response;
    if(path==="/state"&&req.method==="GET"){
      const stocks=(await f.pg.query("SELECT id,sku,stock FROM product_options WHERE store_id=$1 ORDER BY sort_order",[f.id])).rows;
      const audit=(await f.pg.query("SELECT action,metadata FROM audit_log WHERE store_id=$1 AND action='inventory.bulk_adjusted' ORDER BY created_at",[f.id])).rows;
      response=Response.json({stocks,audit});
    }else if(path==="/simulate-sale"&&req.method==="POST"){
      const input=orderInput({items:[{product_id:f.product.id,product_option_id:f.product.variants[0].id,quantity:1}],
        contact:{name:"Synthetic buyer",phone:"9000000000",email:""},
        address:{line1:"12 Test Street",city:"Chennai",state:"33",pincode:"600001"},
        idempotency_key:crypto.randomUUID(),receipt_token:crypto.randomUUID().replaceAll("-","").repeat(2)});
      const hash=await sha256(JSON.stringify(input)),receiptHash=await sha256(`${f.id}:${input.receipt_token}`);
      await f.db.withStore(f.id,tx=>placeCodOrder(tx,f.id,input,hash,receiptHash,"direct"));
      response=Response.json({changed_sku:"SKU-S-BLACK",quantity_sold:1});
    }else if(path==="/"||path==="/api/inventory"||path==="/api/inventory/bulk"){
      const api=path.startsWith("/api/");
      const target=`${origin}/${api?"api/":""}stores/${f.id}/inventory${path.endsWith("/bulk")?"/bulk":""}${browser.search}`;
      const headers=new Headers(req.headers);
      if(headers.has("origin"))headers.set("origin",origin);
      const init={method:req.method,headers};
      if(!["GET","HEAD"].includes(req.method))Object.assign(init,{body:Readable.toWeb(req),duplex:"half"});
      response=await handleDashboard(new Request(target,init),f.member,user,f.token);
    }else response=new Response("Unknown inventory fixture path",{status:404});
    res.statusCode=response.status;
    response.headers.forEach((v,k)=>res.setHeader(k,v));
    res.setHeader("cache-control","no-store");
    let body=await response.text();
    if(response.headers.get("content-type")?.includes("text/html")){
      body=body.replace('class="lb-app"',`class="lb-app" data-api-root="${prefix}/api" data-store-root="${prefix}"`)
        .replace(new RegExp(`href="/stores/${f.id}/inventory"`,"g"),`href="${prefix}/"`);
    }
    res.end(req.method==="HEAD"?undefined:body);
  }catch(error){
    console.error("Inventory fixture failed",{code:error.code||"FIXTURE_ERROR",message:error.message});
    res.statusCode=500;res.end("The isolated inventory fixture could not complete this request.");
  }
  return true;
}
