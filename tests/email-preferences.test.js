import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {emailPreferencesUrl,verifyPreferencesToken,handleEmailPreferences,optionalUpdatesAllowed,OPTIONAL_EMAIL_TYPES} from "../src/email/preferences.js";
import {renderEmail} from "../src/email/templates.js";
import {renderCommerceBody} from "../src/public/commerce-view.js";
import {migrationSelection} from "../db/migration-selection.js";

const env={SESSION_SECRET:"isolated-preferences-test-key-not-a-real-secret"};
const store="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const recipient="example@example.invalid";
test("preference capabilities are private, scoped, tamper-resistant and domain separated",async()=>{
  const url=await emailPreferencesUrl(env,recipient,store);
  assert.ok(!url.includes(recipient));
  const token=new URL(url).searchParams.get("token"),payload=await verifyPreferencesToken(env,token);
  assert.equal(payload.scope,store);assert.equal(payload.recipient_hash.length,64);
  assert.equal(await verifyPreferencesToken({SESSION_SECRET:"another-fixture-secret"},token),null);
  assert.equal(await verifyPreferencesToken(env,`${token.slice(0,-4)}aaaa`),null);
  assert.equal(await verifyPreferencesToken(env,"bad"),null);
  assert.equal(await verifyPreferencesToken(env,"a".repeat(800)),null);
  assert.notEqual((await verifyPreferencesToken(env,new URL(await emailPreferencesUrl(env,recipient,other)).searchParams.get("token"))).scope,payload.scope);
  assert.equal((await verifyPreferencesToken(env,new URL(await emailPreferencesUrl(env,recipient)).searchParams.get("token"))).scope,"platform");
  assert.ok(!OPTIONAL_EMAIL_TYPES.has("confirmed")&&!OPTIONAL_EMAIL_TYPES.has("refunded")&&!OPTIONAL_EMAIL_TYPES.has("reset"));
  assert.deepEqual(migrationSelection(["--staged-email-preferences"]),{staged:true,filename:"0043_email_preferences.sql",requires:"0014_transactional_email.sql"});
});

test("persistent unsubscribe, one-click POST, safe GET/HEAD, re-enable and tenant isolation",async()=>{
  const pg=new PGlite();
  try{
    await pg.exec("CREATE ROLE lebrands_app");
    await pg.exec(await readFile(new URL("../db/staged/0043_email_preferences.sql",import.meta.url),"utf8"));
    const tx=async(parts,...values)=>(await pg.query(parts.reduce((sql,part,i)=>sql+(i?`$${i}`:"")+part,""),values)).rows;
    const db={account:fn=>fn(tx)};
    const url=await emailPreferencesUrl(env,recipient,store);
    const post=body=>handleEmailPreferences(new Request(url,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body}),env,db);
    let response=await handleEmailPreferences(new Request(url),env,db);
    assert.equal(response.status,200);assert.match(await response.text(),/Save preferences/);
    assert.equal((await pg.query("SELECT count(*)::int n FROM email_notification_preferences")).rows[0].n,0);
    response=await handleEmailPreferences(new Request(url,{method:"HEAD"}),env,db);
    assert.equal(await response.text(),"");assert.match(response.headers.get("cache-control"),/no-store/);
    response=await post("List-Unsubscribe=One-Click");
    assert.equal(response.status,200);assert.match(await response.text(),/unsubscribed/);
    assert.equal(await optionalUpdatesAllowed(db,store,recipient),false);
    assert.equal(await optionalUpdatesAllowed(db,other,recipient),true);
    assert.equal(await optionalUpdatesAllowed(db,store,"someone@example.invalid"),true);
    await post("List-Unsubscribe=One-Click");
    assert.equal((await pg.query("SELECT count(*)::int n FROM email_notification_preferences")).rows[0].n,1);
    await post("optional_updates=on");
    assert.equal(await optionalUpdatesAllowed(db,store,recipient),true);
    const invalid=await handleEmailPreferences(new Request("https://app.lebrands.store/email-preferences?token=wrong",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:"List-Unsubscribe=One-Click"}),env,{account:()=>{throw Error("Must not access DB for invalid token");}});
    assert.equal(invalid.status,400);
    const notReady=await handleEmailPreferences(new Request(url),env,{account:fn=>fn(async()=>[{enabled:false}])});
    assert.equal(notReady.status,503);
    const large=await post(`token=${"x".repeat(17000)}`);assert.equal(large.status,400);
    await pg.exec("SET ROLE lebrands_app");
    await assert.rejects(pg.query("SELECT * FROM public.email_notification_preferences"),error=>error.code==="42501");
    await pg.exec("RESET ROLE");
  }finally{await pg.close();}
});

