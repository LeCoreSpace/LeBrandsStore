import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { renderHome } from "../src/ui/marketing.js";
import worker from "../src/index.js";

test("black hero explains current features and keeps all slides readable without JS", async () => {
  const html = renderHome().match(/<section class="m-hero"[\s\S]*?<\/section>/)[0];
  assert.equal((html.match(/data-hs-slide\b/g) || []).length, 7);
  assert.equal((html.match(/Sample UI, illustrative/g) || []).length, 4);
  assert.equal((html.match(/\bdata-hero-line\b/g) || []).length, 1);
  assert.doesNotMatch(html, /class="m-hero-(?:lede|summary|points|soon)"/);
  assert.equal((html.match(/data-hs-line="/g) || []).length, 7);
  assert.equal((html.match(/<span class="m-hs-tag">Integration setup, illustrative<\/span>/g) || []).length, 2);
  assert.match(html, /Razorpay/);
  assert.match(html, /logistics partners/i);
  assert.match(renderHome(), /src="\/img\/REPLACE-lebrands-hero-transparent\.png"/);
  assert.doesNotMatch(html, /First publication requires platform approval|m-hero-actions|m-hero-note|Explore the store concept|Open your store/);
  assert.match(renderHome(), /First publication requires platform approval/);
  const css = await readFile("src/public/marketing.css", "utf8");
  assert.match(css, /section\.m-hero\s*\{[\s\S]*?background:\s*#09090a/);
  assert.match(css, /\.m-hs:not\(\.is-enhanced\) \.m-hs-slide\[hidden\]\s*\{\s*display: block/);
  assert.match(css, /\.m-hero\.is-paused \*, \.m-page-hidden \.m-hero \*[\s\S]*?animation-play-state: paused/);
  assert.match(html, /m-hs-chrome/);
  assert.match(html, /Sample data, illustrative/);
  assert.match(css, /\.m-hs-scene, \.m-hs, \.m-hs-slides, \.m-hs-card \{ transform-style: flat; \}/);
  assert.match(html, /class="m-hs-notifications" aria-hidden="true"/);
  assert.match(css, /\.m-hs-notifications \.m-hs-toast \{ position: relative; inset: auto;/);
  assert.match(css, /m-hs-progress 6\.5s linear forwards/);
  assert.match(css, /m-hs-draw 1\.6s ease-out \.15s forwards/);
  assert.match(css, /m-hs-dot 3\.2s ease-in-out 1s infinite/);
  assert.match(css, /\.m-hero\.is-paused \*::before, \.m-hero\.is-paused \*::after \{ animation-play-state: paused/);
  const integrationSlides=[...html.matchAll(/<article\b[^>]*data-hs-slide\b[^>]*>[\s\S]*?<\/article>/g)]
    .map(([slide])=>slide).slice(5);
  for(const slide of integrationSlides) {
    assert.doesNotMatch(slide,/Coming soon|not enabled yet/i);
    assert.match(slide,/Contact us to discuss your setup/);
  }
});

test("each hero feature coordinates whole-dashboard and text entrances and exits without intersecting content layers", async () => {
  const css = await readFile("src/public/marketing.css", "utf8");
  assert.match(renderHome(), /class="m-hs-scene"/);
   for(let i=0;i<7;i++) {
    assert.ok(css.includes(`.m-hero[data-hs-out="${i}"] { --so:`));
    assert.ok(css.includes(`.m-hero[data-hs-in="${i}"] { --si:`));
  }
  assert.match(css,/\.m-hero\.m-section-active\.is-exit \.m-hs-scene \{ animation: m-hs-out \.7s/);
  assert.match(css,/\.m-hero\.m-section-active\.is-enter \.m-hs-scene \{ animation: m-hs-in 1\.1s/);
  assert.match(css,/@keyframes m-copy-out/);
  assert.match(css,/@keyframes m-copy-in/);
  assert.doesNotMatch(css,/@keyframes m-hs-sway|@keyframes m-fly-\d/);
  assert.match(css,/@media \(max-width: 600px\) \{ \.m-hero \{ --d: \.36; --r: \.55;/);
});

test("hero slides advance, wrap, select and pause; autoplay respects visibility and motion preferences", async () => {
  const source = await readFile("src/public/marketing.js", "utf8");
  const functionSource = source.slice(source.indexOf("  function initializeHeroStory()"), source.indexOf("  function setNavTone()"));
  function node() {
    const classes = new Set();
    return { hidden:false, attrs:{}, events:{}, textContent:"", classList:{
      add(name){classes.add(name);},
      remove(name){classes.delete(name);},
      contains(name){return classes.has(name);},
      toggle(name,on){if(on)classes.add(name);else classes.delete(name);},
    },setAttribute(name,value){this.attrs[name]=value;},getAttribute(name){return this.attrs[name];},removeAttribute(name){delete this.attrs[name];},
    addEventListener(name,fn){this.events[name]=fn;} };
  }
  const slides = Array.from({length:7},node), tabs = Array.from({length:7},node);
  slides.forEach((slide,i)=>{
    slide.attrs["aria-label"]=`${i+1} of 7: Feature ${i+1}`;
    slide.attrs["data-hs-line"]=`Sentence ${i+1}`;
  });
  const toggle=node(), prev=node(), next=node(), live=node(), hero=node(), story=node();
  const line=node(),scene=node(),observers=[];
  story.parentElement=scene;
  hero.classList.add("m-section-active");
  story.closest=()=>hero;
  story.querySelectorAll=(selector)=>selector==="[data-hs-slide]" ? slides : tabs;
  story.querySelector=(selector)=>({"[data-hs-toggle]":toggle,"[data-hs-prev]":prev,"[data-hs-next]":next,"[data-hs-live]":live})[selector];
  const document={...node(),documentElement:node(),hidden:false,querySelector:(selector)=>selector==="[data-hero-line]" ? line : story}, motionPreference={...node(),matches:false};
  const context={document,root:document.documentElement,motionPreference,motionDisabled:false,MutationObserver:class {
    constructor(callback){observers.push(callback);} observe(){}
  }};
  runInNewContext(`${functionSource}\ninitializeHeroStory();`,context);
  const active=()=>slides.findIndex((slide)=>!slide.hidden);
  const end=(name)=>scene.events.animationend({animationName:name,target:scene});
  const settle=()=>{end("m-hs-out");end("m-hs-in");};
  const finish=()=>{story.events.animationend({animationName:"m-hs-progress"});settle();};
  assert.equal(active(),0);
  assert.equal(line.textContent,"Sentence 1");
  story.events.animationend({animationName:"m-hs-progress"});
  assert.equal(active(),0,"Outgoing slide must remain until its exit completes");
  assert.equal(line.textContent,"Sentence 1");
  assert.equal(hero.attrs["data-hs-out"],"0");
  story.events.animationend({animationName:"m-hs-progress"});
  scene.events.animationend({animationName:"m-hs-out",target:story});
  assert.equal(active(),0,"Bubbled detail animations must not complete a scene exit");
  end("m-hs-out");
  assert.equal(active(),1);
  assert.ok(hero.classList.contains("is-enter"));
  end("m-hs-in");
  assert.ok(!hero.classList.contains("is-enter"));
  assert.equal(line.textContent,"Sentence 2","The left-side sentence follows autoplay");
  assert.equal(live.textContent,"","Automatic slides must not repeatedly announce themselves");
  prev.events.click();settle();assert.equal(active(),0);
  prev.events.click();settle();assert.equal(active(),6);
  assert.equal(line.textContent,"Sentence 7","The left-side sentence follows manual selection");
  tabs[2].events.click();settle();assert.equal(active(),2);
  assert.match(live.textContent,/Feature 3/);
  toggle.events.click();assert.equal(toggle.textContent,"Play");finish();assert.equal(active(),2);
  assert.ok(document.documentElement.classList.contains("m-fx-paused"), "hero pause also freezes scroll-reveal motion");
  toggle.events.click();assert.equal(toggle.textContent,"Pause");finish();assert.equal(active(),3);
  assert.ok(!document.documentElement.classList.contains("m-fx-paused"), "playing restores scroll-reveal motion");
  document.hidden=true;finish();assert.equal(active(),3);document.hidden=false;
  hero.classList.toggle("m-section-active",false);finish();assert.equal(active(),3);
  hero.classList.add("m-section-active");motionPreference.matches=true;finish();assert.equal(active(),3);
  motionPreference.matches=false;context.motionDisabled=true;finish();assert.equal(active(),3);
  tabs[6].events.click();assert.equal(active(),6);
  next.events.click();assert.equal(active(),0,"Manual controls still work with motion disabled");
  context.motionDisabled=false;
  tabs[4].events.click();
  toggle.events.click();
  assert.equal(active(),4,"Pause mid-exit resolves to a readable selected slide");
  assert.ok(!hero.classList.contains("is-exit"));
  tabs[1].events.click();
  assert.equal(active(),1,"Manual selection while paused is immediate");
  toggle.events.click();
  next.events.click();
  document.hidden=true;document.events.visibilitychange();
  assert.equal(active(),2,"Hidden-tab interruption cannot leave a vanished dashboard");
  document.hidden=false;
  next.events.click();
  motionPreference.matches=true;motionPreference.events.change();
  assert.equal(active(),3);
  motionPreference.matches=false;
  next.events.click();hero.classList.remove("m-section-active");observers[0]();
  assert.equal(active(),4,"Offscreen interruption resolves without animationcancel");
  hero.classList.add("m-section-active");
  next.events.click();
  scene.events.animationcancel({animationName:"m-hs-out",target:scene});
  assert.equal(active(),5);
  next.events.click();end("m-hs-out");
  scene.events.animationcancel({animationName:"m-hs-in",target:scene});
  assert.equal(active(),6);
  assert.ok(!hero.classList.contains("is-enter"));
  next.events.click();settle();assert.equal(active(),0,"The seventh scene wraps back to the storefront");
});
test("hero begins with desktop and phone storefronts, without a duplicate showcase or floating square icons",async()=>{
  const html=renderHome(),hero=html.match(/<section class="m-hero"[\s\S]*?<\/section>/)[0];
  const scenes=[...hero.matchAll(/<article\b[^>]*data-hs-slide\b[^>]*>[\s\S]*?<\/article>/g)].map(([scene])=>scene);
  assert.match(scenes[0],/m-hs-slide-store is-active/);
  assert.match(scenes[0],/m-hs-store-desktop/);assert.match(scenes[0],/m-hs-store-phone/);
  assert.match(scenes[1],/Catalogue and collections/);
  assert.equal((hero.match(/data-hs-tab="\d"/g)||[]).length,7);
  assert.doesNotMatch(html,/id="showcase"|Example Studio, imagined|class="m-chip/);
  assert.doesNotMatch(html,/coming soon|only payment option|Cash on Delivery is available today/i);
});
test("platform-owned homepage and store-page copy omit deferred-payment disclaimers",async()=>{
  for(const file of ["src/ui/marketing.js","src/ui/platform-seo.js","src/ui/dashboard.js","src/ui/invoice.js","src/index.js","src/public/wizard.js","src/public/validation.js","src/public/commerce.js","src/public/commerce-view.js"]){
    assert.doesNotMatch(await readFile(file,"utf8"),/coming\s+soon|only payment option|Cash on Delivery is available today/i,file);
  }
});

test("transparent hero logo exists and is served by the production asset allowlist", async () => {
  const path="/img/REPLACE-lebrands-hero-transparent.png";
  const bytes=await readFile(`src/public${path}`);
  assert.equal(bytes[25],6,"The PNG must retain its RGBA transparency channel");
  assert.ok(bytes.length<200000,"The header logo stays lightweight");
  let fetched="";
  const response=await worker.fetch(new Request(`https://lebrands.store${path}`),{
    ASSETS:{fetch(request){fetched=new URL(request.url).pathname;return new Response(bytes,{headers:{"content-type":"image/png"}});}}
  },{});
  assert.equal(response.status,200);
  assert.equal(fetched,path);
  assert.equal(response.headers.get("content-type"),"image/png");
});
