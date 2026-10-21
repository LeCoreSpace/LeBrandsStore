import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {runInNewContext} from "node:vm";
import {renderHome,renderPricing} from "../src/ui/marketing.js";

test("homepage archives the exact original hero and retains deterministic accessible panel IDs",async()=>{
  const source=await readFile("src/ui/marketing.js","utf8");
  const start=source.indexOf('<section class="m-hero"');
  const hero=source.slice(start,source.indexOf("</section>",start)+10);
  assert.equal(createHash("sha256").update(hero).digest("hex"),"e8a162a7ba21cb645336151863ccc4f5df1b6dd2114540f8eac1f45dc1f64133");
  const html=renderHome();
  assert.doesNotMatch(html, /class="m-hero"/);
  assert.equal(html,renderHome());
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const[,id]of html.matchAll(/aria-controls="(ht[^"]+)"/g))assert.ok(ids.includes(id));
  assert.match(html,/m-footer-home/);
  assert.doesNotMatch(renderPricing(),/m-footer-home|data-h-tabs/);
});

test("visual stories cover core product differences without a standalone launch promise",()=>{
  const html=renderHome(),copy=html.replace(/<[^>]+>/g," ").replace(/\s+/g," ");
  assert.match(copy,/approved Razorpay account/i);
  assert.doesNotMatch(html,/id="launch"|Three clear steps/);
  for(const feature of ["Ann","Tamil","Marathi","Telugu","SKU","cost","Collections","Cash on Delivery","offer","returns","RTO","GST","margin","CSV","Excel","Razorpay","Shiprocket","domain","Meta","Google Analytics","Google Ads","shopper consent","review","Support","Created","Pending","Closed","Team roles","Download reports","Free","/compare","/blog"])assert.ok(html.toLowerCase().includes(feature.toLowerCase()),`Missing feature: ${feature}`);
  assert.match(html,/www\.yourbrand\.in/);
  assert.match(copy,/Free discovery on LeBrands\.Space for all approved stores/);
  assert.doesNotMatch(html,/undo anything|shoppers already trust/i);
});

