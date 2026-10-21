import test from "node:test";
import assert from "node:assert/strict";
import {filterFacts,buildFacetGroups} from "../src/public/collection-filters.js";
// A small DOM contract harness, not a browser or a substitute for visual checks.
class Node {
 constructor(){this.dataset={};this.children=[];this.events={};this.hidden=false;this.checked=false;this.attrs={};}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
 dispatchEvent(event){for(const fn of this.events[event.type]||[])fn({type:event.type,target:this});}
 click(){this.dispatchEvent({type:"click"});}
 append(el){this.children=this.children.filter(n=>n!==el);this.children.push(el);}
 replaceChildren(){this.children=[];}
 setAttribute(key,value){this.attrs[key]=value;}
 removeAttribute(key){delete this.attrs[key];}
 getAttribute(key){return this.attrs[key];}
 querySelector(key){return this.selectors?.[key]||null;}
 querySelectorAll(key){return this.lists?.[key]||[];}
}
const blank={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},body:{dataset:{}}};
const oldMedia=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
const prior=globalThis.document;globalThis.document=blank;
const {attachAuraCatalog}=await import("../src/public/aura-ui.js");
if(prior===undefined)delete globalThis.document;else globalThis.document=prior;
if(oldMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=oldMedia;

test("real catalogue controller binds filtering, counts, chip removal, reset and mobile collapse",()=>{
 const doc=new Node(),catalog=new Node(),panel=new Node(),active=new Node(),clear=new Node(),tally=new Node(),results=new Node(),details=new Node(),none=new Node();
 const products=[
  {id:"a",product_filters:{product_type:"Shirt",descriptors:[{label:"Material",values:["Cotton"]}]},catalogue:{axes:[{name:"Size"}]},variants:[{values:["S"],stock:2}]},
  {id:"b",product_filters:{product_type:"Shirt",descriptors:[{label:"Material",values:["Linen"]}]},catalogue:{axes:[{name:"Size"}]},variants:[{values:["L"],stock:2}]},
 ];
 const facts=products.map(filterFacts),groups=buildFacetGroups(facts);
 panel.dataset.catalogFacets=JSON.stringify({groups,records:facts.map((facts,i)=>({href:`/products/${i}`,facts}))});
 const inputs=[],fields=[];
 for(const group of groups){
  const field=new Node(),labels=[];
  for(const option of group.values){
   const input=new Node(),label=new Node(),count=new Node();
   input.dataset.facetGroup=group.key;input.value=option.value;input.closest=()=>label;
   label.selectors={"[data-facet-count]":count};labels.push(label);inputs.push(input);
  }
  field.lists={label:labels};fields.push(field);
 }
 panel.selectors={"[data-facet-active]":active,"[data-facet-clear]":clear,"[data-facet-tally]":tally,"[data-facet-results]":results,details};
 panel.lists={"[data-facet-group]":inputs,"[data-facet-field]":fields};
 const cards=products.map((p,i)=>{
  const card=new Node();card.dataset={title:p.id,price:String(i+1),available:"1",index:String(i)};
  card.attrs.href=`/products/${i}`;card.matches=selector=>selector===".au-card";return card;
 });
 catalog.children=[...cards];
 doc.selectors={"[data-catalog]":catalog,"[data-catalog-facets]":panel,"[data-catalog-empty]":none};
 doc.defaultView={location:{search:""},matchMedia:()=>({matches:true}),Event};
 doc.createElement=()=>new Node();
 attachAuraCatalog(doc);
 assert.equal(results.textContent,"2 products");assert.equal(details.attrs.open,undefined);
 const cotton=inputs.find(i=>i.dataset.facetGroup==="d:material"&&i.value==="cotton");
 cotton.checked=true;cotton.dispatchEvent({type:"change"});
 assert.deepEqual(cards.map(c=>c.hidden),[false,true]);assert.equal(results.textContent,"1 product");
 assert.equal(tally.textContent,"1 selected");assert.equal(active.children.length,1);
 const large=inputs.find(i=>i.dataset.facetGroup==="v:size"&&i.value==="l");
 assert.equal(large.disabled,true);assert.equal(large.closest("label").hidden,true);
 active.children[0].click();
 assert.equal(cotton.checked,false);assert.equal(results.textContent,"2 products");
 cotton.checked=true;cotton.dispatchEvent({type:"change"});clear.click();
 assert.deepEqual(cards.map(c=>c.hidden),[false,false]);assert.equal(active.children.length,0);
 assert.equal(clear.disabled,true);assert.equal(none.hidden,true);
});
