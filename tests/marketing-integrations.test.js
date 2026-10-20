import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";
import{PGlite}from"@electric-sql/pglite";
import{MARKETING_DEFAULTS,validateMarketing,publicMarketing,purchasePayload,contactHashes}from"../src/marketing/rules.js";
import{sealCredentials,openCredentials}from"../src/connections/providers.js";
import{sendMetaEvent}from"../src/marketing/meta.js";
import{signConsent,consentVisitor,purchaseContext}from"../src/marketing/consent.js";
import{injectMarketing,withStoreMarketing}from"../src/marketing/storefront.js";
import{eventPayloads,safePageLocation,checkoutEventAllowed,validPurchasePayload}from"../src/public/store-tracking.js";
import{handleMarketingDashboard}from"../src/dashboard/marketing-routes.js";
import{processMarketingStore}from"../src/marketing/worker.js";
import{sha256}from"../src/auth/passwords.js";
import{readMarketing,saveMarketing,metaToken,settingsResult}from"../src/marketing/service.js";
import{migrationSelection}from"../db/migration-selection.js";
test("manual marketing migration selects only the reviewed additive file",()=>{
  assert.deepEqual(migrationSelection(["--staged-marketing-integrations"]),{
    staged:true,filename:"0050_marketing_integrations.sql",requires:"0018_commerce_runtime.sql"
  });
});
const A="10000000-0000-4000-8000-000000000001",B="20000000-0000-4000-8000-000000000001",V="30000000-0000-4000-8000-000000000001";
const env={SESSION_SECRET:"isolated-test-encryption-material-not-a-secret"},pixel="123456789012345";
test("minimal setup, strict input formats and optional advanced dependencies",()=>{
  assert.equal(validateMarketing({...MARKETING_DEFAULTS,meta_enabled:true,meta_pixel_id:pixel}).meta_enabled,true);
  for(const settings of[
    {meta_enabled:true},{google_enabled:true,google_ads_id:"AW-123456789"},
    {meta_domain_verification:'"><script>'},{google_label_purchase:"label"},
    {google_enhanced_conversions:true},{meta_enabled:"yes"},{store_id:B}
  ])assert.throws(()=>validateMarketing({...MARKETING_DEFAULTS,...settings}),{status:400});
  assert.equal(validateMarketing({...MARKETING_DEFAULTS,google_enabled:true,ga4_measurement_id:"G-ABC1234567"}).google_enabled,true);
  assert.equal(publicMarketing({meta_capi_token_encrypted:"NEVER_PUBLIC",meta_token_hint:"abcd"}).meta_capi_token_encrypted,undefined);
});
test("tokens stay encrypted and tenant/provider-bound",async()=>{
  const encrypted=await sealCredentials(env.SESSION_SECRET,A,"meta-marketing",{token:"test-token-not-for-real-use"});
  assert.ok(!encrypted.includes("test-token"));
  assert.equal((await openCredentials(env.SESSION_SECRET,A,"meta-marketing",encrypted)).token,"test-token-not-for-real-use");
  await assert.rejects(openCredentials(env.SESSION_SECRET,B,"meta-marketing",encrypted));
  await assert.rejects(openCredentials(env.SESSION_SECRET,A,"razorpay",encrypted));
});
test("hashed matching data uses correct Meta versus Google phone formats; no plaintext",async()=>{
  const hashes=await contactHashes(" Te.St@Gmail.com ","9000000000");
  assert.match(hashes.meta.em[0],/^[a-f0-9]{64}$/);
  assert.notEqual(hashes.meta.em[0],hashes.google.sha256_email_address);
  assert.notEqual(hashes.meta.ph[0],hashes.google.sha256_phone_number);
  assert.ok(!JSON.stringify(hashes).includes("9000000000"));
});
test("stable purchase identities, correct totals and mapped browser/server events",()=>{
  const data=purchasePayload({store_id:A,order_number:"DEM-1",tracking_event_id:V,total_paise:12800,tax_paise:1800,shipping_paise:1000,payment_method:"cod"},
    [{tracking_product_id:"immutable-sku",product_id:null,title:"Tote",quantity:2,total_paise:11800,tax_paise:1800}]);
  assert.equal(data.value,128);assert.equal(data.google_value,100);assert.equal(data.items[0].price,50);
  assert.equal(data.items[0].item_id,"immutable-sku");assert.equal(data.transaction_id,`${A}:DEM-1`);
  const mapped=eventPayloads("purchase",data);assert.equal(mapped.meta.name,"Purchase");assert.equal(mapped.meta.id,V);
  assert.equal(mapped.meta.data.value,128);assert.equal(mapped.google.value,100);
  for(const[name,event]of Object.entries({page_view:"PageView",view_item:"ViewContent",add_to_cart:"AddToCart",begin_checkout:"InitiateCheckout",search:"Search"}))
    assert.equal(eventPayloads(name).meta.name,event);
  assert.equal(eventPayloads("place_order").meta,null);
  assert.equal(safePageLocation(new URL(`https://demo.example/orders/${"a".repeat(64)}?email=private#secret`)),"https://demo.example/checkout/complete");
});
test("checkout events are only allowed on checkout with a validated, non-empty cart",()=>{
  const cart={items:[{item_id:V,quantity:1}]};
  for(const page of["home","product","collection","cart","confirmation",undefined])assert.equal(checkoutEventAllowed(page,cart),false);
  assert.equal(checkoutEventAllowed("checkout",cart),true);
  assert.equal(checkoutEventAllowed("checkout",cart,true),false);
  assert.equal(checkoutEventAllowed("checkout",{items:[]}),false);
  assert.equal(checkoutEventAllowed("checkout",null),false);
});
test("missing/malformed or another order's receipt data can never produce an empty purchase",()=>{
  const packet=purchasePayload({store_id:A,order_number:"DEMO-1",tracking_event_id:V,total_paise:11800,tax_paise:1800,shipping_paise:0},
    [{product_id:B,title:"Tote",quantity:1,total_paise:11800,tax_paise:1800}]);
  assert.equal(validPurchasePayload(packet,V,A),true);
  for(const data of[null,{}, {purchase:null},{event_id:V}, {...packet,event_id:B},{...packet,value:NaN},{...packet,items:[]},{...packet,transaction_id:`${B}:DEMO-1`}])
    assert.equal(validPurchasePayload(data,V,A),false);
});
test("Meta calls are fixed-origin POSTs, bounded, tested without network and redact provider errors",async()=>{
  let calls=0;
  await sendMetaEvent(pixel,"fake-token-for-unit-test-only",{event_name:"PageView"},"TEST123",async(url,opts)=>{
    calls++;assert.match(url,/^https:\/\/graph\.facebook\.com\/v25\.0\/\d+\/events$/);
    assert.equal(opts.redirect,"manual");assert.equal(JSON.parse(opts.body).test_event_code,"TEST123");
    assert.ok(!url.includes("fake-token"));return Response.json({events_received:1});
  });assert.equal(calls,1);
  await assert.rejects(sendMetaEvent(pixel,"fake-token-for-unit-test-only",{},"",async()=>Response.json({error:"SENSITIVE"},{status:400})),e=>!e.message.includes("SENSITIVE")&&e.status===502);
  await assert.rejects(sendMetaEvent(pixel,"fake-token-for-unit-test-only",{},"",async()=>Response.json({events_received:0})),{status:502});
});
test("signed consent is store-bound, cannot be forged, and uses an expiring host cookie",async()=>{
  const signed=await signConsent(A,V,env);
  const req=value=>new Request("https://demo.example/",{headers:{cookie:`__Host-lb-marketing=${encodeURIComponent(value)}`}});
  assert.equal(await consentVisitor(req(signed),A,env),V);
  assert.equal(await consentVisitor(req(signed),B,env),null);
  assert.equal(await consentVisitor(req(signed.slice(0,-1)+(signed.endsWith("a")?"b":"a")),A,env),null);
});
test("disabled integrations inject no scripts; verification codes are escaped and preview is inert",async()=>{
  const html="<html><head></head><body>Store</body></html>";
  assert.equal(injectMarketing(html,MARKETING_DEFAULTS,{}),html);
  const enabled={...MARKETING_DEFAULTS,meta_enabled:true,meta_pixel_id:pixel,meta_domain_verification:'"><script>'};
  const result=injectMarketing(html,enabled,{storeId:A,revision:"1",customDomain:false});
  assert.ok(!result.includes("facebook-domain-verification"));assert.ok(!result.includes("fbevents.js"));
  assert.match(result,/store-tracking.js/);
  const custom=injectMarketing(html,enabled,{storeId:A,customDomain:true});
  assert.ok(custom.includes("&quot;&gt;&lt;script&gt;"));
  const response=await withStoreMarketing(new Request("https://demo.example/"),{withStore(){throw Error("must not read");}},
    {store_id:A},{PREVIEW_LIVE_DATABASE:"enabled"},async()=>new Response(html));
  assert.equal(await response.text(),html);
});
test("optional tracking failures never replay a core checkout operation; receipt access survives disabling tracking",async()=>{
  const row={...MARKETING_DEFAULTS,meta_enabled:true,meta_pixel_id:pixel,store_id:A,revision:"1"};
  const db={withStore:async(_,fn)=>fn(async(strings)=>strings.join("").includes("to_regclass")?[{ready:true}]:[row])};
  let called=0;
  await assert.rejects(withStoreMarketing(new Request("https://demo.example/api/checkout/order",{method:"POST",body:"{}"}),db,{store_id:A},env,async()=>{
    called++;throw Error("core checkout failure");
  }),/core checkout failure/);
  assert.equal(called,1);
  Object.assign(row,MARKETING_DEFAULTS);
  const other=crypto.randomUUID(),cookies=`__Host-lb-order-${V}=${A}:${"a".repeat(64)}; __Host-lb-order-${other}=${A}:${"b".repeat(64)}`;
  for(const[id,token]of[[V,"a"],[other,"b"]]){
    await withStoreMarketing(new Request(`https://demo.example/checkout/complete/${id}`,{headers:{cookie:cookies}}),db,{store_id:A},env,async(_,request)=>{
      assert.equal(new URL(request.url).pathname,`/orders/${token.repeat(64)}`);return new Response("Order");
    });
  }
});
test("dashboard rejects missing sign-in, cross-origin and unsupported methods before data mutation",async()=>{
  const db={withMemberStore(){throw Error("unexpected database access");}};
  const url=`https://app.example/api/stores/${A}/marketing-integrations`;
  assert.equal((await handleMarketingDashboard(new Request(url),db,null,"",env)).status,401);
  assert.equal((await handleMarketingDashboard(new Request(url,{method:"POST",body:"{}",headers:{origin:"https://evil.example"}}),db,{id:V},"",env)).status,403);
  assert.equal((await handleMarketingDashboard(new Request(url,{method:"DELETE"}),db,{id:V},"",env)).status,405);
});
// Real foundational DDL, one bounded in-memory PostgreSQL instance. Never Supabase.
test("real migration compiles; consent, COD/paid triggers, RLS, dedupe, worker retry and retention enforce boundaries",async()=>{
  const pg=new PGlite();
  // Object-helper expansion mirrors postgres.js INSERT/SET syntax; SQL is
  // actually compiled/executed by PostgreSQL, not matched to canned results.
  const tag=(strings,...args)=>{
    if(!Array.isArray(strings))return{helper:strings};
    let sql=strings[0],params=[];
    const param=v=>{params.push(v);return`$${params.length}`};
    args.forEach((v,i)=>{
      if(v?.helper){
        const entries=Object.entries(v.helper),update=/SET\s*$/i.test(sql);
        sql+=update?entries.map(([k,value])=>`"${k}"=${param(value)}`).join(","):
          `(${entries.map(([k])=>`"${k}"`).join(",")}) VALUES (${entries.map(([,value])=>param(value)).join(",")})`;
      }else sql+=param(v);
      sql+=strings[i+1];
    });
    return pg.query(sql,params).then(result=>result.rows);
  };
  const db={withStore:async(id,fn)=>{
    await pg.exec("BEGIN");try{await pg.query("SELECT set_config('app.store_id',$1,true)",[id]);const r=await fn(tag);await pg.exec("COMMIT");return r;}
    catch(e){await pg.exec("ROLLBACK");throw e;}
  }};
  try{
    await pg.exec("CREATE ROLE lebrands_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;");
    // Same migration registry DDL as db/migrate.js.
    await pg.exec("CREATE TABLE public.schema_migrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),filename text NOT NULL UNIQUE,checksum text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());");
    for(const path of["db/migrations/0001_init.sql","db/migrations/0002_rls.sql","db/migrations/0006_cod_checkout.sql","db/staged/0018_commerce_runtime.sql","db/staged/0050_marketing_integrations.sql"])
      await pg.exec(await readFile(path,"utf8"));
    const brand=(await pg.query("INSERT INTO brands(name,legal_name) VALUES('Demo','Demo') RETURNING id")).rows[0].id;
    for(const[id,sub]of[[A,"demostore"],[B,"secondstore"]])await pg.query("INSERT INTO stores(store_id,brand_id,subdomain,name,status) VALUES($1,$2,$3,'Demo','live')",[id,brand,sub]);
    const customer=(await pg.query("INSERT INTO customers(store_id,name,phone) VALUES($1,'Demo buyer','+919000000000') RETURNING id",[A])).rows[0].id;
    const ciphertext=await sealCredentials(env.SESSION_SECRET,A,"meta-marketing",{token:"fake-token-for-unit-test-only"});
    await pg.query("INSERT INTO store_marketing_integrations(store_id,meta_enabled,meta_pixel_id,meta_capi_token_encrypted) VALUES($1,true,$2,$3)",[A,pixel,ciphertext]);
    const rev=(await pg.query("SELECT updated_at::text AS r FROM store_marketing_integrations WHERE store_id=$1",[A])).rows[0].r;
    await pg.query("INSERT INTO store_marketing_consents(store_id,visitor_id,revision,ads,analytics) VALUES($1,$2,$3,true,true)",[A,V,rev]);
    const insert=async(method,context=true)=>{
      const id=crypto.randomUUID(),token=id.replace(/-/g,"").repeat(2),hash=await sha256(`${A}:${token}`);
      await db.withStore(A,async tx=>{
        if(context)await tx`SELECT set_config('app.marketing_context',${JSON.stringify({visitor_id:V,user_data:await contactHashes("test@example.invalid","+919000000000"),source_url:"https://demo.example/checkout"})},true)`;
        await tx`INSERT INTO orders(id,store_id,customer_id,order_number,status,payment_method,subtotal_paise,total_paise,shipping_address,confirmation_hash)
          VALUES(${id},${A},${customer},${id.slice(0,8)},${method==="cod"?"confirmed_cod":"pending_payment"},${method},10000,10000,'{}',${hash})`;
        await tx`INSERT INTO order_items(store_id,order_id,title,quantity,unit_price_paise,total_paise) VALUES(${A},${id},'Tote',1,10000,10000)`;
      });return{id,hash:token};
    };
    const cod=await insert("cod"),online=await insert("online"),unconsented=await insert("cod",false);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM store_marketing_jobs")).rows[0].n,1);
    assert.ok((await pg.query("SELECT tracking_confirmed_at FROM orders WHERE id=$1",[cod.id])).rows[0].tracking_confirmed_at);
    assert.equal((await pg.query("SELECT tracking_consent_id FROM orders WHERE id=$1",[unconsented.id])).rows[0].tracking_consent_id,null);
    await db.withStore(A,async tx=>{const[r]=await tx`SELECT public.marketing_purchase_eligible(${A},${online.id}) AS ready`;assert.equal(r.ready,false);});
    await pg.exec("SET ROLE lebrands_app");
    await db.withStore(B,async tx=>assert.equal((await tx`SELECT * FROM store_marketing_integrations`).length,0));
    await assert.rejects(db.withStore(B,tx=>tx`INSERT INTO store_marketing_consents(store_id,visitor_id,revision) VALUES(${A},${crypto.randomUUID()},'forbidden')`),{code:"42501"});
    await pg.exec("RESET ROLE");
    const privileges=await pg.query("SELECT has_function_privilege('anon','public.list_marketing_work()','EXECUTE') AS allowed");
    assert.equal(privileges.rows[0].allowed,false);
    let sent=0;
    await processMarketingStore(db,A,env,async(url,opts)=>{
      sent++;const e=JSON.parse(opts.body).data[0];assert.equal(e.event_name,"Purchase");assert.equal(e.custom_data.value,100);assert.match(e.user_data.em[0],/^[a-f0-9]{64}$/);
      assert.ok(!opts.body.includes("test@example.invalid"));return Response.json({events_received:1});
    });
    assert.equal(sent,1);assert.ok((await pg.query("SELECT meta_capi_sent_at FROM orders WHERE id=$1",[cod.id])).rows[0].meta_capi_sent_at);
    await processMarketingStore(db,A,env,()=>{throw Error("duplicate delivery");});assert.equal(sent,1);
    await db.withStore(A,tx=>tx`UPDATE orders SET status='processing' WHERE store_id=${A} AND id=${cod.id}`);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM store_marketing_jobs")).rows[0].n,1);
    // Browser purchase is separately authorized by the private receipt and consent.
    const consent={visitor_id:V,analytics:true,ads:true};
    assert.equal(await purchaseContext(new Request("https://demo.example"),db,A,{revision:rev},consent,{receipt_token:online.hash}),null);
    const packet=await purchaseContext(new Request("https://demo.example"),db,A,{revision:rev},consent,{receipt_token:cod.hash});
    assert.ok(packet.order.tracking_event_id);
    await purchaseContext(null,db,A,{revision:rev},consent,{receipt_token:cod.hash,event_id:packet.order.tracking_event_id},true);
    assert.equal(await purchaseContext(null,db,A,{revision:rev},consent,{receipt_token:cod.hash}),null);
    // A bare paid status is not payment evidence.
    await db.withStore(A,tx=>tx`UPDATE orders SET status='paid' WHERE store_id=${A} AND id=${online.id}`);
    assert.equal(await purchaseContext(null,db,A,{revision:rev},consent,{receipt_token:online.hash}),null);
    await db.withStore(A,async tx=>{
      await tx`INSERT INTO payment_attempts(store_id,order_id,provider_order_id,credentials_ciphertext,state,captured_payment_id)
        VALUES(${A},${online.id},'order_isolated_test','not-a-real-credential','captured','pay_isolated_test')`;
      await tx`INSERT INTO payments(store_id,order_id,provider,provider_payment_id,status,amount_paise,currency)
        VALUES(${A},${online.id},'razorpay','pay_isolated_test','captured',10000,'INR')`;
      await tx`UPDATE orders SET status='paid' WHERE store_id=${A} AND id=${online.id}`;
    });
    assert.ok(await purchaseContext(null,db,A,{revision:rev},consent,{receipt_token:online.hash}));
    let onlineSent=0;
    await processMarketingStore(db,A,env,async()=>{onlineSent++;return Response.json({events_received:1});});
    assert.equal(onlineSent,1);
    const retry=await insert("cod");
    await processMarketingStore(db,A,env,async()=>new Response("provider down",{status:503}));
    assert.equal((await pg.query("SELECT status FROM store_marketing_jobs WHERE order_id=$1",[retry.id])).rows[0].status,"pending");
    await pg.query("UPDATE store_marketing_consents SET ads=false WHERE store_id=$1",[A]);
    await pg.query("UPDATE store_marketing_jobs SET next_attempt_at=now() WHERE order_id=$1",[retry.id]);
    await processMarketingStore(db,A,env,()=>{throw Error("withdrawn consent must not contact Meta");});
    assert.equal((await pg.query("SELECT status FROM store_marketing_jobs WHERE order_id=$1",[retry.id])).rows[0].status,"cancelled");
    await db.withStore(A,async tx=>{
      const current=await readMarketing(tx,A);
      const saved=await saveMarketing(tx,A,{settings:publicMarketing(current),expected_revision:current.revision,meta_capi_token:"replacement_test_token_1234"},env);
      assert.equal(saved.meta_token_hint,"1234");assert.equal(await metaToken(saved,env),"replacement_test_token_1234");
      assert.notEqual(saved.revision,current.revision);
      assert.ok(!JSON.stringify(settingsResult(saved,true,{status:"live",subdomain:"demo"})).includes("replacement_test"));
      const preserved=await saveMarketing(tx,A,{settings:publicMarketing(saved),expected_revision:saved.revision,meta_capi_token:""},env);
      assert.equal(preserved.meta_capi_token_encrypted,saved.meta_capi_token_encrypted);
    });
    const current=await db.withStore(A,tx=>readMarketing(tx,A));
    await assert.rejects(db.withStore(A,tx=>saveMarketing(tx,A,{settings:publicMarketing(current),expected_revision:"stale"},env)),{status:409});
    const removed=await db.withStore(A,tx=>saveMarketing(tx,A,{settings:publicMarketing(current),expected_revision:current.revision,remove_meta_capi_token:true},env));
    assert.equal(removed.meta_capi_token_encrypted,null);assert.equal(removed.meta_token_hint,"");
    const created=await db.withStore(B,tx=>saveMarketing(tx,B,{settings:MARKETING_DEFAULTS,expected_revision:""},env));
    assert.equal(created.store_id,B);
  }finally{await pg.close();}
});
