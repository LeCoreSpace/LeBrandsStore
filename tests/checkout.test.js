import assert from "node:assert/strict";
import { test } from "node:test";
import { cartItems, quoteCart, inclusiveTax, deliveryCharge, checkoutSettings, DEFAULT_CHECKOUT_SETTINGS, inferStoreState } from "../src/public/commerce-rules.js";
import { orderInput, indianPhone, orderSource } from "../src/checkout/input.js";
import { handleCheckout } from "../src/checkout/routes.js";
import { verifyTurnstile } from "../src/checkout/turnstile.js";
import { renderAura } from "../src/public/aura.js";
import { merchantCheckout } from "../src/checkout/merchant.js";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const PA = "33333333-3333-4333-8333-333333333333", PB = "44444444-4444-4444-8444-444444444444";
const store = {store_id:A,subdomain:"stonescence",name:"Test Store",status:"live"};
const settings = {...DEFAULT_CHECKOUT_SETTINGS,store_state:"33"};
const product = {id:PA,title:"Cotton tote",price_paise:10000,gst_rate:18,hsn_code:"4202",
  images:[{url:"https://media.lebrands.store/example.png",alt:"Cotton tote"}]};
const data = {store,settings:{gstin:"33ABCDE1234F1Z5"},products:[product],policies:[]};
function input(overrides = {}) {
  return {items:[{product_id:PA,quantity:1}],contact:{name:"Test Buyer",phone:"9000000000",email:""},
    address:{line1:"12 Test Street",line2:"",landmark:"",city:"Chennai",state:"33",pincode:"600001"},
    idempotency_key:crypto.randomUUID(),receipt_token:Array.from(crypto.getRandomValues(new Uint8Array(32)),(n)=>n.toString(16).padStart(2,"0")).join(""),
    turnstile_token:"test-only",...overrides};
}
function fakeDatabase() {
  let state = {
    stores:{[A]:store,[B]:{...store,store_id:B,subdomain:"other-store"}},
    publications:{[A]:data,[B]:{...data,products:[{...product,id:PB}]}},
    settings:{[A]:{...settings},[B]:{...settings}},next:{[A]:1001,[B]:1001},
    products:[{id:PA,store_id:A,status:"active",stock:5,track_inventory:true},
      {id:PB,store_id:B,status:"active",stock:9,track_inventory:true}],
    orders:[],customers:[],addresses:[],items:[],attempts:[],queries:[],
  }, mutex = Promise.resolve();
  function transaction(tenant) {
    const tx = async (strings,...values) => {
      const q = strings.join("?").replace(/\s+/g," ");
      state.queries.push(q);
      const own = (id) => id === tenant;
      if (q.startsWith("SELECT role")) return [{role:"owner"}];
      if (q.includes("FROM public.stores")) return own(values[0])?[state.stores[tenant]]:[];
      if (q.includes("FROM public.store_publications")) return own(values[0])?[{snapshot:state.publications[tenant]}]:[];
      if (q.includes("FROM public.store_setup")) return [{settings:data.settings}];
      if (q.includes("FROM public.checkout_settings")) return [{settings:state.settings[tenant]}];
      if (q.includes("SELECT id,status,stock,track_inventory")) return state.products.filter((p)=>own(p.store_id)&&p.store_id===values[0]&&p.id===values[1]);
      if (q.includes("count(*)") && q.includes("checkout_attempts")) return [{count:state.attempts.filter((a)=>own(a.store_id)&&a.ip_hash===values[1]&&a.purpose===values[2]).length}];
      if (q.includes("count(*)") && q.includes("public.orders")) return [{count:state.orders.filter((o)=>own(o.store_id)&&state.customers.some((c)=>c.id===o.customer_id&&c.phone===values[1])).length}];
      if (q.startsWith("SELECT") && q.includes("idempotency_key")) return state.orders.filter((o)=>own(o.store_id)&&o.store_id===values[0]&&o.idempotency_key===values[1]);
      if (q.startsWith("SELECT") && q.includes("confirmation_hash")) return state.orders.filter((o)=>own(o.store_id)&&o.confirmation_hash===values[1]);
      if (q.startsWith("SELECT") && q.includes("o.order_number")) return state.orders.filter((o)=>own(o.store_id)&&o.order_number===values[1]&&state.customers.some((c)=>c.id===o.customer_id&&c.phone===values[2]));
      if (q.startsWith("SELECT") && q.includes("public.order_items")) return state.items.filter((i)=>own(i.store_id)&&i.order_id===values[1]).map((i)=>({...i,line_total_paise:i.total_paise}));
      if (q.startsWith("INSERT INTO public.checkout_attempts")) {state.attempts.push({store_id:values[0],ip_hash:values[1],purpose:values[2]});return [];}
      if (q.startsWith("DELETE FROM public.checkout_attempts")) return [];
      if (q.startsWith("INSERT INTO public.customers")) {
        assert.ok(own(values[0]));
        let customer = state.customers.find((c)=>c.store_id===values[0]&&c.phone===values[2]);
        if (!customer) {customer={id:crypto.randomUUID(),store_id:values[0],name:values[1],phone:values[2],email:values[3]};state.customers.push(customer);}
        return [{id:customer.id}];
      }
      if (q.startsWith("INSERT INTO public.customer_addresses")) {
        assert.match(q,/recipient_name,phone,address_line_1,address_line_2/);
        state.addresses.push({store_id:values[0],customer_id:values[1]});return [];
      }
      if (q.startsWith("INSERT INTO public.checkout_settings")) {
        if (values[1]) state.settings[tenant]=JSON.parse(values[1].json); return [];
      }
      if (q.startsWith("UPDATE public.checkout_settings")) return [{number:state.next[tenant]++}];
      if (q.startsWith("INSERT INTO public.orders")) {
        state.orders.push({id:values[0],store_id:values[1],customer_id:values[2],order_number:values[3],status:"confirmed_cod",payment_method:"cod",
          subtotal_paise:values[4],tax_paise:values[5],shipping_paise:values[6],total_paise:values[7],
          shipping_address:JSON.parse(values[8].json),source:values[9],idempotency_key:values[10],request_hash:values[11],confirmation_hash:values[12]});
        return [];
      }
      if (q.startsWith("INSERT INTO public.order_items")) {
        if (state.failOnItem) throw new Error("Simulated database insert failure");
        state.items.push({store_id:values[0],order_id:values[1],product_id:values[2],title:values[3],quantity:values[6],unit_price_paise:values[7],
          total_paise:values[8],tax_paise:values[9],taxable_paise:values[10],cgst_paise:values[11],sgst_paise:values[12],igst_paise:values[13]});return [];
      }
      if (q.startsWith("UPDATE public.products")) {
        const p=state.products.find((p)=>own(p.store_id)&&p.store_id===values[1]&&p.id===values[2]&&(!p.track_inventory||p.stock>=values[0]));
        if (!p) return [];if (p.track_inventory) p.stock-=values[0];return [{id:p.id}];
      }
      throw new Error(`Unhandled mock query: ${q}`);
    };
    tx.json=(v)=>({json:JSON.stringify(v)});return tx;
  }
  async function withStore(tenant,fn) {
    const previous=mutex;let unlock;mutex=new Promise((resolve)=>unlock=resolve);await previous;
    const before=structuredClone(state);
    try {return await fn(transaction(tenant));} catch (error) {state=before;throw error;} finally {unlock();}
  }
  return {withStore,withMemberStore:(id,hash,fn)=>withStore(id,fn),get state(){return state;}};
}
async function order(db,body,dependencies = {},path="/api/checkout/order") {
  return handleCheckout(new Request(`https://stonescence.lebrands.store${path}`,{
    method:"POST",headers:{"origin":"https://stonescence.lebrands.store","content-type":"application/json","cf-connecting-ip":"192.0.2.1"},body:JSON.stringify(body),
  }),{SESSION_SECRET:"offline-only-secret-not-a-real-key".repeat(2)},db,store,data,{verifyTurnstile:async()=>{},...dependencies});
}
test("cart rejects duplicate, cross-store, unavailable products and bad quantities; validates server prices and stock", () => {
  assert.throws(()=>cartItems([{product_id:PA,quantity:0}]));
  assert.throws(()=>cartItems([{product_id:PA,quantity:1},{product_id:PA,quantity:2}]));
  const q=quoteCart([product],[{id:PA,status:"active",stock:2,track_inventory:true}],
    [{product_id:PA,quantity:3},{product_id:PB,quantity:1}],settings,"33");
  assert.equal(q.items.length,1);assert.equal(q.items[0].quantity,2);assert.equal(q.issues.length,2);
  assert.equal(q.total_paise,20000);assert.equal(q.items[0].igst_paise,0);
});
test("delivery rules and COD totals include delivery; COD defaults to ₹3000", () => {
  assert.equal(DEFAULT_CHECKOUT_SETTINGS.cod_max_paise,300000);
  assert.equal(deliveryCharge(10000,settings),0);
  assert.equal(deliveryCharge(10000,{...settings,delivery_mode:"flat",flat_paise:5000}),5000);
  const free={...settings,delivery_mode:"free_above",flat_paise:5000,free_above_paise:20000};
  assert.equal(deliveryCharge(19999,free),5000);assert.equal(deliveryCharge(20000,free),0);
  assert.throws(()=>checkoutSettings({...free,free_above_paise:0}));
});
test("GST inclusive line rounding is exact and conserved for intra/inter state and every slab", () => {
  for (const rate of [0,5,18,40,12,28,0.25,3]) for (const gross of [1,99,10000,99999999]) {
    const intra=inclusiveTax(gross,rate,true), inter=inclusiveTax(gross,rate,false);
    assert.equal(intra.taxable_paise+intra.cgst_paise+intra.sgst_paise,gross);
    assert.equal(inter.taxable_paise+inter.igst_paise,gross);
    assert.equal(intra.tax_paise,inter.tax_paise);assert.equal(inter.cgst_paise,0);
  }
  assert.equal(inclusiveTax(11800,18,true).taxable_paise,10000);
  assert.equal(inferStoreState({gstin:"33ABCDE1234F1Z5"}),"33");
  assert.equal(inferStoreState({address:"Mumbai, Maharashtra"}),"27");
});
test("checkout contact/address validation accepts +91 guest contact and rejects invalid fields", () => {
  assert.equal(indianPhone("+91 90000 00000"),"+919000000000");
  assert.equal(indianPhone("123"),null);
  assert.equal(orderInput(input()).address.state,"33");
  assert.throws(()=>orderInput(input({address:{...input().address,pincode:"abc",state:"XX"}})),(e)=>!!e.errors.pincode&&!!e.errors.state);
  assert.equal(orderSource({},new Request("https://stonescence.lebrands.store")),"direct");
  assert.equal(orderSource({source:{utm_source:"mall"}},new Request("https://stonescence.lebrands.store")),"mall");
});
test("COD placement uses published prices, snapshots GST, saves customer/address, and reduces stock exactly once", async () => {
  const db=fakeDatabase(), body=input();
  body.total_paise=1;body.items[0].unit_price_paise=1;
  const response=await order(db,body);assert.equal(response.status,201);
  const result=await response.json();assert.equal(result.total_paise,10000);assert.equal(result.order_number,"STO-1001");
  assert.equal(db.state.customers.length,1);assert.equal(db.state.addresses.length,1);assert.equal(db.state.products[0].stock,4);
  const line=db.state.items[0];assert.equal(line.taxable_paise+line.cgst_paise+line.sgst_paise,line.total_paise);
  assert.ok(db.state.queries.some((q)=>q.includes("public.stores")&&q.includes("FOR UPDATE")));
  const replay=await order(db,body,{verifyTurnstile:async()=>assert.fail("Replay must not require a new Turnstile token")});
  assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
  assert.equal(db.state.orders.length,1);assert.equal(db.state.products[0].stock,4);
  const receipt=await handleCheckout(new Request(`https://stonescence.lebrands.store${result.receipt_url}`),{},db,store,data);
  assert.equal(receipt.status,200);assert.match(await receipt.text(),/STO-1001/);
});
test("concurrent double clicks create one order; changed payload with same key returns conflict", async (context) => {
  context.mock.method(console,"error",()=>{});
  const db=fakeDatabase(), body=input();
  const results=await Promise.all([order(db,body),order(db,body)]);
  assert.ok(results.every((r)=>[200,201].includes(r.status)));
  assert.equal(db.state.orders.length,1);assert.equal(db.state.products[0].stock,4);
  const conflict=await order(db,{...body,items:[{product_id:PA,quantity:2}]});
  assert.equal(conflict.status,409);assert.equal(db.state.products[0].stock,4);
});
test("mid-transaction failure rolls back customer, address, order, items, stock and counter, but preserves abuse attempt", async (context) => {
  context.mock.method(console,"error",()=>{});
  const db=fakeDatabase();db.state.failOnItem=true;
  assert.equal((await order(db,input())).status,503);
  for (const key of ["customers","addresses","orders","items"])assert.equal(db.state[key].length,0);
  assert.equal(db.state.products[0].stock,5);assert.equal(db.state.next[A],1001);
  assert.equal(db.state.attempts.length,1);
});
test("COD disabled/over-limit, out-of-stock and cross-store products never create customer/order records", async (context) => {
  context.mock.method(console,"error",()=>{});
  for (const scenario of ["disabled","limit","stock","cross","unpublished"]) {
    const db=fakeDatabase();const body=input();
    if(scenario==="disabled")db.state.settings[A].cod_enabled=false;
    if(scenario==="limit")db.state.settings[A].cod_max_paise=9999;
    if(scenario==="stock")db.state.products[0].stock=0;
    if(scenario==="cross")body.items[0].product_id=PB;
    if(scenario==="unpublished")db.state.stores[A]={...store,status:"draft"};
    const response=await order(db,body);assert.ok([400,404,409].includes(response.status),scenario);
    assert.equal(db.state.orders.length,0);assert.equal(db.state.customers.length,0);
    assert.equal(db.state.products[1].stock,9);
  }
});
test("three-per-phone COD limit and per-IP limit count failed attempts; inter-state tax is IGST", async (context) => {
  context.mock.method(console,"error",()=>{});
  const db=fakeDatabase();
  for(let i=0;i<3;i++){
    const body=input();body.address.state="29";
    assert.equal((await order(db,body)).status,201);
  }
  assert.equal((await order(db,input())).status,429);
  assert.equal(db.state.orders.length,3);assert.equal(db.state.items[0].cgst_paise,0);assert.ok(db.state.items[0].igst_paise>0);
  const limited=fakeDatabase();
  for(let i=0;i<10;i++)assert.equal((await order(limited,input({contact:{phone:"bad"}}))).status,400);
  assert.equal((await order(limited,input())).status,429);
});
test("Turnstile fails closed without keys and checks hostname/action; dependency injection is test-only", async () => {
  const request=new Request("https://stonescence.lebrands.store");
  await assert.rejects(verifyTurnstile(request,{},input()),{status:503});
  for (const result of [{success:false},{success:true,hostname:"other.example",action:"checkout"},{success:true,hostname:"stonescence.lebrands.store",action:"wrong"}]) {
    await assert.rejects(verifyTurnstile(request,{TURNSTILE_SECRET_KEY:"offline-test",TURNSTILE_SITE_KEY:"offline-test"},input(),
      async()=>new Response(JSON.stringify(result))),{status:400});
  }
  await verifyTurnstile(request,{TURNSTILE_SECRET_KEY:"offline-test",TURNSTILE_SITE_KEY:"offline-test"},input(),
    async()=>new Response(JSON.stringify({success:true,hostname:"stonescence.lebrands.store",action:"checkout"})));
});
test("tracking requires correct phone and receipt tokens are tenant scoped; wrong origins never write", async (context) => {
  context.mock.method(console,"error",()=>{});
  const db=fakeDatabase(), body=input(), placed=await (await order(db,body)).json();
  assert.equal((await order(db,{order_number:placed.order_number,phone:body.contact.phone},{},"/api/orders/track")).status,200);
  assert.equal((await order(db,{order_number:placed.order_number,phone:"9111111111"},{},"/api/orders/track")).status,404);
  const wrong=await handleCheckout(new Request(`https://other-store.lebrands.store${placed.receipt_url}`),{},db,{...store,store_id:B},data);
  assert.equal(wrong.status,404);
  const rejected=await handleCheckout(new Request("https://stonescence.lebrands.store/api/checkout/order",{
    method:"POST",headers:{"origin":"https://evil.example","content-type":"application/json"},body:JSON.stringify(input()),
  }),{},db,store,data);
  assert.equal(rejected.status,403);assert.equal(db.state.orders.length,1);
});
test("checkout and account commerce HTML escape values; previews do not enable ordering", () => {
  const escaped={...data,store:{...store,name:'<script>alert("x")</script>'}};
  const page=renderAura(escaped,{page:"checkout",commerce:true});
  assert.ok(!page.includes('<script>alert("x")</script>'));assert.match(page,/Online payment coming soon/);
  assert.match(renderAura(data,{page:"product",productId:PA,commerce:true}),/data-add-product/);
  assert.ok(!renderAura(data,{page:"product",productId:PA,preview:true}).includes("data-add-product"));
});
test("home uses first product's main image, footer has one Contact, and current GST includes 40", () => {
  const url=`https://media.lebrands.store/stores/${A}/${PA}.webp`;
  const html=renderAura({...data,products:[{...product,images:[{url}]}]});
  const hero=html.slice(html.indexOf('class="aura-hero'),html.indexOf('class="aura-section'));
  assert.ok(hero.includes(url));
  const footer=html.slice(html.indexOf("<footer"));
  assert.equal((footer.match(/>Contact<\/a>/g)||[]).length,1);
  assert.equal(inclusiveTax(14000,40,false).igst_paise,4000);
});
test("owner checkout settings save and non-owner order access is denied", async (context) => {
  context.mock.method(console,"error",()=>{});
  const db=fakeDatabase();
  const response=await merchantCheckout(new Request(`https://app.lebrands.store/api/stores/${A}/checkout-settings`,{
    method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({...settings,delivery_mode:"flat",flat_paise:5000}),
  }),db,{id:B},"a".repeat(64));
  assert.equal(response.status,200);assert.equal((await response.json()).settings.flat_paise,5000);
  const denied={withMemberStore:async(id,hash,fn)=>fn(async()=>[{role:"editor"}])};
  assert.equal((await merchantCheckout(new Request(`https://app.lebrands.store/stores/${A}/orders`),denied,{id:B},"a".repeat(64))).status,403);
});
