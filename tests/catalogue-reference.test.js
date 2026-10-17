import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attributeFor, findReference, referenceAxesAllowed, initCatalogueReference, catalogueDefaultSelection } from "../src/public/catalogue-reference.js";
import { renderCatalogueOrganisation } from "../src/ui/catalogue-forms.js";
import { initCatalogueForm, ensureProductSku } from "../src/public/catalogue-form.js";
import * as model from "../src/public/catalogue-model.js";

const attributes = [
  { id: 1, name: "Size", values: [{ id: 11, value: "Small" }, { id: 12, value: "Large" }] },
  { id: 2, name: "Capacity", values: [{ id: 13, value: "10,000 mAh" }] },
];
test("exact reference names and values are used, including commas", () => {
  assert.equal(attributeFor(attributes, "Size"), attributes[0]);
  assert.equal(attributeFor(attributes, "size"), undefined);
  assert.equal(referenceAxesAllowed([{ name: "Size", values: ["S"] }], attributes), false);
  assert.equal(referenceAxesAllowed([{ name: "Size", values: ["Small"] }], attributes), true);
  const axes = [{ name: "Capacity", values: ["10,000 mAh"] }];
  assert.equal(referenceAxesAllowed(axes, attributes), true);
  assert.deepEqual(model.variantCombinations(axes), [["10,000 mAh"]]);
});
test("saved custom values are preserved, not silently applied to a new subcategory", () => {
  const saved = [{ name: "Old size", values: ["Custom"] }];
  assert.equal(referenceAxesAllowed(saved, attributes, saved), true);
  assert.equal(referenceAxesAllowed(saved, attributes, saved, true), false);
  assert.equal(referenceAxesAllowed([{ name: "Old size", values: ["Invented"] }], attributes, saved), false);
});
test("subcategory lookup uses its own ID, never its category ID", () => {
  const rows = [{ subcategory_id: 11, category_id: 1, name: "Clothing", slug: "clothing" }];
  assert.equal(findReference(rows, "1"), undefined);
  assert.equal(findReference(rows, "11"), rows[0]);
  assert.equal(findReference(rows, "clothing"), rows[0]);
});
test("Ann's selected Womens Clothing resolves to canonical product defaults, never another category", () => {
  const reference = {
    categories: [{category_id:1,name:"Fashion & Apparel"},{category_id:2,name:"Beauty"}],
    subcategories: [{subcategory_id:2,category_id:1,name:"Womens Clothing"}],
  };
  assert.deepEqual(catalogueDefaultSelection(reference,{category_id:"1",subcategory_id:"2"}),{category:"Fashion & Apparel",subcategory:"Womens Clothing"});
  assert.deepEqual(catalogueDefaultSelection(reference,{subcategory_id:"2"}),{category:"Fashion & Apparel",subcategory:"Womens Clothing"});
  assert.deepEqual(catalogueDefaultSelection(reference,{category_id:"2",subcategory_id:"2"}),{});
  assert.deepEqual(catalogueDefaultSelection(reference,{category_id:999,subcategory_id:999}),{});
});
test("reference loading discards a stale response after subcategory changes", async () => {
  const element = value => ({ value, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } });
  const category = element("Fashion"), subcategory = element("First"), retry = element("");
  const nodes = { '[name="catalogue_category"]': category, '[name="catalogue_subcategory"]': subcategory, "[data-reference-retry]": retry, "[data-reference-status]": {} };
  const releases = new Map(), states = [];
  const body = { categories: [{ category_id: 1, name: "Fashion" }], subcategories: [{ category_id: 1, subcategory_id: 11, name: "First" }, { category_id: 1, subcategory_id: 12, name: "Second" }] };
  initCatalogueReference({ querySelector: selector => nodes[selector] }, {
    url: "/reference", onChange: state => states.push(state),
    fetcher: async url => url === "/reference" ? { ok: true, json: async () => body }
      : new Promise(resolve => releases.set(new URL(url, "https://example.invalid").searchParams.get("subcategory_id"), resolve)),
  });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  await tick();
  subcategory.value = "Second"; subcategory.listeners.change();
  const response = name => ({ ok: true, json: async () => ({ attributes: [{ name, values: [{ value: name }] }] }) });
  releases.get("12")(response("Second only"));
  await tick();
  releases.get("11")(response("Wrong stale option"));
  await tick();
  assert.equal(states.at(-1).status, "ready");
  assert.equal(states.at(-1).attributes[0].name, "Second only");
  assert.ok(!states.some(s => s.attributes.some(a => a.name === "Wrong stale option")));
});
test("product organisation has real category/subcategory selectors and a retry", () => {
  const html = renderCatalogueOrganisation({ enabled: true, product: { catalogue: { category: "<saved>", subcategory: "Legacy" } } });
  assert.match(html, /<select name="catalogue_category">/);
  assert.match(html, /<select name="catalogue_subcategory">/);
  assert.match(html, /&lt;saved&gt;/);
});
test("product types load for the selected subcategory and selecting a type loads its exact variants and details",async()=>{
  const element=value=>({value,disabled:true,innerHTML:"",dataset:{},selectedOptions:[],listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});
  const category=element("Fashion"),subcategory=element("Womens Clothing"),type=element(""),retry=element(""),status={};
  const nodes={'[name="catalogue_category"]':category,'[name="catalogue_subcategory"]':subcategory,'[name="catalogue_product_type"]':type,"[data-reference-status]":status,"[data-reference-retry]":retry};
  const states=[],requests=[],types=[{id:41,name:"T-shirts"},{id:42,name:"Dresses"}];
  const reference={categories:[{category_id:1,name:"Fashion"}],subcategories:[{category_id:1,subcategory_id:2,name:"Womens Clothing"}]};
  const options=[{id:7,name:"Size",values:[{id:70,value:"M"}]}],descriptors=[{id:9,name:"Material",input_type:"text",values:[]}];
  initCatalogueReference({querySelector:s=>nodes[s]},{
    url:"/reference",onChange:next=>states.push(next),fetcher:async url=>{
      requests.push(url);
      if(url==="/reference")return{ok:true,json:async()=>reference};
      const selected=Number(new URL(url,"https://example.invalid").searchParams.get("product_type_id"));
      return{ok:true,json:async()=>({attributes:[],catalogue:{enabled:true,product_types:types,product_type:types.find(t=>t.id===selected)||null,options:selected?options:[],descriptors:selected?descriptors:[]}})};
    },
  });
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  await tick();
  assert.equal(type.disabled,false);
  assert.match(type.innerHTML,/T-shirts/);assert.match(type.innerHTML,/Dresses/);
  assert.equal(type.value,"","never silently choose an unrelated product type");
  assert.match(status.textContent,/2 product types available/);
  type.value="42";type.listeners.change();
  await tick();
  assert.equal(states.at(-1).catalogue.product_type.id,42);
  assert.deepEqual(states.at(-1).catalogue.options,options);
  assert.deepEqual(states.at(-1).catalogue.descriptors,descriptors);
  assert.ok(requests.includes("/reference?subcategory_id=2&catalogue=1&product_type_id=42"));
});
test("failed product-type loading shows a retry, disables stale choices, and recovers",async()=>{
  const element=value=>({value,disabled:false,innerHTML:"",dataset:{},selectedOptions:[],listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});
  const category=element("Fashion"),subcategory=element("Womens Clothing"),type=element(""),retry=element(""),status={};
  const nodes={'[name="catalogue_category"]':category,'[name="catalogue_subcategory"]':subcategory,'[name="catalogue_product_type"]':type,"[data-reference-status]":status,"[data-reference-retry]":retry};
  let fail=true;
  initCatalogueReference({querySelector:s=>nodes[s]},{
    url:"/reference",onChange:()=>{},fetcher:async url=>{
      if(url==="/reference")return{ok:true,json:async()=>({categories:[{category_id:1,name:"Fashion"}],subcategories:[{category_id:1,subcategory_id:2,name:"Womens Clothing"}]})};
      if(fail)return{ok:false,json:async()=>({error:"Product types could not load. Please retry."})};
      return{ok:true,json:async()=>({attributes:[],catalogue:{enabled:true,product_types:[{id:41,name:"T-shirts"}],product_type:null,options:[],descriptors:[]}})};
    },
  });
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  await tick();
  assert.equal(type.disabled,true);assert.equal(retry.hidden,false);assert.match(status.textContent,/could not load/);
  fail=false;retry.listeners.click();await tick();
  assert.equal(type.disabled,false);assert.equal(retry.hidden,true);assert.match(type.innerHTML,/T-shirts/);
});
test("disabled catalogue forms remain usable without a controller", () => {
  assert.equal(initCatalogueForm({ querySelector: () => null }, { model }), null);
});
test("a product SKU is generated once, shown in the input, and saved SKUs are never replaced", () => {
  const input = { value: "" }, scope = { querySelector: () => input };
  let calls = 0;
  const generate = () => { calls++; return "LB-AUTO"; };
  assert.equal(ensureProductSku(scope, generate), "LB-AUTO");
  assert.equal(input.value, "LB-AUTO");
  assert.equal(ensureProductSku(scope, generate), "LB-AUTO");
  input.value = "MERCHANT-SAVED-SKU";
  assert.equal(ensureProductSku(scope, generate), "MERCHANT-SAVED-SKU");
  assert.equal(calls, 1);
  assert.match(model.createProductSku(), /^LB-[A-F0-9]{16}$/);
  assert.notEqual(model.createProductSku(), model.createProductSku());
});
test("the shared dashboard controller loads Ann's source; no comma-based free typing", async () => {
  const controller = await readFile("src/public/catalogue-form.js", "utf8");
  const dashboard = await readFile("src/public/dashboard.js", "utf8");
  assert.match(controller, /data-axis-choice/);
  assert.match(controller, /data-add-reference-axis/);
  assert.match(controller, /scope\.dataset\.new === "true"/);
  assert.match(controller, /data-buying-status/);
  assert.doesNotMatch(controller, /parseValues|data-axis-values/);
  assert.match(dashboard, /referenceUrl: `\$\{api\}\/ann\/reference`/);
  const ann = await readFile("src/public/ann-builder.js", "utf8");
  assert.doesNotMatch(ann, /<input[^>]*data-attr=/);
});