test("all utility templates share safe preferences and detailed order/payment semantics",()=>{
  const data={brand_name:"Example Studio",order_number:"DEMO-1042",payment_method:"cod",
    subtotal_paise:24000,shipping_paise:0,tax_paise:1143,total_paise:24000,
    items:[{title:'Cotton <script>bad</script>',sku:"SKU-S-WHITE",quantity:2,unit_price_paise:12000,total_paise:24000}],
    address:{name:"Example customer",line1:"12 Test Street",city:"Chennai",state:"33",pincode:"600001"},
    preferences_url:"https://app.lebrands.store/email-preferences?token=synthetic",action_url:"https://example.invalid/track"};
  for(const type of ["confirmed","new_order","shipped","delivered","cancelled","refunded","reset","invite","verification"]){
    const out=renderEmail(type,data);
    assert.match(out.html,/Email preferences \/ unsubscribe/);assert.match(out.text,/Email preferences \/ unsubscribe/);
    assert.match(out.html,/class="shell"/);assert.ok(!out.html.includes("<script>bad"));
    assert.match(out.html,/Essential order, payment and security/);
  }
  const cod=renderEmail("confirmed",data);
  assert.match(cod.text,/Total due on delivery/);assert.match(cod.text,/Shipping: Free/);assert.match(cod.text,/Tamil Nadu/);
  assert.match(cod.text,/GST \(included in total\): ₹11.43/);assert.match(cod.text,/SKU SKU-S-WHITE/);
  assert.doesNotMatch(cod.text,/Total paid/);
  const paid=renderEmail("confirmed",{...data,payment_method:"online",payment_status:"captured"});
  assert.match(paid.text,/Total paid/);
  const pending=renderEmail("confirmed",{...data,payment_method:"online",status:"pending_payment"});
  assert.match(pending.subject,/pending/);assert.doesNotMatch(pending.text,/Your order is confirmed|Total paid/);
  const cancelled=renderEmail("confirmed",{...data,status:"cancelled"});
  assert.doesNotMatch(cancelled.text,/Your order is confirmed|Total due on delivery|Pay when/);
  const unsafe=renderEmail("reset",{preferences_url:"javascript:alert(1)",action_url:"http://unsafe.invalid"});
  assert.doesNotMatch(unsafe.html,/href="(?:javascript|http:)/);
});

test("receipt makes pending, COD, refunded and confirmed states distinct without inventing payment",()=>{
  const order={order_number:"DEMO-1042",status:"confirmed_cod",payment_method:"cod",created_at:"2026-10-19T08:00:00Z",
    shipping_address:{name:"Example Customer"},subtotal_paise:12000,tax_paise:571,shipping_paise:0,total_paise:12000,
    items:[{title:"Cotton shirt",sku:"SKU-S-WHITE",quantity:1,unit_price_paise:12000,line_total_paise:12000}]};
  const receipt=renderCommerceBody({}, {page:"confirmation",order});
  assert.match(receipt,/receipt-meta/);assert.match(receipt,/Total due on delivery/);assert.match(receipt,/SKU-S-WHITE/);
  assert.match(receipt,/GST \(included in total\)/);assert.doesNotMatch(receipt,/Total paid|Paid online/);
  const pending=renderCommerceBody({}, {page:"confirmation",order:{...order,status:"pending_payment",payment_method:"online"}});
  assert.match(pending,/Payment pending/);assert.doesNotMatch(pending,/<div class="receipt-mark"|Your order is confirmed|Total paid/);
  const refunded=renderCommerceBody({}, {page:"confirmation",order:{...order,status:"refunded",payment_method:"online",payment_status:"refunded"}});
  assert.match(refunded,/Your payment was refunded/);assert.doesNotMatch(refunded,/Total paid/);
});
