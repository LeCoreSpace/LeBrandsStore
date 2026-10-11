import test from "node:test";
import assert from "node:assert/strict";
import { readFile,stat } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { renderHome,renderLegal } from "../src/ui/home.js";
import { renderPricing } from "../src/ui/marketing.js";
import { MARKETING_MEDIA } from "../src/ui/marketing-media.js";
import worker from "../src/index.js";

const text=html=>html.replace(/<[^>]+>/g," ").replace(/\s+/g," ");
const forbidden=/\b(?:unleash|elevate|empower|seamless|seamlessly|supercharge|effortless|effortlessly|revolutionise|game-changer|next-level|cutting-edge|robust|leverage|unlock|journey|tailored|delve|world-class|in today's fast-paced)\b/i;

test("homepage output has no en/em dashes, forbidden copy, or fake old pricing",()=>{
  for(const html of [renderHome(),renderPricing()]){
    assert.doesNotMatch(html,/[\u2013\u2014]/u,"Em and en dashes must never enter homepage output or metadata");
    assert.doesNotMatch(text(html),forbidden);
    assert.doesNotMatch(html,/MORU STUDIO|Founding offer|founding-stamp|price-plans|eyebrow|fonts\.googleapis\.com/);
  }
});

test("homepage has the exact title, canonical, original concept OG image, single H1 and required CTA destinations",()=>{
  const html=renderHome();
  assert.match(html,/<title>LeBrands\.Store \| A flagship online store for Indian D2C brands<\/title>/);
  assert.match(html,/<link rel="canonical" href="https:\/\/lebrands\.store">/);
  assert.match(html,/<meta property="og:image" content="https:\/\/lebrands\.store\/img\/REPLACE-example-desktop\.jpg">/);
  assert.doesNotMatch(html,/stonescence/i);
  assert.match(html,/Example store concept/);
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.match(html,/<h1[^>]*>A flagship store for your brand\.<\/h1>/);
  for(const href of ["https://app.lebrands.store/signup","https://app.lebrands.store/login","/pricing","/refund-policy","/privacy","/terms","/contact"]){
    assert.ok(html.includes(`href="${href}"`),`Missing working destination: ${href}`);
  }
  for(const id of ["features","faq"])assert.ok(html.includes(`id="${id}"`));
});

test("homepage preserves the requested story, seven native FAQ items, and honest availability labels",()=>{
  const html=renderHome(),copy=text(html);
  for(const required of [
    "Live today. Built for Indian D2C brands that intend to be remembered.",
    "Most store builders give you a website. We give you a storefront that looks like you already made it.",
    "Tell us about your brand.","Choose your look and watch it build live.",
    "Add your products and publish.","Your store is live at yourbrand.lebrands.store.",
    "Product pages, collections, cart and checkout designed to sell, on every screen size.",
    "Cash on delivery with built-in fraud protection, COD limits and order tracking for your customers.",
    "Orders from packed to delivered, customers, and payment collection in one calm dashboard.",
    "GST tax invoices with CGST, SGST or IGST worked out for you, numbered correctly every financial year.",
    "Your store, with shoppers already looking.","300,000+ brands across 38 categories.",
    "Rolling out.","Zero commission on your sales.","Your domain, your payments, your customer data.",
    "We never market to your customers.","Simple monthly pricing. No commission, ever.",
    "Your brand is ready. Your store can be too.","LeBrandsSpace Digital Private Limited","Chennai"
  ])assert.ok(copy.includes(required),`Missing requested copy: ${required}`);
  assert.equal((html.match(/<details\b/g)||[]).length,7);
  assert.match(copy,/valid GSTIN is required to publish/i);
  assert.match(copy,/First publication requires platform approval/);
  for(const feature of ["Razorpay","Shiprocket","Your own domain","Order emails","Drag-and-drop page editor","Bazaar"]){
    assert.ok(html.includes(feature));
  }
  assert.equal((html.match(/<p>[^<]*<span>Coming soon<\/span><\/p>/g)||[]).length,6);
  assert.match(copy,/Listings are not yet available for every store/);
  assert.match(renderPricing(),/Pricing is being finalised\. Talk to us\./);
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
        assert.ok(html.includes(media.poster.avifSrcset));
        assert.ok(html.includes(`data-src="${media.src}"`));
        assert.ok(!html.includes(` src="${media.src}"`),"Video is loaded only when visible");
      }else{
        assert.ok(media.src.endsWith(".webp"));
        assert.ok(html.includes(media.srcset));
        if(media.fallback){
          assert.ok((await stat("src/public"+media.fallback)).size>0);
          assert.ok(html.includes(media.avifSrcset));
          for(const candidate of (media.srcset+","+media.avifSrcset).split(",")){
            assert.ok((await stat("src/public"+candidate.trim().split(" ")[0])).size>0);
          }
          assert.match(media.alt,/fictional/i);
        }else assert.ok((await stat(path)).size<100000,"Genuine hero captures stay small");
      }
    }else{
      assert.ok(html.includes(media.src),"Named placeholder must be disclosed");
      assert.ok(!html.includes(`src="${media.src}"`),"Do not fetch nonexistent media");
      if(media.poster)assert.ok(!html.includes(`poster="${media.poster}"`));
    }
  }
  assert.equal((html.match(/<img\b[^>]*fetchpriority="high"/g)||[]).length,2);
  assert.match(html,/loading="lazy"/);
  assert.equal((html.match(/class="m-media-caption">Example store</g)||[]).length,5);
  assert.doesNotMatch(html,/Image awaiting supply|Video awaiting supply/);
  const eagerBytes=(await stat("src/public/instrument-sans-latin.woff2")).size+
    (await stat("src/public/img/REPLACE-example-desktop-1280.webp")).size+
    (await stat("src/public/img/REPLACE-example-mobile-390.webp")).size;
  assert.ok(eagerBytes<250000,"Font and responsive hero WebP imagery budget is under 250 KB");
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
  for(const pathname of ["/assets/marketing.css","/assets/marketing.js","/assets/instrument-sans-latin.woff2",MARKETING_MEDIA.exampleDesktop.src,MARKETING_MEDIA.exampleMobile.src]){
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
    const item={classList:{add(name){itemClasses.add(name);}}};
    const preference={matches:reduced,addEventListener(_event,callback){onPreferenceChange=callback;}};
    class Observer{
      constructor(callback){this.callback=callback;observers.push(this);}
      observe(){}unobserve(){}disconnect(){}
    }
    const context={
      URLSearchParams,IntersectionObserver:Observer,
      window:{location:{search},matchMedia(){return preference;},addEventListener(){},requestAnimationFrame(callback){callback();},IntersectionObserver:Observer},
      document:{
        querySelector(){return null;},
        querySelectorAll(selector){return selector===".m-reveal"?[item]:[video];},
        documentElement:{classList:{add(name){classes.add(name);},remove(name){classes.delete(name);}}}
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
