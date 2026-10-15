import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { AURA_STYLES, styleSettings, stylePatch, STYLE_THEME_KEYS } from "../src/public/aura-styles.js";
import { stylePreviewData, renderStylePreview, demoCommerce } from "../src/public/style-preview.js";
import { renderStyleStudio } from "../src/ui/style-studio.js";
import { renderAura } from "../src/public/aura.js";
import { themeSnapshot, themePatch, themeChanges } from "../src/public/editor-state.js";
import { settingsPatch } from "../src/store/input.js";
import { attachAuraMotion } from "../src/public/aura-motion.js";
import { handleStoreRoutes } from "../src/store/routes.js";
import { styleDemonstration } from "../src/public/style-demo-copy.js";

const source={store:{store_id:"11111111-1111-4111-8111-111111111111",name:"Example Studio",subdomain:"example"},
  settings:{category:"fashion",subcategory:"mens-clothing",theme:"aura",accent_color:"#3d4a43",font_preset:"modern",button_style:"rounded",color_preset:"white"},
  role:"owner",products:[],collections:[],layouts:{},policies:[],aura_skeleton_enabled:true};

test("five explicit style definitions validate and old themes remain unstyled",()=>{
  assert.equal(AURA_STYLES.length,5);assert.ok(AURA_STYLES.some(style=>style.id==="vintage"));
  for(const style of AURA_STYLES){
    assert.equal(style.settings.color_preset,"white");
    assert.deepEqual(settingsPatch(styleSettings(style.id)),style.settings);
    const html=renderAura({...source,settings:{...source.settings,...style.settings}});
    assert.match(html,new RegExp(`data-style="${style.id}"`));assert.match(html,/aura-styles\.css/);
  }
  assert.throws(()=>styleSettings("unknown"));
  assert.throws(()=>settingsPatch({style_preset:'"><script>'}));
  assert.doesNotMatch(renderAura(source),/data-style=|aura-styles\.css/);
  assert.doesNotMatch(renderAura({...source,settings:{...source.settings,style_preset:'"><script>'}}),/aura-styles\.css|data-style=/);
  const from=themeSnapshot(source.settings),to=themeSnapshot({...source.settings,...styleSettings("editorial")});
  assert.equal(themePatch(from,to).style_preset,"editorial");
  assert.ok(themeChanges(from,to).some(line=>line.includes("Aura style")));
});

test("demo store contains products, collections and rich sections but never mutates inventory",()=>{
  const original=structuredClone(source),preview=stylePreviewData(source);
  assert.equal(preview.style_demo,true);assert.ok(preview.products.length>=5);assert.ok(preview.collections.length>=3);
  assert.ok(preview.products.every(p=>p.images.length&&p.price_paise>0));
  assert.ok(preview.layouts.home.find(s=>s.type==="hero")?.settings.image?.url);
  assert.deepEqual(source,original);
  for(const style of AURA_STYLES)for(const page of ["home","collection","product","cart","checkout"]){
    const html=renderStylePreview(preview,styleSettings(style.id),{page,productId:preview.products[0].id});
    assert.match(html,new RegExp(`data-style="${style.id}"`));
    assert.doesNotMatch(html,/<script[^>]+src=/);
    assert.match(html,/noindex, nofollow/);
  }
  const real={...source,products:[{id:"owned",title:"Real product",status:"active",images:[],price_paise:150000}],
    layouts:{home:[{id:"custom",type:"header",settings:{},blocks:[]}]}};
  const actual=stylePreviewData(real);
  assert.equal(actual.style_demo,false);assert.equal(actual.products[0].id,"owned");
  assert.equal(actual.layouts.home[0].id,"custom");
  assert.deepEqual(real.layouts.home,[{id:"custom",type:"header",settings:{},blocks:[]}]);
  assert.deepEqual(Object.keys(stylePatch(styleSettings("boutique"))).sort(),[...STYLE_THEME_KEYS].sort());
});

