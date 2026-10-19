// Development-only in-memory fixture. Never imported by the production Worker.
import {readFile} from "node:fs/promises";
import {Readable} from "node:stream";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "./ann-preview-fixture.js";
import {handleDashboard} from "./dashboard/routes.js";
import {handleStoreRoutes} from "./store/routes.js";
import {handleAnnRoutes} from "./store/ann-routes.js";
import {mediaUrl} from "./store/media.js";

const prefix="/__cogs-preview",id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Example cost owner"};
const token="a".repeat(64);
let database;
async function setup(){
  const pg=await setupAnnFixtureDatabase({sampleCatalogue:true,catalogueApi:true});
  try{
    await pg.exec(await readFile(new URL("../db/staged/0041_catalogue_cogs.sql",import.meta.url),"utf8"));
    const product=(await pg.query("SELECT id FROM products WHERE store_id=$1 LIMIT 1",[id])).rows[0].id;
    await pg.query("UPDATE products SET title='Synthetic cotton shirt',description='Synthetic fixture product only.' WHERE store_id=$1 AND id=$2",[id,product]);
    await pg.query(`UPDATE products SET catalogue='{"axes":[{"name":"Size","values":["S","M"]}]}'::jsonb WHERE store_id=$1 AND id=$2`,[id,product]);
    await pg.query(`INSERT INTO product_options(store_id,product_id,name,value,sku,attributes,stock,sort_order)
      VALUES($1,$2,'Size','S','SYN-COST-S','["S"]',3,0),($1,$2,'Size','M','SYN-COST-M','["M"]',4,1)`,[id,product]);
    const cup=(await pg.query(`INSERT INTO products(store_id,title,description,slug,sku,price_paise,stock,hsn_code,gst_rate)
      VALUES($1,'Synthetic ceramic cup','Synthetic fixture product only.','synthetic-cup','SYN-CUP',30000,8,'6912',5) RETURNING id`,[id])).rows[0].id;
    const photo=(await pg.query("SELECT id,object_key FROM media WHERE store_id=$1 AND upload_type='image' LIMIT 1",[id])).rows[0];
    await pg.query("SELECT set_config('app.store_id',$1,false)",[id]);
    await pg.query("INSERT INTO product_media(store_id,product_id,media_id) VALUES($1,$2,$3)",[id,cup,photo.id]);
    return{pg,db:annFixtureAdapter(pg),product,cup,photoUrl:mediaUrl(photo.object_key)};
  }catch(error){await pg.close();throw error;}
}
export async function cogsPreview(req,res,previewOrigin){
  const browser=new URL(req.url||"/",previewOrigin||`http://${req.headers.host}`);
  if(browser.pathname!==prefix&&!browser.pathname.startsWith(prefix+"/"))return false;
  try{
    const f=await(database||=setup().catch(error=>{database=null;throw error;}));
    const path=browser.pathname.slice(prefix.length)||"/cogs";
    if(!["GET","HEAD"].includes(req.method)&&![browser.origin,`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){
      res.statusCode=403;res.end("Fixture origin rejected");return true;
    }
    if(path==="/ann-product"){
      res.setHeader("content-type","text/html; charset=utf-8");res.setHeader("cache-control","no-store");
      res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Isolated Ann product form</title>
      <body style="margin:0"><p style="padding:12px">Synthetic Ann catalogue frame. No live data or publication.</p>
      <iframe title="Ann product form" style="border:0;width:100%;height:90vh" src="${prefix}/products/${f.cup}?embed=ann"></iframe></body></html>`);
      return true;
    }
    const api=path.startsWith("/api/");
    const target=api?`/api/stores/${id}${path.slice(4)}`:`/stores/${id}${path==="/"?"":path}`;
    if(!/^\/(?:api\/)?stores\/[^/]+(?:\/(?:cogs(?:\/[^/]+\/history)?|products(?:\/[^/]+)?|ann\/reference))?$/.test(target)){
      res.statusCode=404;res.end("Outside the isolated cost fixture.");return true;
    }
    const chunks=[];let length=0;
    for await(const chunk of req){length+=chunk.length;if(length>262144)throw new Error("Fixture request too large");chunks.push(chunk);}
    const body=chunks.length?Buffer.concat(chunks):null;
    const request=new Request(`https://accounts.lebrands.store${target}${browser.search}`,{
      method:req.method,headers:{...req.headers,origin:"https://accounts.lebrands.store"},
      ...(!["GET","HEAD"].includes(req.method)&&body?{body}:{}),
    });
    const readonly=browser.searchParams.get("readonly")==="1",actor=readonly?{id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}:user;
    const response=target.endsWith("/ann/reference")?await handleAnnRoutes(request,{},f.db,actor,readonly?"b".repeat(64):token):
      api&&["POST","PATCH","DELETE"].includes(req.method)&&target.includes("/products")?
      await handleStoreRoutes(request,{},f.db,actor,readonly?"b".repeat(64):token):
      await handleDashboard(request,f.db,actor,readonly?"b".repeat(64):token,{});
    res.statusCode=response.status;
    for(const[k,v]of response.headers)res.setHeader(k,v);
    if(response.headers.get("content-type")?.includes("text/html")){
      const html=(await response.text()).replaceAll(`/api/stores/${id}`,`${prefix}/api`).replaceAll(`/stores/${id}`,prefix)
        .replaceAll(f.photoUrl,"/img/ann-conversation-builder.webp")
        .replace("data-store-id=",`data-api-root="${prefix}/api" data-store-root="${prefix}" data-store-id=`);
      res.end(html);
    }else if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
  }catch(error){
    console.error("Isolated COGS preview failed",{code:error.code||"FIXTURE_ERROR"});
    res.statusCode=503;res.setHeader("content-type","text/plain");res.end("The synthetic cost fixture is unavailable.");
  }
  return true;
}
