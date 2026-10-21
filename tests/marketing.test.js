import test from "node:test";
import assert from "node:assert/strict";
import { readFile,stat } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { renderHome,renderLegal } from "../src/ui/home.js";
import { renderPricing } from "../src/ui/marketing.js";
import { MARKETING_MEDIA } from "../src/ui/marketing-media.js";

test("Ann replaces the old wizard and dashboard captures retain current branding", () => {
  const html = renderHome();
  for (const media of [MARKETING_MEDIA.dashboard]) {
    for (const url of [media.src, ...media.srcset.split(",").map(value => value.trim().split(" ")[0])]) {
      assert.match(url, /home-current-dashboard(?:-\d+)?\.webp$/);
      assert.ok(html.includes(url));
    }
  }
  assert.equal(MARKETING_MEDIA.wizardVideo.src, "/img/REPLACE-wizard-loop-branded-clean.webm");
  assert.ok(html.includes(MARKETING_MEDIA.annBuilder.src));
  assert.ok(!html.includes(MARKETING_MEDIA.wizardVideo.src));
  assert.doesNotMatch(html, /\/img\/REPLACE-(?:dashboard(?:-\d+)?\.(?:webp|avif|jpg)|wizard-poster(?:-\d+)?\.(?:webp|avif|jpg)|wizard-loop\.webm)/);
});
import worker from "../src/index.js";

