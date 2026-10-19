// Isolated development/test data. Never imported by the production Worker.
import {readFile} from "node:fs/promises";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "./ann-preview-fixture.js";
import {handleStoreRoutes} from "./store/routes.js";
import {storefrontProduct} from "./public/product-details.js";
export async function createSkuCheckoutFixture({offers=false}={}){
  const pg=await setupAnnFixtureDatabase({catalogueApi:true,verifiedBusiness:true});
  try{
  await pg.exec(await readFile(new URL("../db/staged/0029_sku_checkout.sql",import.meta.url),"utf8"));
  if(offers)await pg.exec(await readFile(new URL("../db/staged/0044_store_offers.sql",import.meta.url),"utf8"));
  if(offers)await pg.exec(await readFile(new URL("../db/staged/0045_checkout_email_auth.sql",import.meta.url),"utf8"));
  const member=annFixtureAdapter(pg),id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",token="a".repeat(64);
  const axes=[{name:"Size",values:["S","M"]},{name:"Colour",values:["Black","White"]}];
  const response=await handleStoreRoutes(new Request(`https://accounts.lebrands.store/api/stores/${id}/products`,{
    method:"POST",headers:{origin:"https://accounts.lebrands.store","content-type":"application/json"},
    body:JSON.stringify({title:"SKU test shirt",description:"A fictional cotton shirt for isolated checkout verification only.",
      slug:"sku-test-shirt",sku:"SKU-BASE",price_paise:10000,hsn_code:"6204",gst_rate:5,
      catalogue:{axes},variants:axes[0].values.flatMap((s,i)=>axes[1].values.map((c,j)=>({
        values:[s,c],sku:`SKU-${s}-${c.toUpperCase()}`,stock:[2,3,0,1][i*2+j],
        price_paise:i===0&&j===1?12000:null,
      })))}),
  }),{},member,{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},token);
  const draft=await response.json();
  if(response.status!==200)throw Error(`SKU fixture product setup failed: ${JSON.stringify(draft)}`);
  const product=draft.products.find(p=>p.id===draft.saved_product_id);
  product.status="active";
  const data={...draft,store:{...draft.store,status:"live"},products:[storefrontProduct(product)],
    settings:{...draft.settings,brand_name:"SKU Test Store"},policies:[]};
  await pg.transaction(async trx=>{
    await trx.query("SELECT set_config('app.store_id',$1,true)",[id]);
    await trx.query("UPDATE stores SET approved_at=now(),approved_by='Synthetic fixture reviewer',status='live' WHERE store_id=$1",[id]);
    await trx.query("UPDATE products SET status='active' WHERE store_id=$1 AND id=$2",[id,product.id]);
    await trx.query("INSERT INTO store_publications(store_id,snapshot) VALUES($1,$2)",[id,JSON.stringify(data)]);
    await trx.query("INSERT INTO checkout_settings(store_id,settings) VALUES($1,$2) ON CONFLICT(store_id) DO UPDATE SET settings=EXCLUDED.settings",
      [id,JSON.stringify({cod_enabled:true,store_state:"33",delivery_mode:"free"})]);
  });
  // Serialize transactions exactly as the store row lock does in PostgreSQL.
  let tail=Promise.resolve();
  const db={withStore:(storeId,fn)=>{
    const run=()=>pg.transaction(async trx=>{
      await trx.exec("SET LOCAL ROLE lebrands_app");
      await trx.query("SELECT set_config('app.store_id',$1,true)",[storeId]);
      const tx=async(parts,...values)=>(await trx.query(parts.reduce((sql,part,i)=>sql+(i?`$${i}`:"")+part,""),values)).rows;
      tx.json=value=>JSON.stringify(value);
      return fn(tx);
    });
    const result=tail.then(run);tail=result.catch(()=>{});return result;
  }};
  return{pg,db,member,data,product,id,token};
  }catch(error){await pg.close();throw error;}
}
