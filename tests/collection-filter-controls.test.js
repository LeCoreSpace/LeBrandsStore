import test from "node:test";
import assert from "node:assert/strict";
import {filterFacts,buildFacetGroups} from "../src/public/collection-filters.js";
// A small DOM contract harness, not a browser or a substitute for visual checks.
class Node {
 constructor(){this.dataset={};this.children=[];this.events={};this.hidden=false;this.checked=false;this.attrs={};this.style={overflow:"",setProperty(key,value){this[key]=value;}};this.offsetParent={};}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
 dispatchEvent(event){for(const fn of this.events[event.type]||[])fn({...event,type:event.type,target:this,key:event.key,shiftKey:event.shiftKey,preventDefault(){event.defaultPrevented=true;}});}
 click(){this.dispatchEvent({type:"click"});}
 append(el){this.children=this.children.filter(n=>n!==el);this.children.push(el);}
 replaceChildren(){this.children=[];}
 setAttribute(key,value){this.attrs[key]=value;}
 removeAttribute(key){delete this.attrs[key];}
 getAttribute(key){return this.attrs[key];}
 hasAttribute(key){return Object.hasOwn(this.attrs,key);}
 closest(){return null;}
 focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}
 querySelector(key){return this.selectors?.[key]||null;}
 querySelectorAll(key){return this.lists?.[key]||[];}
}
const blank={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},body:{dataset:{}}};
const oldMedia=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
const prior=globalThis.document;globalThis.document=blank;
const {attachAuraCatalog}=await import("../src/public/aura-ui.js");
if(prior===undefined)delete globalThis.document;else globalThis.document=prior;
if(oldMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=oldMedia;

test("catalogue controller binds filters and an iframe-local accessible mobile drawer",()=>{
 const doc=new Node(),catalog=new Node(),panel=new Node(),active=new Node(),clear=new Node(),tally=new Node(),results=new Node(),none=new Node();
 const bar=new Node(),open=new Node(),close=new Node(),done=new Node(),backdrop=new Node(),barCount=new Node(),barTally=new Node();
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
   input.dataset.facetGroup=group.key;input.value=option.value;input.closest=selector=>selector==="label"?label:selector==="[hidden]"&&(label.hidden||field.hidden)?label:null;
   label.selectors={"[data-facet-count]":count};labels.push(label);inputs.push(input);
  }
  field.lists={label:labels};fields.push(field);
 }
 panel.selectors={"[data-facet-active]":active,"[data-facet-clear]":clear,"[data-facet-tally]":tally,"[data-facet-results]":results,"[data-facet-close]":close,"[data-facet-done]":done};
 panel.lists={"[data-facet-group]":inputs,"[data-facet-field]":fields,"button,input,summary":[close,...inputs,clear,done]};
 panel.contains=node=>[close,done,clear,...inputs,...active.children].includes(node);
 bar.selectors={"[data-facet-open]":open,"[data-facet-bar-count]":barCount,"[data-facet-bar-tally]":barTally};
 const cards=products.map((p,i)=>{
  const card=new Node();card.dataset={title:p.id,price:String(i+1),available:"1",index:String(i)};
  card.attrs.href=`/products/${i}`;card.matches=selector=>selector===".au-card";return card;
 });
 catalog.children=[...cards];
 doc.selectors={"[data-catalog]":catalog,"[data-catalog-facets]":panel,"[data-catalog-empty]":none,"[data-facet-bar]":bar,"[data-facet-backdrop]":backdrop};
 let mobile=true;
 const viewport=new Node();
 Object.assign(viewport,{location:{search:""},matchMedia:()=>({matches:mobile}),Event,getComputedStyle:()=>({backgroundColor:"rgb(255, 255, 255)"})});
 doc.defaultView=viewport;doc.body=new Node();doc.body.style.overflow="scroll";
 doc.createElement=()=>Object.assign(new Node(),{ownerDocument:doc});
 [open,close,done,clear,...inputs].forEach(node=>{node.ownerDocument=doc;});
 attachAuraCatalog(doc);
 assert.equal(results.textContent,"2 products");assert.equal(panel.hasAttribute("data-open"),false);
 assert.equal(bar.hidden,false);assert.equal(barCount.textContent,"2 products");
 const cotton=inputs.find(i=>i.dataset.facetGroup==="d:material"&&i.value==="cotton");
 cotton.checked=true;cotton.dispatchEvent({type:"change"});
 assert.deepEqual(cards.map(c=>c.hidden),[false,true]);assert.equal(results.textContent,"1 product");
 assert.equal(tally.textContent,"1 selected");assert.equal(active.children.length,1);
 assert.equal(barCount.textContent,"1 product");assert.equal(barTally.textContent,"1");assert.equal(done.textContent,"Show 1 product");
 const large=inputs.find(i=>i.dataset.facetGroup==="v:size"&&i.value==="l");
 assert.equal(large.disabled,true);assert.equal(large.closest("label").hidden,true);
 active.children[0].click();
 assert.equal(cotton.checked,false);assert.equal(results.textContent,"2 products");
 cotton.checked=true;cotton.dispatchEvent({type:"change"});clear.click();
 assert.deepEqual(cards.map(c=>c.hidden),[false,false]);assert.equal(active.children.length,0);
 assert.equal(clear.disabled,true);assert.equal(none.hidden,true);
 open.click();
 assert.equal(panel.hasAttribute("data-open"),true);assert.equal(backdrop.hidden,false);
 assert.equal(panel.getAttribute("role"),"dialog");assert.equal(panel.getAttribute("aria-modal"),"true");
 assert.equal(open.getAttribute("aria-expanded"),"true");assert.equal(doc.body.style.overflow,"hidden");assert.equal(doc.activeElement,close);
 done.focus();doc.dispatchEvent({type:"keydown",key:"Tab"});assert.equal(doc.activeElement,close);
 doc.dispatchEvent({type:"keydown",key:"Tab",shiftKey:true});assert.equal(doc.activeElement,done);
 doc.activeElement=doc.body;doc.dispatchEvent({type:"keydown",key:"Tab"});assert.equal(doc.activeElement,close);
 doc.dispatchEvent({type:"keydown",key:"Escape"});
 assert.equal(panel.hasAttribute("data-open"),false);assert.equal(backdrop.hidden,true);
 assert.equal(panel.getAttribute("role"),undefined);assert.equal(open.getAttribute("aria-expanded"),"false");
 assert.equal(doc.body.style.overflow,"scroll");assert.equal(doc.activeElement,open);
 for(const button of [close,done,backdrop]){open.click();assert.equal(panel.hasAttribute("data-open"),true);button.click();assert.equal(panel.hasAttribute("data-open"),false);}
 open.click();mobile=false;viewport.dispatchEvent({type:"resize"});
 assert.equal(panel.hasAttribute("data-open"),false);assert.equal(doc.body.style.overflow,"scroll");
 open.click();assert.equal(panel.hasAttribute("data-open"),false,"desktop does not open a mobile sheet");
});