const text=html=>html.replace(/<[^>]+>/g," ").replace(/\s+/g," ");
test("the storyboard uses current Ann and Modern Boutique skincare captures",async()=>{
  const html=renderHome();
  assert.match(html,/Current Modern Boutique skincare sample storefront/);
  assert.doesNotMatch(html,/ann-store-editorial|REPLACE-store-photo|REPLACE-checkout|ann-conversation-builder\./);
  for(const media of [MARKETING_MEDIA.exampleDesktop,MARKETING_MEDIA.exampleMobile,MARKETING_MEDIA.annBuilder]){
    assert.match(media.src,/^\/img\/ann-skincare-boutique-/);
    assert.match(media.alt,/skincare/i);
    assert.ok(html.includes(media.src));
    for(const url of [media.src,...media.srcset.split(",").map(value=>value.trim().split(" ")[0])]){
      assert.ok((await stat("src/public"+url)).size>0,`Missing skincare preview: ${url}`);
    }
  }
});
const forbidden=/\b(?:unleash|elevate|empower|seamless|seamlessly|supercharge|effortless|effortlessly|revolutionise|game-changer|next-level|cutting-edge|robust|leverage|unlock|journey|tailored|delve|world-class|in today's fast-paced)\b/i;

test("homepage output has no en/em dashes, forbidden copy, or fake old pricing",()=>{
  for(const html of [renderHome(),renderPricing()]){
    assert.doesNotMatch(html,/[\u2013\u2014]/u,"Em and en dashes must never enter homepage output or metadata");
    assert.doesNotMatch(text(html),forbidden);
    assert.doesNotMatch(html,/MORU STUDIO|Founding offer|founding-stamp|price-plans|eyebrow|fonts\.googleapis\.com/);
  }
});

test("homepage has the exact title, canonical, Ann store OG image, single H1 and required CTA destinations",()=>{
  const html=renderHome();
  assert.match(html,/<title>LeBrands\.Store \| A flagship online store for Indian D2C brands<\/title>/);
  assert.match(html,/<link rel="canonical" href="https:\/\/lebrands\.store">/);
  assert.match(html,/<meta property="og:image" content="https:\/\/lebrands\.store\/img\/ann-skincare-boutique-desktop\.jpg">/);
  assert.doesNotMatch(html,/stonescence/i);
  assert.match(html,/fictional Example Studio store/);
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.match(html,/<h1[^>]*>A flagship store, built in a conversation\.<\/h1>/);
  for(const href of ["https://app.lebrands.store/signup","https://app.lebrands.store/login","/pricing","/refund-policy","/privacy","/terms","/contact"]){
    assert.ok(html.includes(`href="${href}"`),`Missing working destination: ${href}`);
  }
  for(const id of ["features","faq"])assert.ok(html.includes(`id="${id}"`));
});

test("homepage connects launch, commerce and support with honest availability labels",()=>{
  const html=renderHome(),copy=text(html);
  assert.doesNotMatch(html, /m-statement|Built around your point of view|Most store builders give you a website/);
  for(const required of [
    "Your products. Your flagship store.",
    "Ann","30 minutes","Razorpay","Cash on Delivery","GST",
    "Meta","Google","LeBrandsSpace Digital Private Limited","Chennai"
  ])assert.ok(copy.includes(required),`Missing requested copy: ${required}`);
  assert.equal((html.match(/class="m-faq-item /g)||[]).length,7);
  assert.match(copy,/valid GSTIN is required to publish/i);
  assert.doesNotMatch(copy,/First publication requires platform approval/);
  assert.match(copy,/target/i);
  assert.match(copy,/approval/i);
  assert.match(copy,/DNS|domain.*verification/i);
  assert.match(html,/href="\/support"/);
  for(const page of [html,renderPricing()]){
    assert.doesNotMatch(page,/300[,\s]?000|shoppers already looking|listing mean/i);
    assert.match(page,/LeBrandsSpace Digital Private Limited/);
  }
  assert.match(renderPricing(), /LeBrands\.Space/);
  for(const feature of ["Razorpay","Shiprocket"]){
    assert.ok(html.includes(feature));
  }
  assert.equal((html.match(/<p>[^<]*<span>Coming soon<\/span><\/p>/g)||[]).length,0);
  assert.match(renderPricing(),/Launch/);
  assert.match(renderPricing(),/Grow/);
  assert.match(renderPricing(),/Scale/);
  assert.match(renderPricing(),/Flagship/);
  assert.match(renderPricing(),/href="mailto:support@lebrands\.store"/);
  assert.match(renderLegal("refund-policy"),/Refund policy/);
  assert.match(renderLegal("refund-policy"),/draft/i);
});

test("real UI captures exist, concepts are labelled, responsive and lazy, and hero stays optimised",async()=>{
  const html=renderHome();
  for(const media of Object.values(MARKETING_MEDIA)){
    if(media.available){
      const path="src/public"+media.src;
      assert.ok((await stat(path)).size>0,"Available media must exist");
      if(media.poster){
        assert.ok((await stat("src/public"+media.poster.src)).size>0);
        assert.ok((await stat("src/public"+media.poster.fallback)).size>0);
        assert.ok(!html.includes(media.src),"The old wizard recording must not appear in the Ann section");
      }else{
        assert.ok(media.src.endsWith(".webp"));
        if(media.srcset&&html.includes(media.src))assert.ok(html.includes(media.srcset));
        if(media.fallback){
          assert.ok((await stat("src/public"+media.fallback)).size>0);
          if(html.includes(media.src))assert.ok(html.includes(media.avifSrcset));
          for(const candidate of (media.srcset+","+media.avifSrcset).split(",")){
            assert.ok((await stat("src/public"+candidate.trim().split(" ")[0])).size>0);
          }
          assert.match(media.alt,/fictional/i);
        }else assert.ok((await stat(path)).size<160000,"Current UI captures stay small and readable");
      }
    }else{
      assert.ok(html.includes(media.src),"Named placeholder must be disclosed");
      assert.ok(!html.includes(`src="${media.src}"`),"Do not fetch nonexistent media");
      if(media.poster)assert.ok(!html.includes(`poster="${media.poster}"`));
    }
  }
  assert.equal((html.match(/<img\b[^>]*fetchpriority="high"/g)||[]).length,2,"Only the two opening founder portraits are prioritised");
  assert.match(html,/loading="lazy"/);
  assert.match(html,/fictional|sample|illustrative/i);
  assert.doesNotMatch(html,/Image awaiting supply|Video awaiting supply/);
  const eagerBytes=(await stat("src/public/instrument-sans-latin.woff2")).size+
    Buffer.byteLength(html.match(/<section class="h-sec h-pain[\s\S]*?<\/section>/)[0]);
  assert.ok(eagerBytes<150000,"Font and opening-scene markup budget is under 150 KB");
});

test("homepage middle sections are white in both modes without changing hero, footer or pricing",async()=>{
  const css=await readFile("src/public/marketing.css","utf8"),html=renderHome();
  const band=css.match(/:root:root #top > section:not\(\.m-hero\)\s*\{([^}]+)\}/)?.[1];
  assert.ok(band,"White surfaces must apply to every non-hero homepage section");
  assert.match(band,/background:\s*#ffffff/);
  assert.match(band,/color-scheme:\s*light/);
  assert.match(band,/--band-fg:\s*#38282b/);
  assert.match(band,/--m-paper:\s*#ffffff/);
  assert.match(css,/\.m-footer, \.m-pricing-page \.m-footer \{ background-color: #0c090b; background-image: var\(--m-dark-grad\)/);
  assert.match(css,/#top \.m-principles \.m-promise-stage \{ background: #ffffff; color: #38282b/);
  const section=html.match(/<section class="h-sec h-ann[\s\S]*?<\/section>/)?.[0];
  assert.match(section,/Ann/);
  assert.ok(section.includes(MARKETING_MEDIA.annBuilder.src));
  assert.doesNotMatch(section,/<video|REPLACE-wizard/);
  assert.ok(html.includes(MARKETING_MEDIA.exampleDesktop.src));
  assert.ok(html.includes(MARKETING_MEDIA.exampleMobile.src));
});

test("marketing routes are read-only, scoped CSP supports font/video, and preview routes are absent in production",async()=>{
  const requests=[];
  const env={ASSETS:{async fetch(request){
    requests.push(new URL(request.url).pathname);
    return new Response(request.method==="HEAD"?null:"public asset",{headers:{"content-type":"application/octet-stream"}});
  }}};
  for(const key of ["SUPABASE_DB_URL","SUPABASE_APP_DB_URL"])Object.defineProperty(env,key,{get(){throw new Error("Marketing must not access the database");}});
  for(const pathname of ["/","/pricing","/refund-policy"]){
    const response=await worker.fetch(new Request("https://lebrands.store"+pathname),env,{});
    assert.equal(response.status,200);
    assert.match(response.headers.get("content-type"),/text\/html/);
    if(pathname!=="/refund-policy"){
      assert.match(response.headers.get("content-security-policy"),/font-src 'self'/);
      assert.match(response.headers.get("content-security-policy"),/media-src 'self'/);
    }
    const head=await worker.fetch(new Request("https://lebrands.store"+pathname,{method:"HEAD"}),env,{});
    assert.equal(head.status,200);assert.equal(await head.text(),"");
    const post=await worker.fetch(new Request("https://lebrands.store"+pathname,{method:"POST"}),env,{});
    assert.equal(post.status,405);
  }
  const annMedia=Object.values(MARKETING_MEDIA).filter(media=>media.src.endsWith(".webp"));
  const annPaths=annMedia.flatMap(media=>[media.src,...(media.srcset||"").split(",").filter(Boolean).map(value=>value.trim().split(" ")[0])]);
  for(const pathname of ["/assets/marketing.css","/assets/marketing.js","/assets/instrument-sans-latin.woff2","/img/home-founder-woman.webp","/img/home-founder-man.webp","/img/home-founder-ann-laptop.webp",...new Set(annPaths)]){
    const response=await worker.fetch(new Request("https://lebrands.store"+pathname),env,{});
    assert.equal(response.status,200);assert.equal(response.headers.get("x-content-type-options"),"nosniff");
  }
  const count=requests.length;
  for(const pathname of ["/__step4-preview","/__aura-preview?capture=stonescence","/__dashboard-preview","/__example-preview/store","/__example-preview/invoice","/__example-preview/premium-store","/__example-preview/premium-checkout","/__example-media/indigo-shirt.webp","/__example-module/aura.js","/__example-module/premium-example-client.js","/img/local-example/indigo-shirt.webp","/assets/preview.js","/img/.stonescence-capture.html","/img/private.sql"]){
    assert.equal((await worker.fetch(new Request("https://lebrands.store"+pathname),env,{})).status,404);
  }
  assert.equal(requests.length,count,"Unknown/preview files must not reach the public asset binding");
});

test("marketing motion honours reduced motion and automatic video playback only when visible",async()=>{
  const source=await readFile("src/public/marketing.js","utf8");
  function setup(reduced,search=""){
    const classes=new Set(),itemClasses=new Set(),observers=[];
    let plays=0,pauses=0,onPreferenceChange;
    const poster={classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){}};
    const video={parentElement:{querySelector(){return poster;}},classList:{add(){},remove(){}},
      setAttribute(){},removeAttribute(){},addEventListener(){},querySelectorAll(){return [];},
      load(){},pause(){pauses++;},play(){plays++;return Promise.resolve();}};
    const item={matches(){return false;},classList:{add(name){itemClasses.add(name);},toggle(name,on){on?itemClasses.add(name):itemClasses.delete(name);}}};
    const preference={matches:reduced,addEventListener(_event,callback){onPreferenceChange=callback;}};
    class Observer{
      constructor(callback){this.callback=callback;observers.push(this);}
      observe(){}unobserve(){}disconnect(){}
    }
    const context={
      URLSearchParams,IntersectionObserver:Observer,
      window:{location:{search},matchMedia(){return preference;},addEventListener(){},requestAnimationFrame(callback){callback();},IntersectionObserver:Observer},
      document:{
        addEventListener(){},
        querySelector(){return null;},
        querySelectorAll(selector){return selector===".m-reveal"?[item]:selector===".m-wizard-media video"?[video]:[];},
        documentElement:{classList:{add(name){classes.add(name);},remove(name){classes.delete(name);},toggle(name,on){on?classes.add(name):classes.delete(name);}}}
      }
    };
    runInNewContext(source,context);
    return {classes,itemClasses,observers,video,preference,get plays(){return plays;},get pauses(){return pauses;},change(){onPreferenceChange();}};
  }
  for(const state of [setup(true),setup(false,"?motion=off")]){
    assert.equal(state.plays,0);assert.ok(state.pauses>0);
    assert.ok(state.itemClasses.has("is-visible"));assert.ok(!state.classes.has("m-motion"));
  }
  const state=setup(false);
  assert.ok(state.classes.has("m-motion"));
  assert.equal(state.observers.length,2);
  state.observers[1].callback([{target:state.video,isIntersecting:true}]);
  assert.equal(state.plays,1);
  state.observers[1].callback([{target:state.video,isIntersecting:false}]);
  assert.ok(state.pauses>0);
  state.preference.matches=true;state.change();
  assert.ok(!state.classes.has("m-motion"));
});

test("landing theme initializes before DOM readiness, follows OS, and preserves an explicit choice",async()=>{
  const source=await readFile("src/public/marketing.js","utf8");
  function setup(saved=null,blocked=false){
    const attrs={},buttonAttrs={},metaAttrs={},events={},buttonEvents={};
    const label={textContent:""},classes=new Set();
    const system={matches:true,addEventListener(_name,cb){this.change=cb;}};
    let stored=saved;
    const button={setAttribute(k,v){buttonAttrs[k]=v;},addEventListener(k,cb){buttonEvents[k]=cb;}};
    const context={
      URLSearchParams,
      window:{
        location:{search:"?motion=off"},
        localStorage:{getItem(){if(blocked)throw new Error("Disabled");return stored;},setItem(_k,v){if(blocked)throw new Error("Disabled");stored=v;}},
        matchMedia(query){return query.includes("color-scheme")?system:{matches:true,addEventListener(){}};},
        addEventListener(){},requestAnimationFrame(cb){cb();}
      },
      document:{
        readyState:"loading",
        documentElement:{setAttribute(k,v){attrs[k]=v;},classList:{add(k){classes.add(k);},remove(k){classes.delete(k);},toggle(k,on){on?classes.add(k):classes.delete(k);}}},
        querySelector(selector){return selector==="[data-m-theme-color]"?{setAttribute(k,v){metaAttrs[k]=v;}}:selector==="[data-theme-label]"?label:null;},
        querySelectorAll(selector){return selector==="[data-theme-toggle]"?[button]:[];},
        addEventListener(k,cb){const previous=events[k];events[k]=event=>{previous?.(event);cb(event);};}
      }
    };
    runInNewContext(source,context);
    return {attrs,buttonAttrs,metaAttrs,label,system,classes,click(){buttonEvents.click();},ready(){events.DOMContentLoaded();},get stored(){return stored;}};
  }
  const state=setup();
  assert.equal(state.attrs["data-theme"],"dark","Theme must initialize before DOM ready");
  state.ready();
  assert.equal(state.buttonAttrs["aria-label"],"Switch to light mode");
  assert.equal(state.buttonAttrs["aria-pressed"],"true");
  state.system.change({matches:false});
  assert.equal(state.attrs["data-theme"],"light");
  state.click();
  assert.equal(state.attrs["data-theme"],"dark");
  assert.equal(state.stored,"dark");
  state.system.change({matches:false});
  assert.equal(state.attrs["data-theme"],"dark","OS changes must not override a selected theme");
  assert.equal(setup(state.stored).attrs["data-theme"],"dark","Choice survives a reload");
  const unavailable=setup(null,true);
  unavailable.ready();unavailable.click();
  assert.equal(unavailable.attrs["data-theme"],"light","Toggle still works if storage is blocked");
  assert.ok(!unavailable.classes.has("m-motion"));
});

test("landing preserves supplied logos and provides interactive visual feature stories",async()=>{
  const html=renderHome(),css=await readFile("src/public/marketing.css","utf8");
  assert.match(html,/data-theme-toggle/);
  assert.match(html,/<script src="\/assets\/marketing\.js"><\/script>/);
  for(const variant of ["light","dark"]){
    assert.match(html,new RegExp(`REPLACE-lebrands-${variant}-transparent\\.webp`));
    assert.ok((await stat(`src/public/img/REPLACE-lebrands-${variant}-transparent.webp`)).size<45000);
  }
  assert.ok((html.match(/\bdata-h-tabs\b/g)||[]).length>=3);
  assert.match(html,/data-h-variants/);
  assert.match(html,/data-h-checkout/);
  assert.doesNotMatch(html,/class="m-detail-row/);
  assert.match(html,/data-h-cycle/);
  assert.match(css,/\.m-craft-carousel:not\(\.is-enhanced\)/);
  assert.match(css,/@keyframes/);
  assert.match(css,/:root\[data-theme="dark"\] #top > section\.m-band-dark/);
  assert.match(css,/:root\[data-theme="dark"\] #top > section\.m-band-light/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
});

test("showcase autoplay, manual selection, explicit pause and motion preferences work together",async()=>{
  const source=await readFile("src/public/marketing.js","utf8");
  function setup(reduced=false,search=""){
    const timers=new Map(),observers=[],events={},documentEvents={};
    let timerId=0,onMotionChange;
    function element(){
      const attrs={},classes=new Set(),listeners={};
      return {attrs,classes,listeners,hidden:false,disabled:false,textContent:"",matches(){return false;},
        setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k];},
        addEventListener(k,cb){listeners[k]=cb;},
        classList:{add(k){classes.add(k);},remove(k){classes.delete(k);},toggle(k,on){on?classes.add(k):classes.delete(k);}}};
    }
    const slides=Array.from({length:4},(_,i)=>{const e=element();e.attrs["aria-label"]=`${i+1} of 4: Item ${i+1}`;return e;});
    const buttons=slides.map((_,i)=>({...element(),dataset:{craftSelect:String(i)}}));
    const previous=element(),next=element(),toggle=element(),live=element(),carousel=element();
    carousel.contains=()=>false;
    carousel.querySelectorAll=s=>s==="[data-craft-slide]"?slides:buttons;
    carousel.querySelector=s=>({"[data-craft-prev]":previous,"[data-craft-next]":next,"[data-craft-toggle]":toggle,"[data-craft-live]":live}[s]||null);
    const preference={matches:reduced,addEventListener(_k,cb){onMotionChange=cb;}};
    class Observer{constructor(cb){this.cb=cb;observers.push(this);}observe(){}disconnect(){}unobserve(){}}
    const doc={hidden:false,readyState:"complete",documentElement:element(),
      querySelector:s=>s==="[data-craft-carousel]"?carousel:null,querySelectorAll:()=>[],
      addEventListener(k,cb){documentEvents[k]=cb;}};
    runInNewContext(source,{URLSearchParams,IntersectionObserver:Observer,document:doc,
      window:{location:{search},matchMedia:q=>q.includes("reduced-motion")?preference:{matches:false,addEventListener(){}},
        localStorage:{getItem(){return null;}},IntersectionObserver:Observer,
        requestAnimationFrame(cb){cb();},addEventListener(k,cb){events[k]=cb;},
        setTimeout(cb,ms){assert.equal(ms,5200);timers.set(++timerId,cb);return timerId;},clearTimeout(id){timers.delete(id);}}});
    return {timers,slides,buttons,previous,next,toggle,carousel,doc,preference,
      active:()=>slides.findIndex(e=>!e.hidden),
      view(inView){observers[0]?.cb([{target:carousel,isIntersecting:inView}]);},
      tick(){const entry=timers.entries().next().value;assert.ok(entry,"Autoplay timer missing");timers.delete(entry[0]);entry[1]();},
      motion(value){preference.matches=value;onMotionChange();},
      visibility(hidden){doc.hidden=hidden;documentEvents.visibilitychange();}};
  }
  const s=setup();
  assert.equal(s.active(),0);assert.equal(s.timers.size,0);
  s.view(true);s.tick();assert.equal(s.active(),1);
  s.toggle.listeners.click();assert.equal(s.timers.size,0);
  s.next.listeners.click();assert.equal(s.active(),2);assert.equal(s.timers.size,0);
  s.view(false);s.view(true);assert.equal(s.timers.size,0,"Explicit pause must survive leaving/re-entering");
  s.toggle.listeners.click();assert.equal(s.timers.size,1);
  s.carousel.listeners.mouseenter();assert.equal(s.timers.size,0);
  s.carousel.listeners.mouseleave();assert.equal(s.timers.size,1);
  s.carousel.listeners.focusin();assert.equal(s.timers.size,0);
  s.carousel.listeners.focusout({relatedTarget:null});assert.equal(s.timers.size,1);
  s.visibility(true);assert.equal(s.timers.size,0);
  s.visibility(false);assert.equal(s.timers.size,1);
  s.buttons[3].listeners.click();assert.equal(s.active(),3);
  s.carousel.listeners.keydown({key:"Home",preventDefault(){}});assert.equal(s.active(),0);
  s.previous.listeners.click();assert.equal(s.active(),3,"Previous wraps to the last slide");
  s.motion(true);assert.equal(s.timers.size,0);
  for(const quiet of [setup(true),setup(false,"?motion=off")]){
    quiet.view(true);assert.equal(quiet.timers.size,0);
    quiet.next.listeners.click();assert.equal(quiet.active(),1,"Manual navigation must work without automatic motion");
    assert.equal(quiet.timers.size,0);
  }
});
