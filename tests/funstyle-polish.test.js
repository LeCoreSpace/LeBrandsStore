import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { validateProduct, productGSTWarning } from "../src/public/validation.js";
import { productPatch } from "../src/store/input.js";
import { saveProduct } from "../src/store/repository.js";
import { accountIdentity } from "../src/public/dashboard-rules.js";
import { renderDashboard } from "../src/ui/dashboard.js";
import { renderAura } from "../src/public/aura.js";
import { renderCommerceBody } from "../src/public/commerce-view.js";
import { exampleFixture } from "../src/local-example-fixture.js";

test("new products require an explicit GST rate before any database operation", async () => {
  for (const rate of [undefined, null, ""]) assert.ok(validateProduct({gst_rate:rate}).gst_rate);
  assert.equal(validateProduct({gst_rate:0}).gst_rate,undefined);
  assert.throws(()=>productPatch({gst_rate:null}),/GST rate explicitly/);
  assert.throws(()=>productPatch({gst_rate:""}),/GST rate explicitly/);
  await assert.rejects(saveProduct(null,"store",null,{title:"A product"}),error=>error.status===400 && !!error.errors.gst_rate);
  assert.equal(productPatch({gst_rate:0}).gst_rate,0);
  for (const rate of [12,28]) assert.equal(productPatch({gst_rate:rate}).gst_rate,rate);
});
test("apparel and footwear exemption warnings are advisory, not a zero-rate ban", () => {
  for (const code of ["6109","6201","6302","6403"]) assert.match(productGSTWarning({gst_rate:0,hsn_code:code}),/qualifies for an exemption/);
  for (const rate of [null,"",undefined,5,18]) assert.equal(productGSTWarning({gst_rate:rate,hsn_code:"6109"}),"");
  assert.equal(productGSTWarning({gst_rate:0,hsn_code:"7117"}),"");
});
test("account initial and complete name remain separate, including Anny and Unicode", () => {
  assert.deepEqual(accountIdentity({name:" Anny "}),{name:"Anny",initial:"A"});
  assert.deepEqual(accountIdentity({name:"\u200BAnny"}),{name:"Anny",initial:"A"});
  const html=renderDashboard("overview",exampleFixture(),{name:"Anny"});
  assert.match(html,/lb-account-avatar" aria-hidden="true">A</);
  assert.match(html,/lb-user">Anny</);
  assert.doesNotMatch(html,/Authoritative|Summary figures use the official|complete sales ledger/);
});
test("new product form never selects 0% implicitly; unsupported comments are absent", () => {
  const data=exampleFixture();data.product=data.products[0];
  assert.match(renderDashboard("product-new",data,{name:"Anny"}),/<select name="gst_rate" required><option value="" selected>/);
  assert.doesNotMatch(renderDashboard("order",data,{}),/timeline-comment|Add a timeline comment/);
});
test("Aura header always exposes icon search and bag count, also in read-only previews", () => {
  for(const options of [{},{preview:true,readOnly:true},{commerce:true}]){
    const html=renderAura(exampleFixture(),options);
    assert.match(html,/data-search-open/);
    assert.match(html,/<dialog class="au-search-dialog"/);
    assert.match(html,/data-cart-open[^>]*><svg/);
    assert.match(html,/data-cart-count/);
    assert.doesNotMatch(html,/<div class="au-actions"><form/);
  }
});
test("confirmation thanks the first name safely, with SVG and real header/footer", () => {
  const data=exampleFixture();
  const order={order_number:"TEST-1",customer_name:"Anny Test",shipping_address:{name:"Anny Test"},items:[],total_paise:0};
  const receipt=renderCommerceBody(data,{page:"confirmation",order});
  assert.match(receipt,/Thank you, Anny\. Your order is confirmed\./);
  assert.match(receipt,/receipt-mark[^>]*><svg/);
  assert.doesNotMatch(receipt,/commerce-kicker/);
  const html=renderAura(data,{page:"confirmation",commerce:true,order});
  assert.match(html,/au-header/);assert.match(html,/au-footer/);
});
test("publish contrast, accessible handles and hidden indicators are wired", async () => {
  const css=await readFile("src/public/editor.css","utf8"),js=await readFile("src/public/editor.js","utf8");
  assert.match(css,/\.ed \.ed-primary\{/);assert.match(css,/\.ed \.ed-primary:disabled\{/);
  assert.doesNotMatch(css,/line-through/);
  assert.match(js,/ed-eye-off/);assert.match(js,/data-reorder-handle/);
  assert.match(js,/\["ArrowUp", "ArrowDown"\]/);
});
test("embedded previews suppress scripts while keeping search markup for trusted parent binding",()=>{
  const html=renderAura(exampleFixture(),{preview:true,embeddedPreview:true,readOnly:true});
  assert.match(html,/data-search-open/);
  assert.doesNotMatch(html,/<script[^>]+src=/);
});
test("a nonempty sales response produces a chart and table without hidden JavaScript errors",async()=>{
  const source=await readFile("src/public/dashboard.js","utf8");
  const nodes=Object.fromEntries(["sales-chart","chart-table","chart-caption","chart-scope"].map(name=>[`[data-${name}]`,{innerHTML:"",textContent:""}]));
  const orders=[{created_at:"2026-10-11T12:00:00+05:30",total_paise:185220,status:"confirmed_cod"},{created_at:"2026-10-11T12:00:00+05:30",total_paise:99900,status:"cancelled"}];
  runInNewContext(source.slice(source.indexOf("function indiaToday()"))+'\ndrawSalesChart(orders,"2026-10-05","2026-10-11",false);',{
    document:{querySelector:selector=>nodes[selector]||null,addEventListener(){}},Intl,Date,orders,esc:value=>String(value),
  });
  assert.match(nodes["[data-sales-chart]"].innerHTML,/<svg/);
  assert.match(nodes["[data-chart-table]"].innerHTML,/₹1,852<\/td><td>1/);
  assert.doesNotMatch(nodes["[data-chart-table]"].innerHTML,/₹2,851/);
});
test("sandboxed preview searches use click and Enter, never native form submission",async()=>{
  const source=await readFile("src/public/aura-ui.js","utf8");
  const control=()=>({dataset:{},listeners:{},addEventListener(type,handler){this.listeners[type]=handler;},focus(){}});
  const opener=control(),input=Object.assign(control(),{value:"Indigo"}),button=Object.assign(control(),{type:"submit"});
  const form=Object.assign(control(),{querySelector(){return button;}});
  let results;
  const dialog=Object.assign(control(),{querySelector(selector){return selector==="input"?input:selector==="form"?form:control();},append(element){results=element;}});
  const doc={body:{style:{}},querySelector:()=>opener,getElementById:()=>dialog,createElement:()=>({children:[],setAttribute(){},replaceChildren(){this.children=[];},append(child){this.children.push(child);}})};
  opener.getAttribute=()=>"search";
  runInNewContext(source.slice(source.indexOf("export function attachAuraSearch"),source.indexOf("\nattachAuraSearch(document);")).replace("export function","function")+'\nattachAuraSearch(doc,{products:[{title:"Indigo shirt"},{title:"Ecru trousers"}]});',{doc});
  assert.equal(button.type,"button");
  button.listeners.click();assert.equal(results.children[0].textContent,"Indigo shirt");
  input.value="Ecru";let prevented=false;
  input.listeners.keydown({key:"Enter",preventDefault(){prevented=true;}});
  assert.ok(prevented);assert.equal(results.children[0].textContent,"Ecru trousers");
});