test("interactive preview bag is isolated and never calculates tax or submits orders",()=>{
  const preview=stylePreviewData(source),id=preview.products[0].id;
  const bag=new Map([[id,2]]);
  const cart=demoCommerce(preview,bag);
  assert.match(cart.lines,/data-preview-quantity/);assert.match(cart.lines,/value="2"/);
  assert.match(cart.summary,/Subtotal/);assert.doesNotMatch(cart.summary,/GST|data-place-order|type="submit"/);
  assert.match(demoCommerce(preview,new Map()).lines,/empty/);
  assert.equal(source.products.length,0);
});

test("studio is sandboxed, escaped, read-only in fixtures and supports full-screen browsing",()=>{
  const html=renderStyleStudio({...source,store:{...source.store,name:"</script><script>bad()</script>"}},null,{readOnly:true});
  assert.match(html,/sandbox="allow-same-origin"/);assert.doesNotMatch(html,/allow-scripts|allow-forms/);
  assert.match(html,/"readOnly":true/);assert.match(html,/id="as-fullscreen"/);
  assert.doesNotMatch(html,/<script>bad\(\)<\/script>/);
  assert.match(html,/id="as-apply"[^>]+disabled/);
});

test("motion is progressive and respects reduced-motion preference",()=>{
  let animated=0,observed=0;
  const target={animate:()=>animated++};
  const win={matchMedia:()=>({matches:false}),addEventListener:()=>{},
    IntersectionObserver:class{constructor(callback){this.callback=callback;}observe(t){observed++;this.callback([{isIntersecting:true,target:t}]);}unobserve(){}disconnect(){}}};
  const doc={body:{dataset:{style:"editorial"}},defaultView:win,querySelectorAll:()=>[target]};
  attachAuraMotion(doc);assert.equal(observed,1);assert.equal(animated,1);
  win.matchMedia=()=>({matches:true});attachAuraMotion(doc);assert.equal(animated,1);
  doc.body.dataset={};attachAuraMotion(doc);assert.equal(animated,1);
});

test("staff cannot bypass the studio and apply a preset through the setup API",async()=>{
  const queries=[];
  const db={withMemberStore:async(id,hash,fn)=>fn(async(strings,...values)=>{
    const sql=strings.join("?");
    queries.push(sql);
    if(sql.includes("FROM public.store_members"))return [{role:"staff"}];
    throw new Error("No style write may be attempted.");
  })};
  const response=await handleStoreRoutes(new Request(`https://app.lebrands.store/api/stores/${source.store.store_id}/setup`,{
    method:"PATCH",headers:{"content-type":"application/json",origin:"https://app.lebrands.store"},
    body:JSON.stringify({settings:styleSettings("editorial")}),
  }),{},db,{id:"22222222-2222-4222-8222-222222222222"},"a".repeat(64));
  assert.equal(response.status,403);
  assert.ok(queries.every(sql=>!/\b(?:INSERT|UPDATE|DELETE)\b/.test(sql)));
});