test("homepage removes the requested sections and explains four integrations",()=>{
  const html=renderHome();
  assert.doesNotMatch(html, /<section[^>]*(?:h-editor|h-checkout)|Make it yours|From idea to open|class="h-lanes/);
  const connections=html.match(/<section class="h-sec h-connect[\s\S]*?<\/section>/)[0];
  assert.equal((connections.match(/<article\b/g)||[]).length,4);
  for(const label of ["Custom domain","Social marketing","Razorpay","Delivery partner"])assert.ok(connections.includes(label));
  assert.doesNotMatch(html, /h-launch|h-launch-title|class="h-guide|Three clear steps/);
});

test("homepage footer CTA has explicit contrasting text, hover and focus colours",async()=>{
  const css=await readFile("src/public/marketing.css","utf8");
  assert.match(css,/\.m-footer-home \.hf-brand > \.m-cta\s*\{[^}]*color:\s*#2e2025;[^}]*background:\s*#f1b8ad;/);
  assert.match(css,/\.m-footer-home \.hf-brand > \.m-cta:hover\s*\{[^}]*color:\s*#2e2025;/);
  assert.match(css,/\.m-footer-home \.hf-brand > \.m-cta:focus-visible\s*\{[^}]*outline:\s*2px solid #fff;/);
});

function element(dataset={}){
  const selectors=new Map(),listeners={},attrs={},classes=new Set();
  const self={
    dataset,selectors,listeners,attrs,classes,hidden:false,textContent:"",value:"",
    querySelectorAll(s){return selectors.get(s)||[];},
    querySelector(s){return self.querySelectorAll(s)[0]||null;},
    addEventListener(type,fn){listeners[type]=fn;},
    setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k];},
    focus(){self.focused=true;},closest(){return self;},
    classList:{add(k){classes.add(k);},remove(k){classes.delete(k);},toggle(k,on){on?classes.add(k):classes.delete(k);}}
  };
  return self;
}
async function initialize(roots){
  const source=await readFile("src/public/marketing.js","utf8");
  const end=source.indexOf("/* Homepage slideshow:");
  const start=source.lastIndexOf("\n(() => {",end);
  assert.ok(start>0);
  const document=element();document.readyState="complete";
  for(const[s,items]of Object.entries(roots))document.selectors.set(s,items);
  runInNewContext(source.slice(start,end),{document});
}

test("visual-story tabs switch by pointer and keyboard with correct accessibility state",async()=>{
  const root=element(),list=element(),tabs=[element(),element(),element()],panels=tabs.map(()=>element());
  tabs.forEach((tab,i)=>tab.attrs["aria-selected"]=String(i===0));
  root.selectors.set("[data-h-tab]",tabs);root.selectors.set("[role=tabpanel]",panels);root.selectors.set("[role=tablist]",[list]);
  await initialize({"[data-h-tabs]":[root]});
  tabs[1].listeners.click();
  assert.equal(tabs[1].attrs["aria-selected"],"true");assert.equal(panels[1].hidden,false);assert.equal(panels[0].hidden,true);
  list.listeners.keydown({key:"End",preventDefault(){}});
  assert.equal(tabs[2].focused,true);assert.equal(tabs[2].tabIndex,0);
  list.listeners.keydown({key:"ArrowRight",preventDefault(){}});
  assert.equal(tabs[0].attrs["aria-selected"],"true");
});

test("variant demo updates all SKU fields without exposing real merchant data",async()=>{
  const root=element(),group=element(),button=element({price:"Rs. 1,399",sku:"DEW-50",stock:"17 in stock",cost:"Rs. 468"});
  button.parentElement=group;group.selectors.set("button",[button]);
  for(const key of ["price","sku","stock","cost"])root.selectors.set(`[data-h-out="${key}"]`,[element()]);
  await initialize({"[data-h-variants]":[root]});
  root.listeners.click({target:button});
  for(const[key,value]of Object.entries(button.dataset))assert.equal(root.querySelector(`[data-h-out="${key}"]`).textContent,value);
  assert.equal(button.attrs["aria-pressed"],"true");
});

test("checkout illustration calculates offers and never fabricates PIN results",async()=>{
  const root=element(),pin=element(),message=element(),disc=element(),total=element(),group=element();
  const fixed=element({hOffer:"fix"}),none=element({hOffer:"none"});
  fixed.parentElement=none.parentElement=group;group.selectors.set("button",[fixed,none]);
  for(const[s,item]of [["[data-h-pin]",pin],["[data-h-pin-out]",message],['[data-h-out="disc"]',disc],['[data-h-out="total"]',total]])root.selectors.set(s,[item]);
  await initialize({"[data-h-checkout]":[root]});
  root.listeners.click({target:fixed});assert.equal(total.textContent,"Rs. 1,614.00");
  root.listeners.click({target:none});assert.equal(total.textContent,"Rs. 1,764.00");
  pin.value="600001";pin.listeners.input();assert.match(message.textContent,/Example only.*Chennai/);assert.ok(message.classes.has("is-ok"));
  pin.value="123456";pin.listeners.input();assert.match(message.textContent,/only knows/);assert.ok(!message.classes.has("is-ok"));
  pin.value="ab60000199";pin.listeners.input();assert.equal(pin.value,"600001");
});

test("connection illustration advances and resets without activating any real service",async()=>{
  const root=element({hLabels:"Added|Checking|Secure|Live"}),steps=Array.from({length:4},()=>element()),button=element(),state=element(),lock=element();
  root.selectors.set(".h-flow-live li",steps);root.selectors.set("[data-h-cycle-next]",[button]);root.selectors.set("[data-h-state]",[state]);root.selectors.set("[data-h-lock]",[lock]);
  await initialize({"[data-h-cycle]":[root]});
  button.listeners.click();assert.equal(state.textContent,"Checking");
  button.listeners.click();assert.equal(state.textContent,"Secure");assert.ok(lock.classes.has("is-on"));
  button.listeners.click();assert.equal(state.textContent,"Live");assert.equal(button.textContent,"Start again");
  button.listeners.click();assert.equal(state.textContent,"Added");assert.ok(!lock.classes.has("is-on"));
});
