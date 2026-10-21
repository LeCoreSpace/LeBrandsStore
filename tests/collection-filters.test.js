import test from "node:test";
import assert from "node:assert/strict";
import {filterFacts,matchesFacets,buildFacetGroups,facetCounts} from "../src/public/collection-filters.js";
import {storefrontProduct,productFilterProjection} from "../src/public/product-details.js";
import {catalogPage} from "../src/public/catalog-page.js";
import {renderAura} from "../src/public/aura.js";
import {collectionFilterPanel} from "../src/public/collection-filter-view.js";
import {SHOWCASE_STYLES} from "../src/public/aura-showcase.js";
import {readFile} from "node:fs/promises";
const product=(id,type="Kurta",material="Cotton")=>({
 id,title:`Item ${id}`,slug:`item-${id}`,price_paise:100,stock:3,images:[],
 product_filters:{product_type:type,descriptors:[{label:"Material",values:[material]},{label:"Occasion",values:["Work","Casual"]}]},
 catalogue:{axes:[{name:"Colour",values:["Red","Blue"]},{name:"Size",values:["S","L"]}]},
 variants:[{id:`${id}-1`,values:["Red","S"],stock:3},{id:`${id}-2`,values:["Blue","L"],stock:0}],
});
test("product type, variants and descriptor choices come only from collection products",()=>{
 const facts=filterFacts(product("one"));
 assert.equal(facts.labels.type.values.kurta,"Kurta");
 const groups=buildFacetGroups([facts]);
 assert.deepEqual(groups.map(g=>g.label),["Product type","Colour","Size","Material","Occasion"]);
 assert.deepEqual(groups.find(g=>g.key==="d:material").values,[{value:"cotton",label:"Cotton"}]);
 assert.ok(!JSON.stringify(groups).includes("Silk"));
});
test("OR within a filter, AND across filters, and variant choices must coexist on a real SKU",()=>{
 const facts=filterFacts(product("one"));
 assert.equal(matchesFacets(facts,{"v:colour":["red"],"v:size":["l"]}),false);
 assert.equal(matchesFacets(facts,{"v:colour":["red","blue"],"v:size":["l"],"d:material":["cotton"]}),true);
 assert.equal(matchesFacets(facts,{"v:colour":["blue"],"v:size":["l"]},true),false);
 assert.equal(matchesFacets(facts,{"v:colour":["red"],"v:size":["s"]},true),true);
 assert.equal(matchesFacets(facts,{"type":["serum"]}),false);
});
test("counts exclude incompatible variant combinations and deduplicate products, not SKUs",()=>{
 const a=product("a"),b=product("b","Shirt","Linen");
 const items=[a,b].map(p=>({title:p.title,available:true,facets:filterFacts(p)}));
 const groups=buildFacetGroups(items.map(i=>i.facets));
 const counts=facetCounts(items,groups,{"v:size":["l"]});
 assert.equal(counts["v:colour"].red,undefined);assert.equal(counts["v:colour"].blue,2);
 assert.equal(counts["d:occasion"].casual,2);
 assert.equal(facetCounts(items,groups,{"v:size":["l"]},true)["v:colour"].blue,undefined);
});
test("filtering precedes sorting/pagination and a cleared selection restores products",()=>{
 const items=Array.from({length:30},(_,i)=>({title:`Item ${i}`,price:i,index:i,available:true,facets:filterFacts(product(String(i),i<15?"Kurta":"Shirt"))}));
 const result=catalogPage(items,{filters:{type:["kurta"]},sort:"price-desc",page:9,pageSize:12});
 assert.equal(result.total,15);assert.equal(result.pages,2);assert.equal(result.page,2);assert.equal(result.visible.length,3);
 assert.equal(catalogPage(items,{filters:{}}).total,30);
 assert.equal(catalogPage(items,{filters:{type:["absent"]}}).total,0);
});
test("public filter projection freezes type and individual selected descriptor labels without private IDs",()=>{
 const raw={...product("a"),product_filters:undefined,classification:{product_type_id:4,descriptors:[{descriptor_id:2,value_ids:[11,12]}]},
 classification_reference:{product_type_name:"Kurta",descriptors:[{id:2,name:"Occasion",input_type:"multi_select",values:[{id:11,value:"Work"},{id:12,value:"Casual"}]}]}};
 delete raw.product_filters;
 const published=storefrontProduct(raw);
 assert.deepEqual(published.product_filters,{product_type:"Kurta",descriptors:[{label:"Occasion",values:["Work","Casual"]}]});
 assert.equal("classification" in published,false);assert.equal("classification_reference" in published,false);
 raw.classification_reference.product_type_name="Draft serum";
 assert.equal(productFilterProjection(published).product_type,"Kurta");
 assert.equal(storefrontProduct(raw,{detailsFrom:published}).product_filters.product_type,"Kurta");
 assert.deepEqual(productFilterProjection({...raw,product_filters:{product_type:"",descriptors:[]}}),{product_type:"",descriptors:[]});
 assert.deepEqual(productFilterProjection(null),{product_type:"",descriptors:[]});
});
test("legacy published descriptors work without inventing a missing product type",()=>{
 const facts=filterFacts({product_details:[{label:"Material",value:"Cotton"}]});
 assert.deepEqual(facts.groups["d:material"],["cotton"]);assert.equal(facts.groups.type,undefined);
});
test("all saved themes expose the same collection-scoped filter panel",()=>{
 const products=[product("a"),product("b","Serum","Botanical")];
 for(const style of SHOWCASE_STYLES){
  const data={store:{name:"Example"},settings:{ann_design:{version:1,style:style.id||style,copy:{},media:{}}},products,
   collections:[{id:"only-a",slug:"only-a",title:"Only A",product_ids:["a"]}]};
  // The regular layout path is also tested separately below.
  const html=renderAura(data,{page:"collection",collectionId:"only-a"});
  assert.match(html,/data-design-page="collection"/,String(style.id||style));
  assert.match(html,/data-catalog-facets=/,String(style.id||style));
  assert.ok(html.includes("Kurta")&&!html.includes("Botanical"),String(style.id||style));
 }
});
test("normal layouts filter only collection members; empty pages and XSS are safe",()=>{
 const products=[product("a"),product("b","Serum","Botanical")];
 const data={store:{},settings:{},products,collections:[{id:"a-only",slug:"a-only",title:"A only",product_ids:["a"]}],
 layouts:{collection:[{id:"grid",type:"product-grid",settings:{},blocks:[]}]}};
 const html=renderAura(data,{page:"collection",collectionId:"a-only"});
 assert.match(html,/data-catalog-facets=/);assert.ok(!html.includes("Botanical"));
 assert.ok(!renderAura({...data,products:[]},{page:"collection"}).includes("data-catalog-facets="));
 const panel=collectionFilterPanel([product("attack",'<img src=x onerror="alert(1)">')]);
 assert.ok(!panel.includes('<img src=x'));assert.match(panel,/&lt;img/);
});
test("homepage uses the four requested Ann statements",async()=>{
 const text=await readFile(new URL("../src/ui/home-sections.js",import.meta.url),"utf8");
 for(const line of ["Meet Ann.","Your conversational store builder.","Beautiful themes, designed and optimised to sell.","Guided, not generated. Every choice is yours."])assert.ok(text.includes(line));
 assert.ok(!text.includes("Not AI. Just how you want it."));
});