test("live studio controller previews immediately and saves styling only with stale-draft protection",async()=>{
  const script=(await readFile(new URL("../src/public/style-studio.js",import.meta.url),"utf8")).replace(/^import .*;\n/gm,"");
  function node(dataset={}){
    return {dataset,attributes:{},disabled:false,value:"",textContent:"",listeners:{},
      setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},
      fire(type,event={}){return this.listeners[type]?.({target:this,...event});}};
  }
  const ids=Object.fromEntries(["as-preview","as-canvas","as-status","as-palette","as-font","as-accent","as-apply","as-reset","as-fullscreen","as-catalog-note"].map(key=>[key,node()]));
  const choices=AURA_STYLES.map(s=>node({styleChoice:s.id})),pages=["home","collection","product","cart","checkout"].map(page=>node({page})),devices=["desktop","mobile"].map(device=>node({device}));
  const boot={...structuredClone(source),readOnly:false};
  ids["style-studio-data"]={textContent:JSON.stringify(boot)};
  let fresh={settings:{...boot.settings}},patches=[];
  const context={structuredClone,Map,URL,location:{origin:"https://app.lebrands.store"},console,
    document:{querySelector:q=>ids[q.slice(1)],querySelectorAll:q=>q==="[data-style-choice]"?choices:q==="[data-page]"?pages:devices,
      body:{classList:{toggle:()=>true}}},
    window:{addEventListener:()=>{}},
    fetch:async(url,options)=>({ok:true,json:async()=>{
      if(options.method==="PATCH"){patches.push(JSON.parse(options.body));return fresh;}
      return fresh;
    }}),
    AURA_STYLES,STYLE_IDS:AURA_STYLES.map(s=>s.id),STYLE_THEME_KEYS,styleSettings,stylePatch,stylePreviewData,renderStylePreview,themeSnapshot,
    attachAuraSearch(){},attachAuraCatalog(){},attachStyleInteractions(){},
  };
  vm.runInNewContext(script,context);
  assert.equal(patches.length,0);
  choices[0].fire("click");assert.match(ids["as-preview"].srcdoc,/data-style="editorial"/);
  assert.equal(patches.length,0);
  pages[3].fire("click");assert.match(ids["as-preview"].srcdoc,/Your bag/);
  devices[1].fire("click");assert.equal(ids["as-canvas"].dataset.device,"mobile");
  ids["as-font"].value="classic";ids["as-font"].fire("change");
  assert.match(ids["as-preview"].srcdoc,/data-font="classic"/);
  await ids["as-apply"].fire("click");
  assert.equal(patches.length,1);assert.equal(patches[0].settings.style_preset,"editorial");
  assert.deepEqual(Object.keys(patches[0]),["settings"]);
  assert.deepEqual(Object.keys(patches[0].settings).sort(),[...STYLE_THEME_KEYS].sort());
  fresh={settings:{...boot.settings,accent_color:"#123456"}};
  choices[1].fire("click");await ids["as-apply"].fire("click");
  assert.equal(patches.length,1);assert.match(ids["as-status"].textContent,/changed in another tab/);
  // Every style/device has a real scrolling document and independent progress.
  function loadAt(top=0) {
    const doc={scrollingElement:{scrollTop:top},addEventListener(){},
      defaultView:{scrollTo({top}){doc.scrollingElement.scrollTop=top;},addEventListener(){}}};
    ids["as-preview"].contentDocument=doc;
    ids["as-preview"].fire("load");
    return doc;
  }
  choices[0].fire("click");
  const editorial=loadAt();editorial.scrollingElement.scrollTop=420;
  choices[4].fire("click");
  const vintage=loadAt();vintage.scrollingElement.scrollTop=180;
  choices[0].fire("click");
  assert.equal(loadAt().scrollingElement.scrollTop,420);
  devices[0].fire("click");assert.equal(loadAt().scrollingElement.scrollTop,0);
  devices[1].fire("click");assert.equal(loadAt().scrollingElement.scrollTop,420);
  choices[4].fire("click");assert.equal(loadAt().scrollingElement.scrollTop,180);
  assert.match(ids["as-preview"].title,/Vintage, interactive mobile/);
});

test("all five previews share imagery, products and prices, with distinct demo copy only",()=>{
  const demo=stylePreviewData(source),original=structuredClone(demo),titles=[];
  for(const style of AURA_STYLES){
    const themed=styleDemonstration(demo,style.id);
    assert.deepEqual(themed.products,demo.products);assert.deepEqual(themed.collections,demo.collections);
    assert.deepEqual(themed.layouts.home.find(s=>s.type==="hero").settings.image,
      demo.layouts.home.find(s=>s.type==="hero").settings.image);
    titles.push(themed.layouts.home.find(s=>s.type==="hero").settings.title);
    const html=renderStylePreview(demo,styleSettings(style.id));
    assert.match(html,/overflow-y:scroll/);assert.match(html,/scrollbar-gutter:stable/);
  }
  assert.equal(new Set(titles).size,5);assert.deepEqual(demo,original);
  const merchant={...demo,style_demo:false};
  assert.equal(styleDemonstration(merchant,"vintage"),merchant);
  const shell=renderStyleStudio(source);
  for(const style of AURA_STYLES)assert.equal((shell.match(new RegExp(`data-style-choice="${style.id}"`,"g"))||[]).length,2);
  assert.match(shell,/aria-label="Preview viewport"/);
});
