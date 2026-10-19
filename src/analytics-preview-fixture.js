// Isolated synthetic PostgreSQL data. Imported by Node preview/tests, never Worker.
import {readFile} from "node:fs/promises";
import {Readable} from "node:stream";
import {createSkuCheckoutFixture} from "./sku-checkout-fixture-data.js";
import {orderInput} from "./checkout/input.js";
import {placeCodOrder} from "./checkout/repository.js";
import {saveCosts} from "./dashboard/cogs.js";
import {handleDashboard} from "./dashboard/routes.js";

export async function createAnalyticsFixture({now=new Date(),migrate=true}={}){
  const f=await createSkuCheckoutFixture();
  try{
    await f.pg.query("UPDATE public.product_options SET stock=100 WHERE store_id=$1",[f.id]);
    const year=now.getUTCFullYear(),month=now.getUTCMonth(),monthStart=new Date(Date.UTC(year,month,1));
    const orders=[];
    async function order(kind,day,extra={}){
      const variant=f.product.variants[extra.variant??0];
      const input=orderInput({items:[{product_id:f.product.id,product_option_id:variant.id,quantity:1}],
        contact:{name:"Synthetic analytics customer",phone:String(9000000000+orders.length),email:"analytics@example.invalid"},
        address:{line1:"12 Test Street",city:"Chennai",state:"33",pincode:"600001"},
        idempotency_key:crypto.randomUUID(),receipt_token:crypto.randomUUID().replaceAll("-","")+"e".repeat(32)});
      const result=await f.db.withStore(f.id,tx=>placeCodOrder(tx,f.id,input,crypto.randomUUID().replaceAll("-","").repeat(2),crypto.randomUUID().replaceAll("-","").repeat(2),"direct"));
      const[created]=(await f.pg.query("SELECT id FROM public.orders WHERE store_id=$1 AND order_number=$2",[f.id,result.order_number])).rows;
      if(!created)throw Error("The synthetic order was not created.");
      const timestamp=extra.at||new Date(Date.UTC(year,month,day,9)).toISOString();
      await f.pg.query(`UPDATE public.orders SET created_at=$1,status=$2,currency=$3,
        discount_paise=$4,total_paise=total_paise-$4 WHERE store_id=$5 AND id=$6`,
        [timestamp,extra.status||"confirmed_cod",extra.currency||"INR",extra.discount||0,f.id,created.id]);
      orders.push({kind,id:created.id});
    }
    await order("historical",2);
    if(migrate){
      await f.pg.exec(await readFile(new URL("../db/staged/0041_catalogue_cogs.sql",import.meta.url),"utf8"));
      await f.pg.exec(await readFile(new URL("../db/staged/0042_commerce_analytics.sql",import.meta.url),"utf8"));
      await f.member.withMemberStore(f.id,f.token,tx=>saveCosts(tx,f.id,f.token,{changes:[
        {product_id:f.product.id,product_option_id:null,cost_price_paise:3200,expected_revision:0},
        {product_id:f.product.id,product_option_id:f.product.variants[1].id,cost_price_paise:0,expected_revision:0},
      ]}));
      await order("known",3);
      await order("zero",4,{variant:1});
      await order("discounted",5,{discount:100});
      await order("returned",6,{status:"returned"});
      await order("cancelled",7,{status:"cancelled"});
      await order("pending",8,{status:"pending_payment"});
      await order("other_currency",9,{currency:"USD"});
      await order("start_boundary",1,{at:new Date(+monthStart-19800000).toISOString()});
      await order("before_start",1,{at:new Date(+monthStart-19800001).toISOString()});
      await order("end_boundary",1,{at:new Date(Date.UTC(year,month+1,1)-19800000).toISOString()});
    }
    return{...f,orders};
  }catch(error){await f.pg.close();throw error;}
}

let fixture;
export async function analyticsPreview(req,res,origin="http://localhost"){
  const prefix="/__analytics-preview",url=new URL(req.url,origin);
  if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+"/"))return false;
  try{
    fixture??=createAnalyticsFixture().catch(error=>{fixture=undefined;throw error;});
    const f=await fixture,tail=url.pathname.slice(prefix.length)||"/analytics",api=tail.startsWith("/api/");
    const target=api?`/api/stores/${f.id}${tail.slice(4)}`:`/stores/${f.id}${tail}`;
    const readonly=url.searchParams.get("readonly")==="1";
    const request=new Request(`${origin}${target}${url.search}`,{method:req.method,headers:req.headers});
    const response=await handleDashboard(request,f.member,
      {id:readonly?"cccccccc-cccc-4ccc-8ccc-cccccccccccc":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},
      readonly?"b".repeat(64):f.token,{});
    res.statusCode=response.status;
    for(const[k,v]of response.headers)res.setHeader(k,v);
    if(response.headers.get("content-type")?.includes("text/html")){
      res.end((await response.text()).replaceAll(`/api/stores/${f.id}`,`${prefix}/api`).replaceAll(`/stores/${f.id}`,prefix)
        .replace("data-store-id=",`data-api-root="${prefix}/api" data-store-root="${prefix}" data-store-id=`));
    }else if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
  }catch(error){
    console.error("Synthetic analytics preview failed",{code:error.code||"FIXTURE_ERROR",message:error.message});
    res.statusCode=503;res.setHeader("content-type","text/plain");res.end("The synthetic analytics preview is unavailable.");
  }
  return true;
}
