import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {planUsage} from "../src/billing/usage.js";

// Compile postgres.js-style nested fragments for an isolated, real PostgreSQL
// query. Use actual foundational DDL, not invented table approximations.
function sqlFor(pg) {
  const sql=(parts,...args)=>{
    let text=parts[0];const values=[];
    args.forEach((arg,index)=>{
      if(arg?.fragment){
        const offset=values.length;
        text+=arg.text.replace(/\$(\d+)/g,(_,n)=>`$${Number(n)+offset}`);
        values.push(...arg.values);
      }else{values.push(arg);text+=`$${values.length}`;}
      text+=parts[index+1];
    });
    return {fragment:true,text,values,then:(ok,fail)=>pg.query(text,values).then(result=>result.rows).then(ok,fail)};
  };
  return sql;
}
test("usage aggregates actual published snapshots, uploaded bytes, staff and tenant-specific connection flags",async()=>{
  const pg=new PGlite();
  try{
    const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
    await pg.exec(await read("db/migrations/0001_init.sql"));
    const wizard=await read("db/migrations/0005_store_wizard.sql");
    await pg.exec(wizard.match(/CREATE TABLE public\.store_publications \([\s\S]*?\n\);/)[0]);
    const marketing=await read("db/staged/0050_marketing_integrations.sql");
    await pg.exec(marketing.match(/CREATE TABLE public\.store_marketing_integrations \([\s\S]*?\n\);/)[0]);
    const brand=(await pg.query("INSERT INTO brands(name,legal_name) VALUES('Fixture','Fixture') RETURNING id")).rows[0].id;
    const stores=(await pg.query("INSERT INTO stores(brand_id,name,subdomain) VALUES($1,'One','fixture-one'),($1,'Two','fixture-two') RETURNING store_id",[brand])).rows;
    const [a,b]=stores.map(s=>s.store_id);
    for(const [id,products] of [[a,[{id:"one",variants:[{},{}]},{id:"two"},{id:"three",variants:null}]],[b,[{id:"other",variants:[{},{},{},{}]}]]]){
      await pg.query("INSERT INTO store_publications(store_id,snapshot) VALUES($1,$2)",[id,JSON.stringify({products})]);
      await pg.query("INSERT INTO media(store_id,object_key,kind,content_type,size_bytes) VALUES($1,$2,'image','image/jpeg',$3)",[id,`stores/${id}/example.jpg`,id===a?1536:99999]);
    }
    await pg.query("INSERT INTO media(store_id,object_key,kind,content_type,size_bytes) VALUES($1,$2,'image','image/jpeg',1024)",[a,`stores/${a}/unpublished.jpg`]);
    await pg.query("INSERT INTO products(store_id,title,slug) VALUES($1,'Unpublished draft','unpublished')",[a]);
    for(const [index,role] of ["owner","admin","editor"].entries()){
      const user=(await pg.query("INSERT INTO users(name,email) VALUES('Fixture',$1) RETURNING id",[`user${index}@example.test`])).rows[0].id;
      await pg.query("INSERT INTO store_members(store_id,user_id,role) VALUES($1,$2,$3)",[a,user,role]);
    }
    await pg.query("INSERT INTO integrations(store_id,provider,status,credentials_ciphertext,metadata) VALUES($1,'razorpay','connected','NEVER_RETURN_THIS_SECRET',$2)",[a,JSON.stringify({mode:"test",enabled:true})]);
    await pg.query("INSERT INTO integrations(store_id,provider,status,credentials_ciphertext,metadata) VALUES($1,'shiprocket','connected','NEVER_RETURN_THIS_SECRET',$2)",[b,JSON.stringify({enabled:true})]);
    await pg.query("INSERT INTO domains(store_id,hostname,status) VALUES($1,'shop.example.test','active')",[a]);
    await pg.query("INSERT INTO store_marketing_integrations(store_id,meta_enabled,meta_pixel_id,google_enabled,ga4_measurement_id) VALUES($1,true,'123456789012345',true,'G-EXAMPLE1')",[a]);
    const customer=(await pg.query("INSERT INTO customers(store_id,name,phone) VALUES($1,'Fixture','0000000000') RETURNING id",[a])).rows[0].id;
    await pg.query(`INSERT INTO orders(store_id,customer_id,order_number,subtotal_paise,total_paise,shipping_address,created_at)
      VALUES($1,$2,'THIS-MONTH',0,0,'{}',now()),($1,$2,'PREVIOUS-MONTH',0,0,'{}',
      (date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '1 day')`,[a,customer]);
    const tx=sqlFor(pg),result=await planUsage(tx,a),other=await planUsage(tx,b);
    assert.equal(result.published_products,3);assert.equal(result.published_skus,4);
    assert.equal(result.public_media_bytes,2560);assert.equal(result.additional_staff_seats,2);
    assert.equal(result.monthly_order_soft_band,1);assert.equal(other.monthly_order_soft_band,0);
    assert.equal(result.payment.mode,"test");assert.equal(result.delivery,null);
    assert.equal(result.domain.hostname,"shop.example.test");
    assert.equal(result.social.meta,true);assert.equal(result.social.google,true);
    assert.equal(other.published_products,1);assert.equal(other.published_skus,4);
    assert.equal(other.public_media_bytes,99999);assert.equal(other.payment,null);
    assert.equal(other.delivery.status,"connected");assert.equal(other.domain,null);
    assert.doesNotMatch(JSON.stringify(result),/NEVER_RETURN|123456789012345|G-EXAMPLE1|credentials_ciphertext/);
    await pg.query("DELETE FROM store_publications WHERE store_id=$1",[a]);
    const empty=await planUsage(tx,a);
    assert.equal(empty.published_products,0);assert.equal(empty.published_skus,0);
    await pg.exec("DROP TABLE store_marketing_integrations");
    const unavailable=await planUsage(tx,a);
    assert.equal(unavailable.social_available,false);assert.equal(unavailable.social,null);
    assert.equal(unavailable.public_media_bytes,2560);
  }finally{await pg.close();}
});
